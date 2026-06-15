from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..catalog import COMPONENT_LIBRARY
from ..db import get_session
from ..models import Project

router = APIRouter(tags=["search"])


@router.get("/search")
def search(q: str = "", session: Session = Depends(get_session)):
    s = q.lower().strip()
    if not s:
        return {"projects": [], "components": []}
    projects = [
        {"id": p.id, "name": p.name, "type": "project"}
        for p in session.exec(select(Project)).all()
        if s in p.name.lower() or s in p.description.lower()
    ]
    components = [
        {"id": c["id"], "name": c["name"], "type": "component", "category": c["category"]}
        for c in COMPONENT_LIBRARY
        if s in c["name"].lower() or s in c["category"].lower()
    ]
    return {"projects": projects, "components": components}
