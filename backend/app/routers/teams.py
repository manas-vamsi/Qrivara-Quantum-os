"""Teams: named groups within an org. A project shared with a team grants access
to every member (see security.user_project_role team-grant handling)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import ProjectGrant, Team, TeamMember, User
from ..security import get_current_user

router = APIRouter(prefix="/teams", tags=["teams"])


def _member_role(team_id: str, user_id: str, session: Session) -> str | None:
    m = session.exec(
        select(TeamMember).where(
            TeamMember.team_id == team_id, TeamMember.user_id == user_id
        )
    ).first()
    return m.role if m else None


def _member_user(u: User | None) -> dict | None:
    if not u:
        return None
    return {"id": u.id, "name": u.name, "handle": u.handle, "role": u.role, "org": u.org}


def _team_view(team: Team, user: User, session: Session) -> dict:
    members = session.exec(
        select(TeamMember).where(TeamMember.team_id == team.id)
    ).all()
    my_role = next((m.role for m in members if m.user_id == user.id), None)
    return {
        "id": team.id, "name": team.name, "description": team.description,
        "org": team.org, "member_count": len(members),
        "my_role": my_role, "is_member": my_role is not None,
        "members": [
            {**(_member_user(session.get(User, m.user_id)) or {}), "team_role": m.role}
            for m in members
        ],
        "created_at": team.created_at,
    }


@router.get("")
def list_teams(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Teams in the caller's org (membership flagged per team)."""
    rows = session.exec(
        select(Team).where(Team.org == user.org).order_by(Team.created_at)
    ).all()
    return [_team_view(t, user, session) for t in rows]


@router.post("", status_code=201)
def create_team(
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "Team name is required")
    team = Team(
        org=user.org, name=name,
        description=(body.get("description") or "").strip(), created_by=user.id,
    )
    session.add(team)
    session.commit()
    session.refresh(team)
    # Creator becomes the team lead.
    session.add(TeamMember(team_id=team.id, user_id=user.id, role="lead"))
    session.commit()
    return _team_view(team, user, session)


@router.get("/{team_id}")
def get_team(
    team_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    team = session.get(Team, team_id)
    if not team or team.org != user.org:
        raise HTTPException(404, "Team not found")
    return _team_view(team, user, session)


@router.post("/{team_id}/members", status_code=201)
def add_member(
    team_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    team = session.get(Team, team_id)
    if not team or team.org != user.org:
        raise HTTPException(404, "Team not found")
    if _member_role(team_id, user.id, session) != "lead":
        raise HTTPException(403, "Only a team lead can add members")
    target_id = body.get("user_id")
    target = session.get(User, target_id) if target_id else None
    if not target:
        raise HTTPException(404, "User not found")
    if target.org != team.org:
        raise HTTPException(422, "User is not in this organization")
    if not _member_role(team_id, target.id, session):
        session.add(TeamMember(team_id=team_id, user_id=target.id,
                               role=body.get("role") or "member"))
        session.commit()
    return _team_view(team, user, session)


@router.delete("/{team_id}/members/{member_id}", status_code=204)
def remove_member(
    team_id: str,
    member_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    team = session.get(Team, team_id)
    if not team:
        return
    # A lead can remove anyone; a member can remove themselves (leave).
    if user.id != member_id and _member_role(team_id, user.id, session) != "lead":
        raise HTTPException(403, "Only a team lead can remove members")
    m = session.exec(
        select(TeamMember).where(
            TeamMember.team_id == team_id, TeamMember.user_id == member_id
        )
    ).first()
    if m:
        session.delete(m)
        session.commit()


@router.delete("/{team_id}", status_code=204)
def delete_team(
    team_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    team = session.get(Team, team_id)
    if not team:
        return
    if team.created_by != user.id and _member_role(team_id, user.id, session) != "lead":
        raise HTTPException(403, "Only the team lead can delete the team")
    for m in session.exec(select(TeamMember).where(TeamMember.team_id == team_id)).all():
        session.delete(m)
    # Drop team-scoped project grants so they don't dangle.
    for g in session.exec(
        select(ProjectGrant).where(
            ProjectGrant.subject_type == "team", ProjectGrant.subject_id == team_id
        )
    ).all():
        session.delete(g)
    # Commit children before the parent so the delete order is deterministic and
    # never trips the team_id FK on a DB without ON DELETE CASCADE.
    session.commit()
    session.delete(team)
    session.commit()
