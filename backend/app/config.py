from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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


settings = Settings()
