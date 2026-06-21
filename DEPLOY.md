# QRIVARA — Deployment Guide

Two pieces ship separately:

| Piece        | What it is                          | Cheapest host                            |
|--------------|-------------------------------------|------------------------------------------|
| **Frontend** | Vite static build (`dist/`)         | Cloudflare Pages / Vercel (free tier)    |
| **Backend**  | FastAPI + Postgres (Docker)         | Fly.io / Railway / Render + managed PG    |

The frontend never holds secrets — all LLM keys and the DB live server-side.

---

## 0. Before you deploy — security checklist

- [ ] **Rotate every LLM key** that was ever pasted into chat/logs (Groq, Gemini,
      OpenRouter consoles). Put the new ones only in the host's secret store.
- [ ] `backend/.env` and root `.env` are **gitignored** — confirm they are not
      committed (`git status` shows them untracked/ignored).
- [ ] Set `ENVIRONMENT=production` on the backend — this hides `/docs` and
      enables Supabase JWT verification.
- [ ] Set `SUPABASE_JWT_SECRET` (from your Supabase project) so the API rejects
      unauthenticated requests in prod.
- [ ] Set `CORS_ORIGINS` to your real frontend origin(s) only.

---

## 1. Local development (macOS · Linux · Windows)

QRIVARA is a standard web stack (Vite/React + FastAPI/Python + Postgres), so
local development works identically on all three OSes. Pick the fastest path.

### Prerequisites

| Tool        | Version | Notes                                               |
|-------------|---------|-----------------------------------------------------|
| Python      | 3.11+   | 3.12 matches the production Docker image             |
| Node.js     | 18+     | for the Vite/React frontend                          |
| PostgreSQL  | 15+     | **optional** — dev defaults to a local SQLite file   |
| Docker      | any     | optional — only for the one-command path (Option A)  |

### Option A — Docker (one command, identical on every OS)

```bash
cp backend/.env.example backend/.env      # LLM keys optional for local dev;
                                          # DATABASE_URL is overridden by compose
docker compose up --build
# backend -> http://localhost:8000   (/docs in development)
```

Postgres data persists in the `pgdata` volume; tables auto-create on startup
(`init_db()` → `SQLModel.metadata.create_all`).

### Option B — Native (no Docker)

**1. Backend** (FastAPI, port 8000). Dev uses a zero-config **SQLite** file by
default — no Postgres required.

macOS / Linux (bash/zsh):
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # optional: add LLM keys to enable AI features
uvicorn app.main:app --reload        # http://localhost:8000
```

Windows (PowerShell):
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env          # optional: add LLM keys to enable AI features
uvicorn app.main:app --reload        # http://localhost:8000
```

**2. Frontend** (Vite/React, port 5173) — identical on every OS; run from the
repo root in a second terminal:
```bash
npm install
npm run dev                          # http://localhost:5173
```

The frontend calls `http://localhost:8000` by default; override with
`VITE_API_BASE` in a root `.env` if your backend runs elsewhere.

**3. (Optional) Use Postgres instead of SQLite** — create the database and set
`DATABASE_URL` in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qrivara
```

> **Cross-platform note:** the *only* per-OS difference is venv activation
> (`source .venv/bin/activate` vs `.\.venv\Scripts\Activate.ps1`) and shell
> env-var syntax. All Python deps (numpy / scipy / psycopg2-binary) ship wheels
> for macOS (incl. Apple Silicon arm64), Linux, and Windows, so
> `pip install -r requirements.txt` resolves natively everywhere.

---

## 2. Backend to a managed host (Fly.io example — cheapest)

```bash
cd backend
fly launch --no-deploy            # generates fly.toml; uses the Dockerfile
fly postgres create               # managed Postgres; note the connection string
fly postgres attach <pg-app>      # sets DATABASE_URL secret automatically
fly secrets set ENVIRONMENT=production \
                SUPABASE_JWT_SECRET=... \
                GROQ_API_KEY=... GEMINI_API_KEY=... OPENROUTER_API_KEY=... \
                CORS_ORIGINS='["https://app.qrivara.example.com"]'
