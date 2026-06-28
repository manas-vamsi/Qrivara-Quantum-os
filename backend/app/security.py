"""Authentication + per-project authorization.

DEV MODE (no `supabase_jwt_secret`): the current user is resolved from the
`X-Dev-User-Id` header so the frontend "Act as" switcher can impersonate any
seeded user and exercise the real sharing/visibility rules. Falls back to the
first seeded user when the header is absent.

PRODUCTION: set `supabase_jwt_secret`, then verify the `Authorization: Bearer`
JWT here and look up/provision the user. Only this resolution changes — every
authorization helper below stays identical, so the access model never weakens.
"""
import base64
import hashlib
import hmac
import json
import time
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


# --------------------------------------------------------------------------- #
# Supabase JWT verification (production)                                       #
# --------------------------------------------------------------------------- #
def _b64url_decode(seg: str) -> bytes:
    """Decode a base64url segment, restoring padding."""
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def verify_supabase_jwt(token: str, secret: str) -> dict:
    """Verify a Supabase HS256 JWT with the project secret and return its claims.

    Pure stdlib (HMAC-SHA256) — no external dependency. Enforces:
      • exactly three segments,
      • alg == HS256 (rejects 'none' and asymmetric-alg confusion attacks),
      • a constant-time signature match,
      • expiry (exp) and not-before (nbf) when present.
    Raises HTTPException(401) on any failure. Symmetric verification matches
    Supabase's legacy JWT-secret model; JWKS/RS256 would be a drop-in extension here.
    """
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
    except ValueError:
        raise HTTPException(401, "Malformed token")
    try:
        header = json.loads(_b64url_decode(header_b64))
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Malformed token header")
    if header.get("alg") != "HS256":
        raise HTTPException(401, "Unsupported token algorithm")

    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    try:
        provided = _b64url_decode(sig_b64)
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Malformed token signature")
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(401, "Invalid token signature")

    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Malformed token payload")
    now = int(time.time())
    if "exp" in claims and now >= int(claims["exp"]):
        raise HTTPException(401, "Token expired")
    if "nbf" in claims and now < int(claims["nbf"]):
        raise HTTPException(401, "Token not yet valid")
    if not claims.get("sub"):
        raise HTTPException(401, "Token missing subject")
    return claims


def _email_domain_allowed(email: str) -> bool:
    """Per-tenant licensing gate: when `allowed_email_domains` is set (e.g. a single
    university's instance), only emails in those domains may sign in. Empty = open."""
    allowed = [d.strip().lower() for d in settings.allowed_email_domains if d.strip()]
    if not allowed:
        return True
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    return domain in allowed


def _user_from_claims(claims: dict, session: Session) -> User:
    """Look up the User for a verified token, provisioning one on first sign-in.
    Matches by Supabase user id (sub), then email. Enforces the tenant email-domain
    allowlist so a licensed instance only admits that organization's accounts."""
    sub = str(claims["sub"])
    email = (claims.get("email") or "").strip().lower()
    if not _email_domain_allowed(email):
        # 403, not 401: the token is valid, the account is just not licensed here.
        raise HTTPException(
            403,
            "This QRIVARA instance is restricted to "
            + ", ".join(settings.allowed_email_domains) + " accounts.",
        )
    user = session.get(User, sub)
    if user:
        return user
    if email:
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            return user
    # First sign-in → provision a minimal account keyed to the Supabase id.
    name = (email.split("@")[0] if email else "User").replace(".", " ").title()
    user = User(id=sub, email=email or f"{sub}@users.noreply", name=name or "User")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


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
    authorization: Optional[str] = Header(default=None),
) -> User:
    if settings.supabase_jwt_secret:
        # PRODUCTION: verify the Supabase Bearer JWT and resolve/provision the user.
        # The dev impersonation header is ignored here, so it can never widen access.
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")
        token = authorization.split(" ", 1)[1].strip()
        claims = verify_supabase_jwt(token, settings.supabase_jwt_secret)
        return _user_from_claims(claims, session)

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
