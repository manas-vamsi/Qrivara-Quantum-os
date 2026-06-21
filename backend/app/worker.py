"""QRIVARA simulation worker — drains queued `SimulationJob` rows from Postgres.

Run alongside the API when SIM_WORKER_ENABLED=true (docker-compose `worker`
service, or `python -m app.worker`). The API then only *enqueues* jobs; this
process executes them off the web request path, so a long FEM/optimization solve
never competes with API threads. Multiple instances are safe — jobs are claimed
with FOR UPDATE SKIP LOCKED. No Redis required (the queue is the table).

Graceful shutdown: SIGTERM/SIGINT finish the in-flight job, then exit.
"""
from __future__ import annotations

import logging
import signal
import time

from . import runner
from .config import settings
from .db import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("qrivara.worker")

_stop = False


def _handle_signal(signum, _frame) -> None:
    global _stop
    _stop = True
    logger.info("Signal %s received — finishing current job, then exiting.", signum)


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Schema is owned by the API at boot, but make the worker self-sufficient if
    # it starts first / runs alone. Idempotent; tolerate a create race with the API.
    try:
        init_db()
    except Exception:  # noqa: BLE001
        logger.warning("init_db raced/failed in worker (API likely owns schema); continuing", exc_info=True)

    interval = max(float(settings.worker_poll_interval), 0.05)
    stale_timeout = int(settings.worker_stale_timeout_s)
    logger.info("Simulation worker started (poll=%.2fs, stale_timeout=%ss). Waiting for jobs…",
                interval, stale_timeout)

    idle = False
    ticks = 0
    while not _stop:
        try:
            ran = runner.claim_and_run_next()
        except KeyboardInterrupt:
            break
        except Exception:  # noqa: BLE001 — never let one job kill the loop
            logger.exception("Worker loop error; backing off")
            time.sleep(min(interval * 5, 10.0))
            continue

        if ran:
            idle = False
            continue  # keep draining the backlog with no delay

        # Queue empty: log the transition once, periodically reap crashed jobs.
        if not idle:
            logger.info("Queue empty — idling.")
            idle = True
        ticks += 1
        if stale_timeout > 0 and ticks % 30 == 0:
            try:
                n = runner.reap_stale_running(stale_timeout)
                if n:
                    logger.warning("Reaped %d stale 'running' job(s).", n)
            except Exception:  # noqa: BLE001
                logger.exception("Stale-job reap failed")
        time.sleep(interval)

    logger.info("Worker stopped.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Interrupted — exiting.")
