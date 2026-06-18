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

# App code.
COPY app ./app

EXPOSE 8000

# Health probe hits the lightweight root route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/ || exit 1

# Production server. --proxy-headers so it sits correctly behind a reverse proxy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
