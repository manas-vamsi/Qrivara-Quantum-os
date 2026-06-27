from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the backend/.env by ABSOLUTE path (this file is backend/app/config.py,
# so parent.parent is backend/). pydantic-settings' default relative ".env" only
# loads when the process CWD happens to be backend/ — launching uvicorn from
# elsewhere (or via --app-dir) would silently skip the LLM keys / DATABASE_URL.
# Real OS environment variables still override these.
_ENV_FILE = str(Path(__file__).resolve().parent.parent / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    app_name: str = "QRIVARA API"
    version: str = "0.1.0"
    environment: str = "development"  # set ENVIRONMENT=production to hide API docs
    # SQLite for development. For PostgreSQL, use:
    # postgresql://user:password@localhost:5432/qrivara
    database_url: str = "sqlite:///./qrivara.db"
    # Per-process Postgres connection pool (ignored for SQLite). Each uvicorn
    # worker gets its own pool, so the cluster's total Postgres connections =
    # WEB_CONCURRENCY × (db_pool_size + db_max_overflow). Keep that under the
    # server's `max_connections` (default 100). Defaults: 4 workers × 15 = 60.
    db_pool_size: int = 10
    db_max_overflow: int = 5
    # Simulation execution. False (default): the API runs jobs in-process via
    # BackgroundTasks — fine for single-process dev. True: the API only enqueues
    # (status "queued") and the separate `app.worker` process executes them, so
    # heavy solves never compete with API request threads.
    sim_worker_enabled: bool = False
    worker_poll_interval: float = 1.0       # seconds between queue polls when idle
    worker_stale_timeout_s: int = 600       # fail jobs stuck "running" beyond this
    # Max transmons the 2-D quasi-static FEM solver processes per layout. Beyond
    # this the analysis simulates the first N and reports "N of M" (never silently
    # drops). Raise for bigger chips at some accuracy/speed cost; a 3-D solver is
    # the right tool past ~16.
    max_fem_qubits: int = 16
    # Capacitance solver fidelity. "auto" (default): use the 3-D field solver
    # (app.fem3d — resolves the substrate/vacuum dielectric interface, like Ansys
    # Q3D) for small layouts, falling back to the fast 2-D solver for larger ones;
    # "fem2d": always the 2-D quasi-static solver; "fem3d": always 3-D. Any solve
    # that fails degrades gracefully to the next tier, then an analytic estimate.
    cap_solver: str = "auto"
    # Max transmons the 3-D solver will attempt (its grid grows with layout size);
    # above this, "auto" uses the 2-D solver so a big chip never stalls a job.
    fem3d_max_qubits: int = 6
    # Full-wave EM (AWS Palace) — runs on a dedicated worker/HPC node. `palace_bin`
    # is resolved on PATH (or an absolute path); if absent, the full-wave analyses
    # fall back to the analytic LC-eigenmode. `palace_np` = MPI ranks per solve.
    palace_bin: str = "palace"
    palace_np: int = 1
    palace_timeout_s: int = 1800
    palace_max_qubits: int = 4
    # Vite dev + preview origins; add your deployed frontend origin here.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    # When set, the API verifies Supabase JWTs (prod). Empty = dev mode (demo user).
    supabase_jwt_secret: str | None = None
    # LLM provider keys for the AI assistant. Read server-side ONLY — never
    # returned to the frontend. The assistant tries providers in latency-first
    # order (Groq → Gemini → OpenRouter) with automatic fallback.
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    openrouter_api_key: str | None = None
    # When true AND the optional `headroom-ai` package is installed, the AI layer
    # compresses outbound messages (fewer provider tokens). Safe no-op otherwise.
    headroom_enabled: bool = True
    # Code Studio in-app execution. Runs the user's Python in a subprocess (the
    # backend's own interpreter, so scripts can import numpy/scipy/qiskit/scqubits/
    # qutip and produce REAL output) bounded by a timeout + output cap. This IS a
    # code-execution surface (effectively RCE), appropriate for a local/trusted
    # single-user dev box — like an IDE's Run button. SET FALSE for any shared or
    # public deployment (or move it to an isolated sandbox/container worker).
    code_execution_enabled: bool = True
    code_exec_timeout_s: int = 20            # hard wall-clock limit per run
    code_exec_max_output: int = 40000        # chars of combined stdout/stderr returned

    # ── Hardening (app.middleware) ──────────────────────────────────────────
    # Structured JSON access logs (method, path, status, duration, request id) +
    # a global exception handler that returns a clean 500 (never a stack trace) and
    # logs the traceback server-side. Safe to leave on everywhere.
    log_requests: bool = True
    # Reject requests whose declared Content-Length exceeds this (bytes) with 413,
    # before the body is read. Covers well-behaved clients only — a chunked or
    # header-less upload needs a hard cap at the proxy/ASGI layer. Generous default
    # for design docs / data-URL avatars.
    max_body_bytes: int = 8_000_000
    # Per-client-IP token-bucket rate limit. In-process (per uvicorn worker), so the
    # cluster limit ≈ WEB_CONCURRENCY × rate_limit_rpm; for a hard global limit put a
    # reverse proxy / API gateway in front. /health and OPTIONS are always exempt.
    rate_limit_enabled: bool = True
    rate_limit_rpm: int = 240                # sustained requests/min per IP
    rate_limit_burst: int = 60               # extra burst allowance on top of the rate
    # Trust the X-Forwarded-For header for the client IP. OFF by default: when the API
    # is reachable directly, a client can spoof XFF to mint a fresh rate-limit bucket
    # per request and bypass the limit entirely. Enable ONLY when a trusted reverse
    # proxy (which overwrites/strips inbound XFF) sits in front.
    trust_forwarded_for: bool = False
    # Send conservative security headers (nosniff, no-frame, referrer policy). The API
    # serves JSON, not HTML, so these are safe defaults.
    security_headers: bool = True


settings = Settings()
