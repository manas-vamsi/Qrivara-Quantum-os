from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import DesignVersion

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("/{design_id}/timeline")
def timeline(design_id: str, session: Session = Depends(get_session)):
    return session.exec(
        select(DesignVersion).where(DesignVersion.design_id == design_id).order_by(DesignVersion.created_at.desc())
    ).all()


@router.post("/compare")
def compare(base_id: str, compare_id: str, session: Session = Depends(get_session)):
    base = session.get(DesignVersion, base_id)
    comp = session.get(DesignVersion, compare_id)
    if not base or not comp:
        raise HTTPException(404, "Version not found")

    def diff(field: str):
        b, c = getattr(base, field), getattr(comp, field)
        if b is None or c is None:
            return {"base": b, "compare": c, "delta": None}
        return {"base": b, "compare": c, "delta": round(c - b, 4)}

    return {
        "base": base.label,
        "compare": comp.label,
        "metrics": {"freq": diff("freq"), "fidelity": diff("fidelity")},
    }
