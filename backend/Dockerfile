# ── QRIVARA backend image ────────────────────────────────────────────────────
# Multi-stage-free slim build. scipy/numpy wheels are prebuilt for cp312,
# so no compiler toolchain is needed at runtime.
FROM python:3.12-slim

# Faster, quieter Python; no .pyc clutter; flush logs immediately.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libpq is needed at runtime by psycopg2-binary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching. pytest is dev-only; it is harmless in
# the image but you may strip it with a separate requirements file if desired.
COPY requirements.txt .
RUN pip install -r requirements.txt
# Optional outbound LLM-message compression (app/ai.py auto-uses it, safe no-op if
# absent). Non-fatal: if no cp312 wheel is available the image still builds fine.
RUN pip install headroom-ai || echo "headroom-ai unavailable — AI compression will no-op"

# App code.
COPY app ./app

EXPOSE 8000

# Health probe hits the lightweight root route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/ || exit 1

# Production server. --proxy-headers so it sits correctly behind a reverse proxy.
# Workers come from $WEB_CONCURRENCY (default 4); set it to ~2×CPU cores. NOTE:
# total Postgres connections = WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW),
# so keep that under the DB's max_connections. `exec` makes uvicorn PID 1 so it
# receives SIGTERM directly for graceful shutdown; `sh -c` enables env expansion.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --workers ${WEB_CONCURRENCY:-4}"]
