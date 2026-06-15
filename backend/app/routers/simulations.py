from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..jobs import SIMULATION_TYPES, run_job, stamp_done
from ..models import Design, SimulationJob
from ..schemas import SimulationCreate

router = APIRouter(tags=["simulations"])


@router.get("/simulation-types")
def simulation_types():
    """Catalog of the distinct analyses + what each one answers/outputs."""
    return SIMULATION_TYPES


@router.post("/designs/{design_id}/simulations", status_code=202)
def submit(design_id: str, body: SimulationCreate, session: Session = Depends(get_session)):
    design = session.get(Design, design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    if body.type not in SIMULATION_TYPES:
        raise HTTPException(400, f"Unknown simulation type '{body.type}'")

    job = SimulationJob(
        design_id=design_id, type=body.type, solver=body.solver,
        params=body.params, status="running", started_at=datetime.now(timezone.utc),
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    # MVP: compute in-process (NumPy, ms-scale). PROD: enqueue to a worker and
    # return immediately; the status endpoint reflects progress. Same contract.
    try:
        result = run_job(job, design)
        stamp_done(job, result)
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.finished_at = datetime.now(timezone.utc)
    session.add(job)
    session.commit()
    session.refresh(job)
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
