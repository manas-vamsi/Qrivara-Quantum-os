from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, Depends, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from pydantic import BaseModel

from .config import settings
from .db import init_db, get_session
from .models import (
    User, Project, Design, DesignVersion, SimulationJob, CustomComponent
)
from .catalog import COMPONENT_LIBRARY, CONDUCTORS, SUBSTRATES, LOSS_INTERFACES, DRC_RULES
from . import physics

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Auth ----
def get_current_user(session: Session = Depends(get_session)) -> User:
    # Dummy implementation. Replace with Supabase JWT verification.
    user = session.exec(select(User).limit(1)).first()
    if not user:
        user = User(name="Demo Engineer", email="demo@qrivara.com")
        session.add(user)
        session.commit()
        session.refresh(user)
    return user

# ---- PROJECTS & SEARCH ----
projects_router = APIRouter(prefix="/projects", tags=["projects"])

@projects_router.get("/")
def list_projects(q: Optional[str] = None, session: Session = Depends(get_session)):
    stmt = select(Project)
    if q:
        # Basic text search folded into list
        stmt = stmt.where(Project.name.contains(q))
    return session.exec(stmt).all()

@projects_router.post("/")
def create_project(project: Project, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    project.created_by = user.id
    session.add(project)
    session.commit()
    session.refresh(project)
    
    # Auto-create the 'main' design when a project is created
    design = Design(project_id=project.id, name="main")
    session.add(design)
    session.commit()
    
    return project

@projects_router.get("/{id}")
def get_project(id: str, session: Session = Depends(get_session)):
    project = session.get(Project, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@projects_router.get("/{id}/designs")
def get_project_designs(id: str, session: Session = Depends(get_session)):
    stmt = select(Design).where(Design.project_id == id)
    return session.exec(stmt).all()

# ---- DESIGNS & SIMULATIONS ----
designs_router = APIRouter(prefix="/designs", tags=["designs"])

@designs_router.get("/{id}")
def get_design(id: str, session: Session = Depends(get_session)):
    design = session.get(Design, id)
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    return design

class DesignDocUpdate(BaseModel):
    version: int
    doc: dict[str, Any]

@designs_router.put("/{id}/doc")
def update_design_doc(id: str, payload: DesignDocUpdate, session: Session = Depends(get_session)):
    """Optimistic concurrency doc save."""
    design = session.get(Design, id)
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
    
    if payload.version != design.version:
        raise HTTPException(status_code=409, detail="Version conflict. Please refresh the design.")
        
    design.doc = payload.doc
    design.version += 1
    session.add(design)
    session.commit()
    return {"message": "Design saved", "version": design.version}

class SimulationRequest(BaseModel):
    type: str
    solver: str
    params: dict[str, Any]

@designs_router.post("/{id}/simulations")
def run_simulation(id: str, req: SimulationRequest, session: Session = Depends(get_session)):
    """Unified simulation entry point returning a job ID."""
    design = session.get(Design, id)
    if not design:
        raise HTTPException(status_code=404, detail="Design not found")
        
    job = SimulationJob(
        design_id=id,
        type=req.type,
        solver=req.solver,
        params=req.params,
        status="queued"
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    
    # In a real system, we'd dispatch to Celery/ARQ here.
    # For the MVP, we execute specific fast types synchronously:
    if req.type == "sweep":
        job.status = "done"
        job.result = {"sweep": physics.sweep_ej_ec(tunable=req.params.get("tunable", False))}
    elif req.type == "fluxonium_levels":
        job.status = "done"
        job.result = {"levels": physics.fluxonium_levels(
            ej=req.params.get("ej", 4.0),
            ec=req.params.get("ec", 1.0),
            el=req.params.get("el", 1.0),
            flux_ratio=req.params.get("flux_ratio", 0.5)
        )}
    elif req.type == "design_errors":
        job.status = "done"
        job.result = physics.design_errors(
            ej=req.params.get("ej", 14.0),
            ec=req.params.get("ec", 0.25),
            tunable=req.params.get("tunable", False)
        )
    
    session.add(job)
    session.commit()
    session.refresh(job)
    
    return {"job_id": job.id, "status": job.status, "result": job.result}

@designs_router.get("/{id}/simulations")
def list_simulations(id: str, session: Session = Depends(get_session)):
    stmt = select(SimulationJob).where(SimulationJob.design_id == id)
    return session.exec(stmt).all()

@designs_router.get("/simulations/{job_id}")
def get_simulation(job_id: str, session: Session = Depends(get_session)):
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

# ---- COMPONENTS ----
components_router = APIRouter(prefix="/components", tags=["components"])

@components_router.get("/")
def get_catalog(session: Session = Depends(get_session)):
    """Returns the full read-only standard catalog and custom components."""
    stmt = select(CustomComponent)
    customs = session.exec(stmt).all()
    
    return {
        "built_in": COMPONENT_LIBRARY,
        "custom": customs,
        "conductors": CONDUCTORS,
        "substrates": SUBSTRATES,
        "loss_interfaces": LOSS_INTERFACES,
        "drc_rules": DRC_RULES
    }

@components_router.post("/custom")
def create_custom_component(comp: CustomComponent, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Only for user-made components."""
    comp.created_by = user.id
    session.add(comp)
    session.commit()
    session.refresh(comp)
    return comp

# Mount routers
app.include_router(projects_router)
app.include_router(designs_router)
app.include_router(components_router)

@app.get("/")
def health_check():
    return {"status": "ok", "app": settings.app_name}
