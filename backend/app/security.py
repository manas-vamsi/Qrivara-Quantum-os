"""Authentication + per-project authorization.

DEV MODE (no `supabase_jwt_secret`): the current user is resolved from the
`X-Dev-User-Id` header so the frontend "Act as" switcher can impersonate any
seeded user and exercise the real sharing/visibility rules. Falls back to the
first seeded user when the header is absent.

PRODUCTION: set `supabase_jwt_secret`, then verify the `Authorization: Bearer`
JWT here and look up/provision the user. Only this resolution changes — every
authorization helper below stays identical, so the access model never weakens.
"""
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import (
    Design,
    Project,
    ProjectGrant,
    SimulationJob,
    Team,
    TeamMember,
    User,
)

# Role hierarchy for "at least this role" checks.
ROLE_RANK = {"viewer": 1, "commenter": 2, "editor": 3, "owner": 4}


def _user_team_ids(user: User, session: Session) -> list[str]:
    """Team ids the user belongs to (for team-scoped project grants)."""
    return list(
        session.exec(
            select(TeamMember.team_id).where(TeamMember.user_id == user.id)
        ).all()
    )


def get_current_user(
    session: Session = Depends(get_session),
    x_dev_user_id: Optional[str] = Header(default=None),
) -> User:
    if settings.supabase_jwt_secret:
        # PRODUCTION: verify the JWT and resolve the user. Intentionally not
        # implemented in this demo build — wire Supabase here.
        raise HTTPException(status_code=501, detail="JWT auth not configured")

    # DEV: honor the impersonation header when it points at a real user.
    if x_dev_user_id:
        user = session.get(User, x_dev_user_id)
        if user:
            return user
    user = session.exec(select(User).order_by(User.created_at)).first()
    if not user:
        raise HTTPException(status_code=401, detail="No user found — seed the database.")
    return user


# --------------------------------------------------------------------------- #
# Authorization                                                                #
# --------------------------------------------------------------------------- #

def user_project_role(project: Project, user: User, session: Session) -> Optional[str]:
    """The effective role of `user` on `project`, or None if no access.

    Returns the highest of: owner (creator), an explicit user grant, or the
    implicit "viewer" granted by org/link/public visibility.
    """
    if project.created_by and project.created_by == user.id:
        return "owner"

    grant = session.exec(
        select(ProjectGrant).where(
            ProjectGrant.project_id == project.id,
            ProjectGrant.subject_type == "user",
            ProjectGrant.subject_id == user.id,
        )
    ).first()
    grant_role = grant.role if grant else None

    # Team grants: the user inherits the highest role granted to any of their teams.
    # Defense-in-depth: only honor a team grant if the team is in the project
    # owner's org, so a stray cross-org grant can never widen access.
    team_ids = _user_team_ids(user, session)
    team_role: Optional[str] = None
    if team_ids:
        owner = session.get(User, project.created_by) if project.created_by else None
        owner_org = owner.org if owner else None
        for g in session.exec(
            select(ProjectGrant).where(
                ProjectGrant.project_id == project.id,
                ProjectGrant.subject_type == "team",
                ProjectGrant.subject_id.in_(team_ids),
            )
        ).all():
            team = session.get(Team, g.subject_id)
            if owner_org is not None and (not team or team.org != owner_org):
                continue
            if team_role is None or ROLE_RANK.get(g.role, 0) > ROLE_RANK.get(team_role, 0):
                team_role = g.role

    implicit: Optional[str] = None
    if project.visibility in ("link", "public"):
        implicit = "viewer"
    elif project.visibility == "org":
        owner = session.get(User, project.created_by) if project.created_by else None
        if owner and owner.org and owner.org == user.org:
            implicit = "viewer"

    # Pick whichever grants the most access.
    best = None
    for r in (grant_role, team_role, implicit):
        if r and (best is None or ROLE_RANK.get(r, 0) > ROLE_RANK.get(best, 0)):
            best = r
    return best


def can_access(project: Project, user: User, session: Session) -> bool:
    return user_project_role(project, user, session) is not None


def visible_project_ids(user: User, session: Session) -> set[str]:
    """All project ids the user may at least view — for list filtering."""
    ids: set[str] = set()
    # Owned
    for pid in session.exec(
        select(Project.id).where(Project.created_by == user.id)
    ).all():
        ids.add(pid)
    # Explicitly granted to the user
    for pid in session.exec(
        select(ProjectGrant.project_id).where(
            ProjectGrant.subject_type == "user",
            ProjectGrant.subject_id == user.id,
        )
    ).all():
        ids.add(pid)
    # Granted to a team the user belongs to
    team_ids = _user_team_ids(user, session)
    if team_ids:
        for pid in session.exec(
            select(ProjectGrant.project_id).where(
                ProjectGrant.subject_type == "team",
                ProjectGrant.subject_id.in_(team_ids),
            )
        ).all():
            ids.add(pid)
    # Visibility-based (link/public for everyone; org for same-org owners)
    for p in session.exec(
        select(Project).where(Project.visibility.in_(("org", "link", "public")))
    ).all():
        if can_access(p, user, session):
            ids.add(p.id)
    return ids


def require_project_role(
    project_id: str, user: User, session: Session, min_role: str = "viewer"
) -> Project:
    """Load a project and assert the user has at least `min_role`, else 403/404."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    role = user_project_role(project, user, session)
    if role is None:
        # Invisible, not "denied" — don't reveal the project exists.
        raise HTTPException(404, "Project not found")
    if ROLE_RANK.get(role, 0) < ROLE_RANK.get(min_role, 0):
        raise HTTPException(403, f"Requires {min_role} access")
    return project


def require_design_role(
    design_id: str, user: User, session: Session, min_role: str = "viewer"
) -> Design:
    """Load a design and assert access via its parent project."""
    design = session.get(Design, design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    require_project_role(design.project_id, user, session, min_role)
    return design


def require_job_role(
    job_id: str, user: User, session: Session, min_role: str = "viewer"
) -> SimulationJob:
    """Load a simulation job and assert access via its design's project."""
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    require_design_role(job.design_id, user, session, min_role)
    return job