fly deploy
```

Railway/Render are equivalent: point them at `backend/Dockerfile`, add a Postgres
plugin (sets `DATABASE_URL`), and set the same secrets in the dashboard.

---

## 3. Frontend to Cloudflare Pages / Vercel

Set the build-time env var to your deployed backend URL, then build:

```bash
# In the host's build settings (or a local .env before building):
VITE_API_BASE=https://api.qrivara.example.com

npm install
npm run build        # outputs dist/
```

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Env var:** `VITE_API_BASE` = your backend's public URL

`VITE_*` vars are inlined at build time, so a rebuild is required to change the
API URL. After the frontend is live, add its origin to the backend's
`CORS_ORIGINS` and redeploy the backend.

---

## 4. Running the backend tests

```bash
cd backend                 # with the venv active (see §1, Option B)
python -m pytest -q        # 31 tests: physics, FEM, analyses, optimizer, exporters, security
```

The suite is pure-function (no DB, no network) and runs in ~2s on any OS. Add it
to CI to guard the physics/FEM engine against regressions.

---

## 5. Environment variable reference (backend)

| Var                   | Required | Notes                                                        |
|-----------------------|----------|--------------------------------------------------------------|
| `DATABASE_URL`        | prod     | `postgresql://user:pass@host:5432/db`. Dev falls back to SQLite. |
| `ENVIRONMENT`         | prod     | `production` hides docs + enforces auth.                      |
| `SUPABASE_JWT_SECRET` | prod     | Verifies user JWTs. Empty = demo user (dev only).            |
| `CORS_ORIGINS`        | prod     | JSON array of allowed frontend origins.                      |
| `GROQ_API_KEY`        | optional | Primary AI provider (lowest latency).                        |
| `GEMINI_API_KEY`      | optional | Fallback AI provider.                                        |
| `OPENROUTER_API_KEY`  | optional | Final fallback AI provider.                                  |
| `WEB_CONCURRENCY`     | optional | uvicorn worker processes. Default 4; set to ~2×CPU cores.    |
| `DB_POOL_SIZE`        | optional | Per-worker Postgres pool size. Default 10.                   |
| `DB_MAX_OVERFLOW`     | optional | Per-worker burst connections. Default 5.                     |
| `SIM_WORKER_ENABLED`  | optional | `true` → offload sims to the `app.worker` process. Default false (in-process). |
| `WORKER_POLL_INTERVAL`| optional | Worker queue-poll seconds when idle. Default 1.0.           |
| `MAX_FEM_QUBITS`      | optional | Transmons the 2-D FEM solver handles per layout. Default 16; reports "N of M" beyond it. |

Frontend: `VITE_API_BASE` (build-time) — backend public URL.

---

## 6. Scaling & capacity

The API is **stateless**, so it scales by adding worker processes and/or
instances behind a load balancer against one shared Postgres.

**Connection budget (important):** every uvicorn worker keeps its own pool, so

```
total Postgres connections = WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)
```

Keep that under the database's `max_connections` (default 100). The defaults —
`4 × (10 + 5) = 60` — are safe on a stock Postgres. If you raise `WEB_CONCURRENCY`
past ~6, either lower the pool, raise Postgres `max_connections`, or put
**PgBouncer** (transaction pooling) in front of the DB.

**Rough capacity (single instance):**

| Config | Concurrent active users | Notes |
|--------|------------------------|-------|
| 1 worker (dev / `--reload`) | ~50–150 | DB pool is the first ceiling |
| 4 workers (default image)   | ~few hundred | 60 DB connections; good for a small org |
| N instances + LB + PgBouncer | thousands | needs the two items below |

**What dominates at scale**
- **Simulations** are CPU-bound NumPy. By default they run in-process (fine for
  dev). For sim-heavy load set `SIM_WORKER_ENABLED=true` and run the bundled
  **`app.worker`** process — the API then only enqueues jobs and the worker(s)
  execute them off the request path. No Redis: the queue is the `simulationjob`
  table, claimed with `FOR UPDATE SKIP LOCKED`, so workers scale horizontally
  (`docker compose up --scale worker=N`). docker-compose already runs one worker.
- **Chat/notification polling** (every 4 s / 15 s / 25 s per active user).
  Replace with WebSocket/SSE to shed that per-user load before a few hundred users.
