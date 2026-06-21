"""Canonical simulation-job execution — shared by the in-process path
(BackgroundTasks, default dev) and the standalone Postgres-backed worker
(`app.worker`, used when SIM_WORKER_ENABLED=true).

There is exactly ONE implementation of "run a job correctly" here, so both paths
get identical behaviour: mid-run cancel handling, error redaction (raw only in
development), and full server-side traceback logging. No Redis — the queue *is*
the `simulationjob` table; the worker claims rows with FOR UPDATE SKIP LOCKED.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from sqlmodel import Session, select

from .config import settings
from .db import engine
from .jobs import run_job, stamp_done
from .models import Design, SimulationJob

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mark_running(session: Session, job: SimulationJob) -> None:
    job.status = "running"
    job.started_at = _now()
    session.add(job)
    session.commit()


def _run(job_id: str) -> None:
    """Execute a job that is already in 'running' state: compute, honour a
    concurrent cancel, then stamp done/failed. Opens its own session."""
    t0 = time.monotonic()
    with Session(engine) as session:
        job = session.get(SimulationJob, job_id)
        if not job or job.status == "canceled":
            return
        job_type = job.type
        design = session.get(Design, job.design_id)

        # Compute the result (CPU-bound) and decide the outcome before touching
        # the row again, so a failed run leaves the session clean.
        try:
            if design is None:
                raise ValueError("Design not found for job")
            result, error = run_job(job, design), None
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            # Full traceback to the server log; the client sees raw detail only
            # in development. In production we return a generic message so
            # internal paths/library internals are never disclosed.
            logger.exception("Simulation job %s failed", job_id)
            error = str(exc) if settings.environment == "development" else "Simulation failed during computation."
            result = None

        # Re-read the row fresh to honour a cancel that landed mid-compute.
        session.expire_all()
        job = session.get(SimulationJob, job_id)
        if not job or job.status == "canceled":
            return
        if error is None:
            stamp_done(job, result)
        else:
            job.status = "failed"
            job.error = error
            job.finished_at = _now()
        session.add(job)
        session.commit()
        logger.info("job %s (%s) -> %s in %.0fms", job_id, job_type, job.status,
                    (time.monotonic() - t0) * 1000)


def run_in_process(job_id: str) -> None:
    """In-process path (FastAPI BackgroundTasks). No competing workers, so just
    mark the queued job running and execute it after the response is sent."""
    with Session(engine) as session:
        job = session.get(SimulationJob, job_id)
        if not job or job.status != "queued":
            return
        _mark_running(session, job)
    _run(job_id)


def claim_and_run_next() -> bool:
    """Worker path. Atomically claim the oldest queued job with FOR UPDATE SKIP
    LOCKED (so concurrent workers never grab the same row), mark it running, then
    execute it. Returns True if a job was claimed, False if the queue was empty."""
    with Session(engine) as session:
        job = session.exec(
            select(SimulationJob)
            .where(SimulationJob.status == "queued")
            .order_by(SimulationJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        ).first()
        if job is None:
            return False
        _mark_running(session, job)   # commit releases the row lock
        job_id = job.id
    _run(job_id)
    return True


def reap_stale_running(timeout_s: int) -> int:
    """Fail jobs stuck in 'running' far longer than any real solve (e.g. a worker
    crashed mid-job). Marks them failed rather than requeuing, so a job can never
    be executed twice. Returns the number reaped."""
    cutoff = _now().timestamp() - max(timeout_s, 1)
    reaped = 0
    with Session(engine) as session:
        rows = session.exec(
            select(SimulationJob).where(SimulationJob.status == "running")
        ).all()
        for job in rows:
            started = job.started_at
            if started is None:
                continue
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if started.timestamp() < cutoff:
                job.status = "failed"
                job.error = "Simulation timed out (worker did not finish in time)."
                job.finished_at = _now()
                session.add(job)
                reaped += 1
        if reaped:
            session.commit()
    return reaped
