from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Design, DesignVersion, User
from ..schemas import DesignCreate, DocUpdate, SnapshotCreate
from ..security import get_current_user

# NOTE: GDS/DXF export lives in routers/export.py (real GDS-II + DXF writers).
# The previous mock export route here collided with that path and is removed.
router = APIRouter(prefix="/designs", tags=["designs"])


@router.post("", status_code=201)
def create_design(body: DesignCreate, session: Session = Depends(get_session)):
    d = Design(**body.model_dump())
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


@router.get("/{design_id}")
def get_design(design_id: str, session: Session = Depends(get_session)):
    d = session.get(Design, design_id)
    if not d:
        raise HTTPException(404, "Design not found")
    return d


@router.put("/{design_id}/doc")
def save_doc(design_id: str, body: DocUpdate, session: Session = Depends(get_session)):
    """Save the whole canvas doc with optimistic concurrency (NOT per-node CRUD)."""
    d = session.get(Design, design_id)
    if not d:
        raise HTTPException(404, "Design not found")
    if body.version is not None and body.version != d.version:
        raise HTTPException(409, f"Version conflict: server is at {d.version}")
    d.doc = body.doc
    d.version += 1
    d.updated_at = datetime.now(timezone.utc)
    session.add(d)
    session.commit()
    session.refresh(d)
    return {"id": d.id, "version": d.version, "updated_at": d.updated_at}


@router.post("/{design_id}/snapshot", status_code=201)
def snapshot(
    design_id: str,
    body: SnapshotCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    d = session.get(Design, design_id)
    if not d:
        raise HTTPException(404, "Design not found")
    v = DesignVersion(
        design_id=design_id, label=body.label, message=body.message,
        author=user.name, doc=d.doc,
    )
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.get("/{design_id}/versions")
def list_versions(design_id: str, session: Session = Depends(get_session)):
    return session.exec(
        select(DesignVersion).where(DesignVersion.design_id == design_id).order_by(DesignVersion.created_at.desc())
    ).all()


@router.get("/{design_id}/versions/{version_id}")
def get_version(design_id: str, version_id: str, session: Session = Depends(get_session)):
    v = session.get(DesignVersion, version_id)
    if not v or v.design_id != design_id:
        raise HTTPException(404, "Version not found")
    return v
