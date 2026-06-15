from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Activity, Design, Project, User
from ..schemas import ProjectCreate, ProjectUpdate
from ..security import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects(session: Session = Depends(get_session)):
    return session.exec(select(Project).order_by(Project.updated_at.desc())).all()


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
def project_designs(project_id: str, session: Session = Depends(get_session)):
    return session.exec(select(Design).where(Design.project_id == project_id)).all()


@router.get("/{project_id}")
def get_project(project_id: str, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.now(timezone.utc)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if p:
        session.delete(p)
        session.commit()


@router.post("/{project_id}/bookmark")
def toggle_bookmark(project_id: str, session: Session = Depends(get_session)):
    p = session.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.bookmarked = not p.bookmarked
    session.add(p)
    session.commit()
    return {"id": p.id, "bookmarked": p.bookmarked}
