"""Collaboration module API: profiles, sharing (grants), connections, notifications.

The sharing endpoints are the heart of the module — a grant is what makes a
private project visible to another user. Every share/role-change/connection event
also drops an actionable notification into the recipient's inbox.
"""
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, or_, select

from ..config import settings
from ..db import get_session
from ..models import Connection, Notification, Project, ProjectGrant, Team, User

ONLINE_WINDOW = timedelta(minutes=2)


def _is_online(u: User) -> bool:
    if not u.last_seen:
        return False
    ls = u.last_seen if u.last_seen.tzinfo else u.last_seen.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ls) < ONLINE_WINDOW
from ..schemas import (
    VALID_ROLES,
    VALID_VISIBILITY,
    ConnectionCreate,
    GrantCreate,
    GrantUpdate,
    VisibilityUpdate,
)
from ..security import (
    ROLE_RANK,
    get_current_user,
    require_project_role,
    user_project_role,
)

router = APIRouter(tags=["collaboration"])


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _public_user(u: User, *, include_email: bool = False) -> dict:
    # Email is PII — only exposed to the user themselves and to a project owner
    # managing access (grant views), never in the open people directory.
    out = {
        "id": u.id, "name": u.name, "role": u.role,
        "org": u.org, "handle": u.handle, "headline": u.headline,
        "bio": u.bio, "institution": u.institution,
        "online": _is_online(u),
    }
    if include_email:
        out["email"] = u.email
    return out


def notify(
    session: Session, *, user_id: str, type: str, actor: User | None, payload: dict
) -> None:
    """Create a notification — unless the recipient is the actor (no self-notify)."""
    if actor and actor.id == user_id:
        return
    session.add(
        Notification(
            user_id=user_id, type=type,
            actor_id=actor.id if actor else None,
            payload=payload,
        )
    )


def _grant_view(g: ProjectGrant, session: Session) -> dict:
    u = session.get(User, g.subject_id) if g.subject_type == "user" else None
    team = session.get(Team, g.subject_id) if g.subject_type == "team" else None
    return {
        "id": g.id, "project_id": g.project_id, "role": g.role,
        "subject_type": g.subject_type, "subject_id": g.subject_id,
        # Owner is managing access here, so email is appropriate.
        "user": _public_user(u, include_email=True) if u else None,
        "team": ({"id": team.id, "name": team.name} if team else None),
        "created_at": g.created_at,
    }


# --------------------------------------------------------------------------- #
# Users / profiles                                                            #
# --------------------------------------------------------------------------- #

