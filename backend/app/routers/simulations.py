from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..jobs import SIMULATION_TYPES
from ..models import SimulationJob, User
from ..schemas import SimulationCreate, reject_nonfinite
from ..security import (
    get_current_user,
    require_design_role,
    require_job_role,
)
from .. import runner

router = APIRouter(tags=["simulations"])


@router.get("/simulation-types")
def simulation_types():
    """Catalog of the distinct analyses + what each one answers/outputs."""
    return SIMULATION_TYPES


@router.post("/designs/{design_id}/simulations", status_code=202)
def submit(
    design_id: str,
    body: SimulationCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Running a simulation costs compute — gate behind editor access.
    require_design_role(design_id, user, session, "editor")
    if body.type not in SIMULATION_TYPES:
        raise HTTPException(400, f"Unknown simulation type '{body.type}'")
    # Reject non-finite params up front (covers all ~20 analyses + the persisted
    # params column) so a job can never poison its JSON result/persistence.
    reject_nonfinite(body.params)

    # Enqueue and return immediately (202). The client polls
    # GET /simulations/{job_id} for status, then /results when done.
    job = SimulationJob(
        design_id=design_id, type=body.type, solver=body.solver,
        params=body.params, status="queued",
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    # Execution path: when an external worker is enabled the queued row is enough
    # (the worker claims it); otherwise run it in-process after the response via
    # BackgroundTasks. Same job_id → status contract either way.
    if not settings.sim_worker_enabled:
        background_tasks.add_task(runner.run_in_process, job.id)
    return job


@router.get("/designs/{design_id}/simulations")
def list_jobs(
    design_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    require_design_role(design_id, user, session, "viewer")
    return session.exec(
        select(SimulationJob).where(SimulationJob.design_id == design_id).order_by(SimulationJob.created_at.desc())
    ).all()


@router.get("/simulations/{job_id}")
def job_status(
    job_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return require_job_role(job_id, user, session, "viewer")


@router.get("/simulations/{job_id}/results")
def job_results(
    job_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    job = require_job_role(job_id, user, session, "viewer")
    if job.status != "done":
        raise HTTPException(409, f"Job is '{job.status}', not done")
    return {"id": job.id, "type": job.type, "result": job.result}


@router.post("/simulations/{job_id}/cancel")
def cancel(
    job_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    job = require_job_role(job_id, user, session, "editor")
    if job.status in ("queued", "running"):
        job.status = "canceled"
        job.finished_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()
    return {"id": job.id, "status": job.status}
