from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    Activity,
    Design,
    DesignVersion,
    OptimizationRun,
    Project,
    ProjectGrant,
    SimulationJob,
    User,
)
from ..schemas import ProjectCreate, ProjectUpdate
from ..security import (
    get_current_user,
    require_project_role,
    visible_project_ids,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Only projects the current user can at least view — private projects of
    # other users are invisible, not "denied".
    visible = visible_project_ids(user, session)
    rows = session.exec(select(Project).order_by(Project.updated_at.desc())).all()
    return [p for p in rows if p.id in visible]


@router.post("", status_code=201)
def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    p = Project(**body.model_dump(), created_by=user.id, collaborators=[user.name])
    session.add(p)
    session.commit()
    session.refresh(p)
    # New projects start with a CLEAN, empty canvas — the user builds from scratch.
    session.add(Design(project_id=p.id, name="main", doc={"nodes": [], "edges": []}))
    session.add(Activity(actor=user.name, action="created", target=p.name, type="design"))
    session.commit()
    session.refresh(p)  # reload after commit so the response isn't empty
    return p


@router.get("/{project_id}/designs")
def project_designs(
    project_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    require_project_role(project_id, user, session, "viewer")
    return session.exec(select(Design).where(Design.project_id == project_id)).all()


@router.get("/{project_id}")
def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return require_project_role(project_id, user, session, "viewer")


@router.patch("/{project_id}")
def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    p = require_project_role(project_id, user, session, "editor")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    p = require_project_role(project_id, user, session, "owner")
    # Remove dependent rows first so the delete neither orphans data nor trips an
    # FK error on a database whose constraints predate ON DELETE CASCADE. Children
    # are committed before the parent so deletion order is deterministic.
    design_ids = list(
        session.exec(select(Design.id).where(Design.project_id == project_id)).all()
    )
    if design_ids:
        for job in session.exec(
            select(SimulationJob).where(SimulationJob.design_id.in_(design_ids))
        ).all():
            session.delete(job)
        for ver in session.exec(
            select(DesignVersion).where(DesignVersion.design_id.in_(design_ids))
        ).all():
            session.delete(ver)
        # Standalone optimizer runs survive — just detach from the design.
        for run in session.exec(
            select(OptimizationRun).where(OptimizationRun.design_id.in_(design_ids))
        ).all():
            run.design_id = None
            session.add(run)
        for d in session.exec(select(Design).where(Design.project_id == project_id)).all():
            session.delete(d)
    for grant in session.exec(
        select(ProjectGrant).where(ProjectGrant.project_id == project_id)
    ).all():
        session.delete(grant)
    session.commit()          # children gone first
    session.delete(p)
    session.commit()


@router.post("/{project_id}/bookmark")
def toggle_bookmark(
    project_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    p = require_project_role(project_id, user, session, "viewer")
    p.bookmarked = not p.bookmarked
    session.add(p)
    session.commit()
    return {"id": p.id, "bookmarked": p.bookmarked}