@router.get("/users")
def list_users(
    q: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """People search (`q`) or, in dev only, the full roster for the 'Act as'
    switcher. Never returns emails; honors the `discoverable` opt-out in search.
    """
    rows = session.exec(select(User).order_by(User.created_at)).all()
    if q:
        ql = q.lower()
        rows = [
            u for u in rows
            if (u.discoverable or u.id == user.id)
            and (ql in u.name.lower() or ql in (u.handle or "").lower())
        ]
    elif settings.supabase_jwt_secret:
        # Prod: no open directory dump — return just the caller.
        rows = [user]
    # else: dev mode → full roster so the impersonation switcher works.
    return [_public_user(u) for u in rows]


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # Only the projects this viewer is allowed to see (owned by target).
    owned = session.exec(
        select(Project).where(Project.created_by == user_id)
    ).all()
    visible = []
    for p in owned:
        role = user_project_role(p, user, session)
        if role is not None:
            visible.append({
                "id": p.id, "name": p.name, "description": p.description,
                "qubits": p.qubits, "status": p.status, "your_role": role,
            })
    return {**_public_user(target), "projects": visible}


# --------------------------------------------------------------------------- #
# Sharing — project grants                                                     #
# --------------------------------------------------------------------------- #

@router.get("/projects/{project_id}/grants")
def list_grants(
    project_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = require_project_role(project_id, user, session, "viewer")
    grants = session.exec(
        select(ProjectGrant).where(ProjectGrant.project_id == project_id)
    ).all()
    out = [_grant_view(g, session) for g in grants]
    # Synthesize the owner row (owners have no explicit grant).
    owner = session.get(User, project.created_by) if project.created_by else None
    if owner:
        out.insert(0, {
            "id": "owner", "project_id": project_id, "role": "owner",
            "subject_type": "user", "subject_id": owner.id,
            "user": _public_user(owner), "created_at": project.created_at,
        })
    return {"visibility": project.visibility, "grants": out}


@router.post("/projects/{project_id}/grants", status_code=201)
def add_grant(
    project_id: str,
    body: GrantCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Only the owner manages who has access (and may invite by email). This
    # prevents an editor from minting other editors or escalating roles.
    project = require_project_role(project_id, user, session, "owner")
    if body.role not in VALID_ROLES or body.role == "owner":
        # Ownership transfer is a separate, deliberate action — not via "share".
        raise HTTPException(422, "Invalid role")

    # Team share: grant to a whole team (every member inherits the role).
    if body.team_id:
        team = session.get(Team, body.team_id)
        # Org-scoped: you can only share with teams in your own organization,
        # otherwise a foreign-org team's members would inherit access.
        if not team or team.org != user.org:
            raise HTTPException(404, "Team not found")
        existing_t = session.exec(
            select(ProjectGrant).where(
                ProjectGrant.project_id == project_id,
                ProjectGrant.subject_type == "team",
                ProjectGrant.subject_id == team.id,
            )
        ).first()
        if existing_t:
            existing_t.role = body.role
            grant_t = existing_t
        else:
            grant_t = ProjectGrant(
                project_id=project_id, subject_type="team", subject_id=team.id,
                role=body.role, granted_by=user.id,
            )
            session.add(grant_t)
        session.commit()
        session.refresh(grant_t)
        return _grant_view(grant_t, session)

    # Resolve subject: existing user by id, by email, or invite a shell user.
    target: User | None = None
    if body.user_id:
        target = session.get(User, body.user_id)
    elif body.email:
        email = body.email.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise HTTPException(422, "Invalid email address")
        target = session.exec(select(User).where(User.email == email)).first()
        if not target:
            target = User(email=email, name=email.split("@")[0],
                          role="Invited", org=user.org)
            session.add(target)
            session.commit()
            session.refresh(target)
    if not target:
        raise HTTPException(404, "User to share with not found")
    if target.id == project.created_by:
        raise HTTPException(409, "That user already owns this project")

    existing = session.exec(
        select(ProjectGrant).where(
            ProjectGrant.project_id == project_id,
            ProjectGrant.subject_type == "user",
            ProjectGrant.subject_id == target.id,
        )
    ).first()
    if existing:
        existing.role = body.role
        grant = existing
    else:
        grant = ProjectGrant(
            project_id=project_id, subject_type="user", subject_id=target.id,
            role=body.role, granted_by=user.id,
        )
        session.add(grant)

    # Keep the legacy display-names list in sync (used by existing avatar groups).
    names = list(project.collaborators or [])
    if target.name not in names:
        names.append(target.name)
        project.collaborators = names
        session.add(project)

    # First grant => "shared with you"; re-grant on an existing one => role change.
    notify(
        session, user_id=target.id,
        type="role_changed" if existing else "project_shared", actor=user,
        payload={
            "project_id": project.id, "project_name": project.name,
            "role": body.role, "actor_name": user.name,
        },
    )
    session.commit()
    session.refresh(grant)
    return _grant_view(grant, session)


@router.patch("/projects/{project_id}/grants/{grant_id}")
def update_grant(
    project_id: str,
    grant_id: str,
    body: GrantUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    require_project_role(project_id, user, session, "owner")
    if body.role not in VALID_ROLES or body.role == "owner":
        raise HTTPException(422, "Invalid role")
    grant = session.get(ProjectGrant, grant_id)
    if not grant or grant.project_id != project_id:
        raise HTTPException(404, "Grant not found")
    grant.role = body.role
    session.add(grant)
    project = session.get(Project, project_id)
    # Only notify a concrete user; team grants have no single recipient.
    if grant.subject_type == "user":
        notify(
            session, user_id=grant.subject_id, type="role_changed", actor=user,
            payload={
                "project_id": project_id,
                "project_name": project.name if project else "",
                "role": body.role, "actor_name": user.name,
            },
        )
    session.commit()
    session.refresh(grant)
    return _grant_view(grant, session)


@router.delete("/projects/{project_id}/grants/{grant_id}", status_code=204)
def delete_grant(
    project_id: str,
    grant_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    require_project_role(project_id, user, session, "owner")
    grant = session.get(ProjectGrant, grant_id)
    if not grant or grant.project_id != project_id:
        return
    target = session.get(User, grant.subject_id)
    project = session.get(Project, project_id)
    if target and project:
        names = [n for n in (project.collaborators or []) if n != target.name]
        project.collaborators = names
        session.add(project)
    session.delete(grant)
    session.commit()


@router.patch("/projects/{project_id}/visibility")
def set_visibility(
    project_id: str,
    body: VisibilityUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = require_project_role(project_id, user, session, "owner")
    if body.visibility not in VALID_VISIBILITY:
        raise HTTPException(422, "Invalid visibility")
    project.visibility = body.visibility
    project.updated_at = datetime.now(timezone.utc)
    session.add(project)
    session.commit()
    session.refresh(project)
    return {"id": project.id, "visibility": project.visibility}


@router.get("/shared-with-me")
def shared_with_me(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Projects explicitly granted to me (i.e. not my own)."""
    grants = session.exec(
        select(ProjectGrant).where(
            ProjectGrant.subject_type == "user",
            ProjectGrant.subject_id == user.id,
        )
    ).all()
    out = []
    for g in grants:
        p = session.get(Project, g.project_id)
        if not p or p.created_by == user.id:
            continue
        owner = session.get(User, p.created_by) if p.created_by else None
        out.append({
            "id": p.id, "name": p.name, "description": p.description,
            "qubits": p.qubits, "status": p.status, "progress": p.progress,
            "updated_at": p.updated_at, "your_role": g.role,
            "owner": _public_user(owner) if owner else None,
        })
    return out


# --------------------------------------------------------------------------- #
# Connections (social graph)                                                   #
# --------------------------------------------------------------------------- #

@router.get("/connections")
def list_connections(
    status: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Connection).where(
            or_(
                Connection.requester_id == user.id,
                Connection.addressee_id == user.id,
            )
        )
    ).all()
    out = []
    for c in rows:
        if status and c.status != status:
            continue
        other_id = c.addressee_id if c.requester_id == user.id else c.requester_id
        other = session.get(User, other_id)
        out.append({
            "id": c.id, "status": c.status,
            "direction": "outgoing" if c.requester_id == user.id else "incoming",
            "user": _public_user(other) if other else None,
            "created_at": c.created_at,
        })
    return out


@router.post("/connections", status_code=201)
def request_connection(
    body: ConnectionCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if body.addressee_id == user.id:
        raise HTTPException(409, "You cannot connect with yourself")
    other = session.get(User, body.addressee_id)
    if not other:
        raise HTTPException(404, "User not found")
    # Existing edge in either direction?
    existing = session.exec(
        select(Connection).where(
            or_(
                (Connection.requester_id == user.id)
                & (Connection.addressee_id == body.addressee_id),
                (Connection.requester_id == body.addressee_id)
                & (Connection.addressee_id == user.id),
            )
        )
    ).first()
    if existing:
        # If they already requested us, this accepts it.
        if existing.status == "pending" and existing.addressee_id == user.id:
            existing.status = "accepted"
            existing.responded_at = datetime.now(timezone.utc)
            session.add(existing)
            notify(session, user_id=existing.requester_id,
                   type="connection_accepted", actor=user,
                   payload={"actor_name": user.name})
            session.commit()
            session.refresh(existing)
            return {"id": existing.id, "status": existing.status}
        raise HTTPException(409, "Connection already exists")

    conn = Connection(requester_id=user.id, addressee_id=body.addressee_id)
    session.add(conn)
    notify(session, user_id=body.addressee_id, type="connection_request",
           actor=user, payload={"actor_name": user.name})
    session.commit()
    session.refresh(conn)
    return {"id": conn.id, "status": conn.status}


@router.post("/connections/{conn_id}/accept")
def accept_connection(
    conn_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conn = session.get(Connection, conn_id)
    if not conn or conn.addressee_id != user.id:
        raise HTTPException(404, "Request not found")
    conn.status = "accepted"
    conn.responded_at = datetime.now(timezone.utc)
    session.add(conn)
    notify(session, user_id=conn.requester_id, type="connection_accepted",
           actor=user, payload={"actor_name": user.name})
    session.commit()
    session.refresh(conn)
    return {"id": conn.id, "status": conn.status}


@router.post("/connections/{conn_id}/decline", status_code=204)
def decline_connection(
    conn_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conn = session.get(Connection, conn_id)
    # Silent decline (LinkedIn-style): just remove the edge.
    if conn and user.id in (conn.requester_id, conn.addressee_id):
        session.delete(conn)
        session.commit()


# --------------------------------------------------------------------------- #
# Notifications                                                                #
# --------------------------------------------------------------------------- #

@router.get("/notifications")
def list_notifications(
    limit: int = Query(default=30, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    ).all()
    out = []
    for n in rows:
        actor = session.get(User, n.actor_id) if n.actor_id else None
        out.append({
            "id": n.id, "type": n.type, "read": n.read,
            "payload": n.payload, "created_at": n.created_at,
            "actor": _public_user(actor) if actor else None,
        })
    return out


@router.get("/notifications/unread-count")
def unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read == False  # noqa: E712
        )
    ).all()
    return {"count": len(rows)}


@router.post("/notifications/{notif_id}/read")
def mark_read(
    notif_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    n = session.get(Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read = True
    session.add(n)
    session.commit()
    return {"id": n.id, "read": True}


@router.post("/notifications/read-all")
def mark_all_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read == False  # noqa: E712
        )
    ).all()
    for n in rows:
        n.read = True
        session.add(n)
    session.commit()
    return {"updated": len(rows)}


# --------------------------------------------------------------------------- #
# Presence (light heartbeat)                                                   #
# --------------------------------------------------------------------------- #

@router.post("/presence/ping")
def presence_ping(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The frontend calls this on a timer; `last_seen` drives the online dot."""
    user.last_seen = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    return {"ok": True}
