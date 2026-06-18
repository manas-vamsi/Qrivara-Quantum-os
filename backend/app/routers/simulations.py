import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session, select

from ..config import settings
from ..db import engine, get_session
from ..jobs import SIMULATION_TYPES, run_job, stamp_done
from ..models import Design, SimulationJob
from ..schemas import SimulationCreate, reject_nonfinite

logger = logging.getLogger(__name__)

router = APIRouter(tags=["simulations"])


@router.get("/simulation-types")
def simulation_types():
    """Catalog of the distinct analyses + what each one answers/outputs."""
    return SIMULATION_TYPES


def _execute(job_id: str, design_id: str) -> None:
    """Run a queued job to completion in its own DB session.

    Invoked via BackgroundTasks AFTER the response is sent. Sync (CPU-bound
    NumPy/SciPy) functions are dispatched to Starlette's threadpool, so a long
    FEM solve never blocks the event loop or other requests. No Redis needed.
    """
    with Session(engine) as session:
        job = session.get(SimulationJob, job_id)
        design = session.get(Design, design_id)
        if not job or not design or job.status == "canceled":
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()

        # Compute the result (CPU-bound) and decide the outcome before touching
        # the row again, so a failed run leaves the session clean.
        try:
            result, error = run_job(job, design), None
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            # Full traceback to the server log; the client gets raw detail only
            # in development. In production we return a generic message so
            # internal paths/library internals are never disclosed.
            logger.exception("Simulation job %s failed", job_id)
            error = str(exc) if settings.environment == "development" else "Simulation failed during computation."
            result = None

        # Re-check for a concurrent cancel that landed while we were computing;
        # if the user canceled, honor it instead of overwriting with the result.
        session.expire(job)
        if job.status == "canceled":
            return
        if error is None:
            stamp_done(job, result)
        else:
            job.status = "failed"
            job.error = error
            job.finished_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()


@router.post("/designs/{design_id}/simulations", status_code=202)
def submit(
    design_id: str,
    body: SimulationCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    design = session.get(Design, design_id)
    if not design:
        raise HTTPException(404, "Design not found")
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

    background_tasks.add_task(_execute, job.id, design_id)
    return job


@router.get("/designs/{design_id}/simulations")
def list_jobs(design_id: str, session: Session = Depends(get_session)):
    return session.exec(
        select(SimulationJob).where(SimulationJob.design_id == design_id).order_by(SimulationJob.created_at.desc())
    ).all()


@router.get("/simulations/{job_id}")
def job_status(job_id: str, session: Session = Depends(get_session)):
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/simulations/{job_id}/results")
def job_results(job_id: str, session: Session = Depends(get_session)):
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "done":
        raise HTTPException(409, f"Job is '{job.status}', not done")
    return {"id": job.id, "type": job.type, "result": job.result}


@router.post("/simulations/{job_id}/cancel")
def cancel(job_id: str, session: Session = Depends(get_session)):
    job = session.get(SimulationJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status in ("queued", "running"):
        job.status = "canceled"
        job.finished_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()
    return {"id": job.id, "status": job.status}
