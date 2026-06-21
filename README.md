# ⚛️ QRIVARA

**The operating system for superconducting quantum hardware design.**

QRIVARA is a dark-first engineering platform for **designing, simulating, and optimizing superconducting‑qubit chips** — a single workspace that takes you from a drag‑and‑drop layout to physically accurate results (capacitance, Hamiltonian, coherence, gates, yield) and out to a Qiskit "digital twin" of the chip you designed.

Everything reported in the UI is **computed from first principles** — no mock numbers.

---

## Table of contents

1. [What you can do](#-what-you-can-do)
2. [Tech stack](#-tech-stack)
3. [Prerequisites](#-prerequisites)
4. [Quick start (5 minutes)](#-quick-start-5-minutes)
5. [Detailed setup](#-detailed-setup)
   - [Backend](#1-backend-fastapi--python)
   - [Frontend](#2-frontend-react--vite)
   - [Environment variables](#3-environment-variables-optional-for-local-dev)
   - [Database: SQLite vs PostgreSQL](#4-database-sqlite-vs-postgresql)
   - [Optional scientific engines](#5-optional-scientific-engines)
6. [Running the app](#-running-the-app)
7. [Running the tests](#-running-the-tests)
8. [Run with Docker (Postgres + worker)](#-run-with-docker-postgres--worker)
9. [Project structure](#-project-structure)
10. [Troubleshooting](#-troubleshooting)
11. [More docs](#-more-docs)

---

## 🚀 What you can do

| Module | What it does |
| :--- | :--- |
| **Dashboard** | Mission control — real KPIs, throughput, and project activity. |
| **Visual Designer** | Infinite canvas — drag‑and‑drop transmons, resonators, and couplers. |
| **Code Studio** | Monaco editor with bidirectional sync between the canvas and Python. |
| **Simulation** | Capacitance (2‑D/3‑D FEM), Hamiltonian/LOM, coherence (T₁/T₂), **DRAG‑calibrated cross‑resonance gates (~99%)**, frequency‑collision yield, readout, QEC, and more. |
| **Optimization** | Goal‑driven tuning + inverse design with Pareto fronts. |
| **Export** | GDS‑II / DXF / DRC, results to JSON/CSV/Touchstone/Markdown, and a **Qiskit `Target`** ("digital twin") you can transpile circuits against. |
| **Collaboration** | Projects, sharing, teams, comments, and chat. |

---

## 🛠 Tech stack

**Frontend** — React 18 + TypeScript, Vite 5, Tailwind CSS, Zustand, Framer Motion, Recharts, `@xyflow/react` (designer), `@monaco-editor/react` (code), Three.js / R3F (3‑D view).

**Backend** — FastAPI + Uvicorn (Python), SQLModel (SQLite or PostgreSQL), NumPy/SciPy for the physics engine. Optional: scqubits, QuTiP, Qiskit, Gmsh (see [Optional scientific engines](#5-optional-scientific-engines)).

---

## ✅ Prerequisites

Install these first:

| Tool | Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | 18 or newer | Ships with `npm`. [nodejs.org](https://nodejs.org) |
| **Python** | 3.11 or newer (3.12+ recommended) | Must be on your `PATH` as `python` (Windows) or `python3` (macOS/Linux). |
| **Git** | any | On Windows, **Git Bash** is recommended for the commands below. |

> You do **not** need PostgreSQL or Docker for local development — the backend uses SQLite out of the box. Docker is only for the production‑like stack ([see below](#-run-with-docker-postgres--worker)).

You will run **two processes** side by side: the **backend** (API, port `8000`) and the **frontend** (UI, port `5173`). Use two terminals.

---

## ⚡ Quick start (5 minutes)

> Start the **backend first** — the frontend loads its data (projects, simulations) from it.

### Terminal 1 — Backend

```bash
cd backend

# 1. Create an isolated Python environment (only needed once)
python -m venv .venv

# 2. Activate it
source .venv/Scripts/activate      # Windows (Git Bash)
# .\.venv\Scripts\Activate.ps1     # Windows (PowerShell)
# source .venv/bin/activate        # macOS / Linux

# 3. Install dependencies (first run downloads the scientific stack — a few minutes)
pip install -r requirements.txt

# 4. Start the API (auto-creates + seeds a local SQLite database on first run)
uvicorn app.main:app --reload
```

✅ Backend ready at **http://localhost:8000** — interactive API docs at **http://localhost:8000/docs**

### Terminal 2 — Frontend

```bash
# from the project root (D:/Qrivara metal demo)
npm install
npm run dev
```

✅ Open **http://localhost:5173** — you're in. (Dev mode signs you in as a demo user automatically; no login needed.)

That's it. The first project and sample data are seeded for you on the backend's first start.

---

## 🔧 Detailed setup

### 1. Backend (FastAPI + Python)

The backend lives in `backend/`. A fresh checkout has **no** virtual environment, so create one (step 1 below). After that, you only ever **activate** it.

```bash
cd backend

# Create the venv (once)
python -m venv .venv

# Activate it (every new terminal)
source .venv/Scripts/activate      # Windows (Git Bash)
# .\.venv\Scripts\Activate.ps1     # Windows (PowerShell)
# source .venv/bin/activate        # macOS / Linux

# Install everything
pip install -r requirements.txt

# Run it
uvicorn app.main:app --reload
```

What happens on first run:

- A SQLite file `backend/qrivara.db` is **created automatically** (tables + demo data). Delete that file any time to reset to a clean seeded state.
- The API serves on `http://localhost:8000`; OpenAPI docs are at `/docs` (enabled while `ENVIRONMENT=development`).
- `--reload` restarts the server when you edit backend code (great for dev; drop it in production).

> **Windows / PowerShell tip:** if activation is blocked, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 2. Frontend (React + Vite)

From the **project root** (not `backend/`):

```bash
npm install        # install Node dependencies (once, or after package.json changes)
npm run dev        # start the Vite dev server with hot reload
```

- Dev server: **http://localhost:5173**
- The frontend calls the backend at `http://localhost:8000` by default. To point it elsewhere, set `VITE_API_BASE` (see below).

### 3. Environment variables (optional for local dev)

**Local dev needs no `.env` files** — the defaults (SQLite + demo auth + `http://localhost:8000`) just work. Configure these only when you need Postgres, AI features, or a custom deployment.

**Backend** — copy the template and edit:

```bash
cp backend/.env.example backend/.env
```

Most useful keys (all optional in dev):

| Key | Default | Purpose |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | `production` hides `/docs` and requires Supabase JWTs. |
| `DATABASE_URL` | SQLite file | Point at PostgreSQL to use a real DB (see next section). |
| `SIM_WORKER_ENABLED` | `false` | `false` runs simulations in‑process (fine for dev). `true` offloads to the `app.worker` process (needs Postgres). |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` | empty | Enable the AI assistant. Provide at least one (tried in that order with fallback). |
| `CORS_ORIGINS` | localhost:5173/4173 | JSON array of allowed frontend origins. |

**Frontend** — copy `.env.example` → `.env` only to override the API base:

```bash
# .env (project root) — Vite inlines VITE_* vars at BUILD time
VITE_API_BASE=http://localhost:8000
```

### 4. Database: SQLite vs PostgreSQL

- **SQLite (default, zero‑config):** nothing to install. The backend creates `backend/qrivara.db` on startup. Perfect for development.
- **PostgreSQL (production‑like):** set `DATABASE_URL` in `backend/.env`:

  ```
  DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/qrivara
  ```

  Tables are still created automatically on startup. The easiest way to get a Postgres instance is the [Docker stack below](#-run-with-docker-postgres--worker).

### 5. Optional scientific engines

`requirements.txt` already includes the quantum ecosystem used by the advanced analyses:

| Package | Enables | If missing |
| :--- | :--- | :--- |
| **scqubits** | Exact diagonalization + dressed two‑qubit spectra | Falls back to the built‑in analytic engine. |
| **QuTiP** | Pulse‑level **DRAG‑calibrated cross‑resonance** gate (~99%) | Falls back to the analytic ~90% estimate. |
| **Qiskit** | Live `Target` build for the "Export to Qiskit" digital twin | The portable JSON descriptor still works. |
| **Gmsh** | 3‑D meshing for the full‑wave EM pipeline | 3‑D field analyses degrade gracefully. |

All four are **lazy‑imported and guarded**, so the backend runs even if any are absent — the relevant feature simply degrades. They install automatically with `pip install -r requirements.txt`.

> **Full‑wave EM (AWS Palace)** is a separate C++/MPI binary, **not** a pip package. It's only needed for full‑wave eigenmode/S‑parameter solves and is installed on a worker/HPC node. When absent, those analyses fall back to the analytic LC eigenmode. See `docs/QRIVARA_INTEGRATION_ROADMAP.md`.

---

## ▶️ Running the app

| Goal | Command | Where |
| :--- | :--- | :--- |
| Backend (dev, hot reload) | `uvicorn app.main:app --reload` | `backend/` (venv active) |
| Frontend (dev, hot reload) | `npm run dev` | project root |
| Type‑check only | `npm run lint` | project root |
| Production build (frontend) | `npm run build` | project root → outputs `dist/` |
| Preview the production build | `npm run preview` | project root → **http://localhost:4173** |

> `npm run build` runs `tsc --noEmit && vite build`, so a type error fails the build.

---

## 🧪 Running the tests

The backend has a comprehensive physics + API test suite (`backend/tests/`):

```bash
cd backend
source .venv/Scripts/activate        # if not already active
python -m pytest                     # run everything
python -m pytest -q                  # quieter output
python -m pytest -k two_qubit_gate   # run a subset by name
```

Tests for optional engines (scqubits/QuTiP/Qiskit) **skip automatically** if the package isn't installed.

---

## 🐳 Run with Docker (Postgres + worker)

For a production‑like stack (FastAPI + PostgreSQL + a dedicated simulation worker), use Docker — no local Python setup required:

```bash
# 1. Create the backend env file (DATABASE_URL is overridden by compose automatically)
cp backend/.env.example backend/.env     # optionally add LLM keys

# 2. Build and start everything
docker compose up --build
```

- Backend → **http://localhost:8000** (docs at `/docs` while `ENVIRONMENT=development`)
- A `worker` service executes queued simulations off the request path. Scale it: `docker compose up --scale worker=3`
- The **frontend is built and served separately** (static Vite build), pointed at the backend via `VITE_API_BASE`. See **`DEPLOY.md`**.

---

## 📁 Project structure

```
.
├── src/                      # Frontend (React + TypeScript)
│   ├── pages/                # Dashboard, Designer, Simulation, CodeStudio, …
│   ├── components/           # UI kit + feature components
│   ├── lib/api.ts            # Typed client for the backend API
│   └── store/                # Zustand state
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app (creates tables + seeds on startup)
│   │   ├── config.py         # Settings (env-driven)
│   │   ├── physics.py        # Core SC-qubit physics engine
│   │   ├── fem.py / fem3d.py # 2-D / 3-D capacitance (EM) solvers
│   │   ├── pulse.py          # QuTiP DRAG-calibrated cross-resonance gate
│   │   ├── jobs.py           # Simulation analyses (dispatch)
│   │   ├── worker.py         # Background simulation worker
│   │   └── routers/          # API endpoints
│   ├── tests/                # pytest suite
│   └── requirements.txt
├── docs/                     # Design notes, integration roadmap, reports
├── docker-compose.yml        # Postgres + backend + worker
├── DEPLOY.md                 # Production deployment guide
└── package.json              # Frontend scripts + deps
```

---

## 🧰 Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `uvicorn: command not found` | The venv isn't active, or deps aren't installed. Activate it, then `pip install -r requirements.txt`. |
| `python -m venv` fails / no `.venv` created | Ensure Python is installed and on `PATH` (`python --version`). On some Linux distros install `python3-venv` first. |
| PowerShell won't activate the venv | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then activate again. |
| Frontend loads but shows no projects / network errors | The backend isn't running, or is on a different port. Start it first and confirm `http://localhost:8000/health` returns `{"status":"ok"}`. |
| CORS errors in the browser console | Add your frontend origin to `CORS_ORIGINS` in `backend/.env`. |
| Port already in use (`8000`/`5173`) | Stop the other process, or run on another port: `uvicorn app.main:app --reload --port 8001` / `npm run dev -- --port 5174` (then set `VITE_API_BASE` accordingly). |
| AI assistant says it's unavailable | Add at least one LLM key (`GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY`) to `backend/.env` and restart the backend. |
| Want a clean database | Stop the backend and delete `backend/qrivara.db`; it re‑seeds on the next start. |

---

## 📚 More docs

- **`DEPLOY.md`** — production deployment (frontend hosting + backend + Postgres).
- **`docs/QRIVARA_INTEGRATION_ROADMAP.md`** — full‑wave EM (Palace/Gmsh) and SDK integrations.
- **`docs/BACKEND_DESIGN.md`** — backend architecture and the physics pipeline.
- **`docs/APP_CONTEXT.md`** — product overview and module map.

---

*QRIVARA — built by engineers, for engineers. Designing the future, one qubit at a time.*
