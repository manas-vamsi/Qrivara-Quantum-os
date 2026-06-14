# QRIVARA — Backend System Design

_Target: a Python backend that stays fast and lossless at **100k concurrent users**, handles **large scientific payloads** (EM field data, capacitance matrices, S-parameters, long-running solver jobs) without stalling or losing data, and scales horizontally._

> TL;DR of the philosophy: **stateless API + offloaded heavy compute + durable queues + object storage + a scaled real-time layer.** The web tier never blocks on simulations; simulations run on autoscaled worker pools orchestrated by a durable workflow engine; large results live in object storage, not the database. Start as a **modular monolith**, split into services only where load demands it.

---

## 1. Why this is NOT a normal CRUD backend

QRIVARA's load has three very different shapes, and conflating them is the #1 way these systems fail:

1. **Interactive/transactional** (read-heavy): dashboards, projects, component/material libraries, settings. → Latency-sensitive, cache-friendly, easy to scale.
2. **Real-time collaborative** (stateful connections): the multiplayer Visual Designer, presence, comments, live sim progress. → Needs persistent WebSocket connections + fan-out.
3. **Heavy asynchronous compute** (minutes→hours): HFSS/Q3D/Palace simulations, optimization loops (hundreds of sims), Hamiltonian diagonalization, parameter sweeps. → Must be **fully decoupled** from the request path, durable, resumable, and autoscaled.

The architecture isolates these so a 6-hour HFSS run can never slow a dashboard request, and 100k people browsing can't starve the solver queue.

---

## 2. High-level architecture

```
                              ┌────────────── CDN (static React app, assets) ──────────────┐
                              │                                                             │
   Users (100k) ── HTTPS ──► Load Balancer / API Gateway (ALB + Cloudflare, WAF, TLS) ──► ...
                              │                         │                         │
                    ┌─────────┴───────┐     ┌───────────┴────────┐     ┌──────────┴─────────┐
                    │  API tier        │     │  Realtime tier      │     │  Auth (OIDC)        │
                    │  FastAPI (ASGI)  │     │  WebSocket gateway  │     │  Keycloak/Clerk     │
                    │  stateless pods  │     │  + Redis pub/sub /  │     │  JWT, SSO/SAML      │
                    │  (HPA autoscale) │     │  Yjs CRDT sync      │     └────────────────────┘
                    └───┬────────┬─────┘     └─────────┬───────────┘
                        │        │                     │
        ┌───────────────┘        │      ┌──────────────┘
        ▼                        ▼      ▼
  ┌───────────┐   enqueue   ┌─────────────────┐         ┌──────────────────────────────┐
  │ PostgreSQL│◄──────────► │ Broker + Workflow│         │ Redis (cache, sessions,       │
  │ (primary  │             │ Temporal / Celery│         │ rate-limit, pub/sub, locks)   │
  │ + replicas│             │ + RabbitMQ/Redis │         └──────────────────────────────┘
  │ PgBouncer │             └────────┬─────────┘
  │ Timescale │                      │ dispatch (KEDA autoscale by queue depth)
  │ pgvector  │            ┌─────────┼──────────────┬───────────────┐
  └───────────┘            ▼         ▼              ▼               ▼
                     ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌──────────────┐
                     │ CPU pool │ │ GPU pool │ │ Solver   │  │ Python sci   │
                     │ (sweeps, │ │ (FEM,    │ │ adapters │  │ workers      │
                     │ valid.)  │ │ optimize)│ │ HFSS/Q3D │  │ (scqubits,   │
                     └────┬─────┘ └────┬─────┘ │ /Palace  │  │ pyEPR, LOM)  │
                          │            │       └────┬─────┘  └──────┬───────┘
                          └────────────┴────────────┴───────────────┘
                                            │ results
                                            ▼
                              ┌──────────────────────────────┐
                              │ Object storage (S3 / MinIO)   │  large blobs: fields, S-params,
                              │ + versioning + lifecycle      │  matrices (Parquet/HDF5), exports
                              └──────────────────────────────┘
        Cross-cutting: OpenTelemetry → Prometheus/Grafana/Tempo/Loki, Sentry, OpenSearch (search)
```

---

## 3. Recommended technology stack ("what to use")

| Concern | Primary recommendation | Why / alternatives |
|---|---|---|
| **Web framework** | **FastAPI** (ASGI, async) on **Uvicorn** workers managed by **Gunicorn** | Async I/O = thousands of concurrent reqs/pod; first-class Pydantic v2 validation; auto OpenAPI. Alt: **Litestar** (faster, batteries-included), Django+DRF (if you want ORM/admin, but sync). |
| **Language runtime** | Python 3.12+ | Per your requirement. Use async everywhere on the API path. |
| **ORM / DB access** | **SQLAlchemy 2.0 (async)** + **asyncpg** + **Alembic** (migrations) | Mature, async, type-safe. Alt: SQLModel (thin wrapper), Tortoise, Piccolo. |
| **Primary database** | **PostgreSQL 16** (managed: RDS/Aurora/Cloud SQL) | Rock-solid OLTP; JSONB for design docs; partitioning; read replicas. |
| **Connection pooling** | **PgBouncer** (transaction mode) | 100k users ≠ 100k DB connections — pool down to a few hundred. **Essential.** |
| **Time-series / analytics** | **TimescaleDB** (PG extension) or **ClickHouse** | Convergence curves, telemetry, sweep points at scale. |
| **Object storage** | **S3** (or **MinIO** self-hosted) | All large payloads (fields, matrices, exports). Presigned URLs for direct up/download. |
| **Cache / pub-sub / locks / rate-limit / sessions** | **Redis 7** (or **Valkey**) | The Swiss-army backbone. Use Redis Streams or RabbitMQ as broker. |
| **Job/queue broker** | **RabbitMQ** (durable, routing) or **Redis Streams** | Durable, acked delivery; dead-letter queues. |
| **Task workers** | **Arq** (async) or **Celery** | Arq is lean+async-native; Celery is battle-tested + huge ecosystem. |
| **Durable workflows (the crux)** | **Temporal** (`temporalio` SDK) | For long, multi-step, resumable pipelines (sim → extract → optimize). Survives crashes, retries, timeouts, human-in-the-loop. **This is what makes "no data loss / never stuck" real.** Alt: Prefect, Dagster, Airflow (more batch-oriented). |
| **Real-time collaboration** | **Yjs CRDT** + `y-py`/websocket sync, OR managed **Liveblocks/Ably** | Conflict-free multiplayer editing of the design graph (Figma-style). For presence/progress only, FastAPI WS + Redis pub/sub is enough. |
| **Search** | **OpenSearch** (or Postgres FTS to start, Algolia if you want managed) | Component/material/project search. |
| **Vector DB (future AI)** | **pgvector** (start) → **Qdrant** | Design embeddings, "similar designs", recommendations. |
| **Auth / SSO** | **Keycloak** (self-host) or **Clerk/WorkOS/Auth0** (managed) | OIDC + **SAML** is mandatory for universities/national labs. JWT access tokens. |
| **Containers / orchestration** | **Docker** + **Kubernetes** (EKS/GKE) + **KEDA** + **HPA** | KEDA autoscales workers by **queue depth**; HPA scales API by CPU/RPS. |
| **IaC / CI-CD** | **Terraform** + **GitHub Actions** + Helm/ArgoCD | Reproducible, multi-environment. |
| **Observability** | **OpenTelemetry** → Prometheus + Grafana + Tempo (traces) + Loki (logs) + **Sentry** | You can SEE queue depth & latency → never silently "stuck". |
| **Email/notify** | Postmark/SendGrid + Slack webhooks + Web Push | Sim-done, mentions, review requests. |
| **Payments (if SaaS)** | Stripe | Org billing/seats. |
| **API protocols** | REST (FastAPI) + **WebSocket/SSE** for live; **gRPC** for internal service-to-service | SSE is great for one-way sim-progress streams. |

**Hot path rule:** anything that can take >100–200 ms (especially anything calling a solver) returns a **job id immediately** and is processed asynchronously. The API never does heavy compute inline.

---

## 4. Service decomposition (modular monolith → services)

Start as **one FastAPI app with clean domain modules** (fast to build, easy to deploy). Extract a module into its own service only when its scaling/independence demands it. Recommended boundaries:

| Domain module | Responsibility | First to extract? |
|---|---|---|
| **Identity** | Orgs, users, teams, memberships, roles, API keys, SSO | with managed auth, thin |
| **Projects** | Projects, folders, tags, bookmarks, sharing | core |
| **Designs** | Design documents (component graph), versions, snapshots | core |
| **Collaboration** | WebSocket gateway, presence, comments, reviews, activity | **yes** (stateful, scales differently) |
| **Simulation** | Job submission, orchestration (Temporal), solver adapters | **yes** (workers scale independently) |
| **Optimization** | Optimization runs, sweeps, yield, inverse design | rides on Simulation |
| **Results** | Result metadata, metrics, time-series, blob references | core |
| **Catalog** | Component library + materials DB (mostly read, cacheable) | cache-first |
| **Codegen** | Canvas → Qiskit Metal export | stateless, cheap |
| **Notifications** | Email/Slack/web-push, in-app feed | small worker |
| **AI (future)** | Design suggestions, geometry checks, auto-optimize | last |

> Don't pre-split into 12 microservices (YAGNI). The two that genuinely need independence early are **Collaboration** (persistent connections) and **Simulation workers** (compute + autoscale).

---

## 5. Core data model (PostgreSQL)

```
org(id, name, plan, sso_config) 
user(id, email, name, role, ...)            membership(org_id, user_id, role)   -- RBAC
api_key(id, org_id, hash, scopes)

project(id, org_id, name, domain, folder_id, status, tags[], created_by, ...)
folder(id, org_id, name, parent_id)
bookmark(user_id, project_id)

design(id, project_id, name, current_version_id)
design_version(id, design_id, parent_id, message, author_id, created_at,
               doc_ref)             -- doc_ref → JSONB or S3 (immutable snapshot)
snapshot(id, design_id, label, version_id, created_at)
-- design document = nodes[] (component instances w/ params) + edges[]  (JSONB or CRDT store)

material_conductor(id, name, conductivity, tc, ...)   -- catalog (small, cacheable)
material_substrate(id, name, eps_r, loss_tangent, thickness, ...)
component_spec(id, kind, category, name, param_schema jsonb)

simulation_job(id, design_version_id, type, solver, status, priority,
               params jsonb, created_by, queued_at, started_at, finished_at,
               progress, workflow_id, error)          -- status = queued|running|done|failed|canceled
simulation_result(id, job_id, summary jsonb,          -- small metrics inline
                  artifacts jsonb)                     -- [{kind, s3_key, bytes, format}]
metric_point(job_id, ts, name, value)                  -- TimescaleDB hypertable (convergence, sweeps)

optimization_run(id, design_id, objectives jsonb, params jsonb, method,
                 status, best jsonb, history_ref)       -- spawns many simulation_jobs

comment(id, target_type, target_id, author_id, body, resolved, parent_id, created_at)
review(id, project_id, requester_id, reviewer_id, status)
activity(id, org_id, actor_id, verb, object_type, object_id, ts)   -- Timescale/partitioned
notification(id, user_id, type, payload, read, ts)
```

**Key rules**
- **Design documents** are stored as JSONB (small/medium) with **immutable versions** (git-like). Each version's doc is content-addressed; snapshots reference a version. Large designs (10k+ shapes) → store the doc body in S3 and keep metadata in PG.
- **Big artifacts never go in Postgres.** `simulation_result.artifacts` holds S3 keys + format (Parquet/HDF5/JSON), sizes, checksums.
- **Time-series** (convergence, sweeps, telemetry) → TimescaleDB hypertables, downsampled for charts.
- Partition `activity`, `metric_point`, `notification` by time; archive cold partitions to S3.

---

## 6. The simulation orchestration system (the heart of scalability)

This is where "handle more data without loss or getting stuck" is won or lost.

**Flow**
1. Client `POST /designs/{id}/simulations` → API validates, writes `simulation_job(status=queued)`, returns `job_id` instantly, **starts a Temporal workflow**.
2. Temporal workflow drives the pipeline as **durable, idempotent activities** with retries/timeouts:
   `validate → mesh → solve(HFSS/Q3D/Palace) → extract (LOM/EPR via pyEPR/scqubits) → persist results → notify`.
3. The `solve` activity is dispatched to the right **worker pool** (CPU / GPU / licensed-solver). Long solves **heartbeat** progress → `metric_point` + WS push.
4. Results: small metrics → `simulation_result.summary`; big arrays → **streamed to S3** (presigned), reference stored.
5. On any failure: Temporal **retries with backoff**, falls back, or routes to **dead-letter** + marks job failed with a reason — **no silent loss**.

**Why Temporal (or equivalent):** a normal task queue loses the thread if a worker dies mid-6-hour-solve. Temporal persists workflow state, so it **resumes exactly where it stopped**, enforces timeouts, and gives you visibility into every step. This is the single biggest reliability lever.

**Autoscaling:** KEDA scales each worker pool by **queue length** (e.g., 0→N GPU pods when the FEM queue grows; back to 0 when idle → cost control). Priority queues (interactive validation > batch sweeps) keep the UI snappy.

**Solver adapters:** thin Python adapters behind a common interface (`run(design, params) -> ResultRef`):
- **Ansys HFSS / Q3D** via **PyAEDT** (licensed, often Windows; run on a dedicated Windows/license-server pool or **AWS via Ansys Gateway**).
- **AWS Palace** (open-source FEM) via **SQDMetal/Gmsh** on Linux CPU/GPU — your default open backend.
- **Hamiltonian/coherence** via **scqubits / pyEPR / Qiskit-Metal LOManalysis** (pure-Python, your `quantum.ts` ports here).
- **Optimization** = a meta-workflow that fans out many sim jobs (Bayesian/GA via Optuna/Ax) and aggregates.

**Big-data handling:** chunked/streamed uploads to S3, columnar formats (Parquet for tables, HDF5 for field arrays), gzip, presigned direct download (never proxy GBs through the API), lifecycle rules to tier old results to cold storage.

---

## 7. Real-time collaboration (100k live connections)

- **Design editing (Figma-style):** model the design doc as a **CRDT (Yjs)** → conflict-free concurrent edits, offline support, automatic merge. A `y-websocket`-style sync service (Python `y-py` or a Node sidecar) persists snapshots to PG/S3.
- **Presence + sim progress + comments:** FastAPI **WebSocket** (or **SSE** for one-way progress) with **Redis Pub/Sub** to fan messages across pods.
- **Scaling 100k connections:** each WS pod holds ~10k–50k connections (tune fds/memory); run ~3–10 pods behind a sticky-less LB with Redis fan-out. If you'd rather not operate this, use **Liveblocks/Ably/Pusher** (managed, scales to millions).
- Connections are **stateless re: business data** — they only carry deltas/events; source of truth stays in PG/S3.

---

## 8. Scaling to 100k concurrent — concretely

| Tier | Strategy | Why it holds at 100k |
|---|---|---|
| **Static frontend** | Served from **CDN** (Cloudflare/CloudFront), fully cached | "Rendering" is the browser + CDN — zero backend load for the UI shell/assets |
| **API** | **Stateless** FastAPI pods, **HPA** by RPS/CPU, behind LB | Add pods linearly; async handlers serve thousands of concurrent reqs each |
| **DB** | Primary + **read replicas** (route reads), **PgBouncer**, partitioning, hot reads cached in Redis | 100k users → a few hundred pooled connections; reads offloaded to replicas/cache |
| **Real-time** | Dedicated WS pods + Redis pub/sub (or managed) | Persistent conns isolated from API; fan-out via Redis |
| **Heavy compute** | Fully async, KEDA-autoscaled worker pools, priority queues | A spike of 10k sim submissions just grows the queue + workers; API stays at p99 < 100 ms |
| **Large data** | S3 + presigned URLs + columnar formats | GB results never touch API memory or the DB |
| **Caching** | Redis (hot entities), CDN (assets/public), HTTP cache headers, materialized views | Most dashboard reads served from cache |

**Backpressure & limits:** per-org rate limits (Redis token bucket), max concurrent jobs per plan, request size caps, circuit breakers on solver pools, and **idempotency keys** on job submission so retries never double-run a sim.

---

## 9. Reliability — "no data loss, never stuck"

- **Durable broker** (RabbitMQ/Redis Streams) with **acked** delivery + **dead-letter queues**.
- **Temporal** for crash-resumable long workflows + timeouts + automatic retries.
- **Idempotency keys** on all mutating + job endpoints (safe retries).
- **Transactional outbox** pattern for "DB write + publish event" atomicity.
- **Postgres**: automated backups + **PITR**, multi-AZ failover. **S3**: versioning + cross-region replication for critical artifacts.
- **DLQ + alerting**: failed jobs surface in the UI with a reason; ops gets paged on queue-depth/age SLOs.
- **Graceful degradation**: if a solver pool is down, jobs queue (not drop); UI shows "queued".

---

## 10. Security & multi-tenancy

- **OIDC/OAuth2** auth, short-lived **JWT** access + refresh tokens; **SAML SSO** for institutions.
- **RBAC** at org/team/project level (owner/editor/viewer) + **row-level authorization** on every query (tenant_id scoping); optionally Postgres RLS.
- **API keys** (scoped) for programmatic/solver access; **secrets** in Vault/KMS.
- TLS everywhere, WAF at the edge, audit log (the `activity` table doubles as audit), per-tenant data isolation, signed/expiring S3 URLs.

---

## 11. API surface (maps directly to the frontend)

REST (versioned `/api/v1`), JSON, cursor-pagination, idempotent writes. WS/SSE for live.

```
Auth:        POST /auth/login (OIDC), /auth/refresh, GET /me
Orgs/Teams:  GET/POST /orgs, /orgs/{id}/members, /api-keys
Projects:    GET/POST /projects, PATCH/DELETE /projects/{id}, /folders, /projects/{id}/bookmark
Designs:     GET/POST /projects/{id}/designs, GET /designs/{id},
             GET/POST /designs/{id}/versions, /snapshots, POST /designs/{id}/duplicate
Catalog:     GET /components, GET /materials/conductors, /materials/substrates   (cached, public-ish)
Codegen:     POST /designs/{id}/codegen   -> Qiskit Metal source
Simulation:  POST /designs/{id}/simulations {type, solver, params} -> {job_id}
             GET /simulations/{job_id}     (status/progress)
             GET /simulations/{job_id}/results, /artifacts/{id}/download (presigned)
             SSE  /simulations/{job_id}/stream   (live progress)
             POST /simulations/{job_id}/cancel
Optimize:    POST /designs/{id}/optimizations, GET /optimizations/{id}
Results:     GET /projects/{id}/results, GET /designs/{id}/metrics
Experiments: GET /designs/{id}/versions (history), POST /compare
Collab:      WS /ws/designs/{id}  (CRDT sync + presence)
             GET/POST /comments, /reviews, GET /activity
Settings:    GET/PATCH /me/profile, /me/notifications, /integrations
```

---

## 12. External integrations to evaluate (your parallel research list)

- **EM solvers:** Ansys **HFSS/Q3D** (PyAEDT; licensing + Windows/Ansys-Gateway-on-cloud), **AWS Palace** (OSS, your default), Sonnet, COMSOL, Elmer FEM, AWR Microwave Office.
- **Quantum/Hamiltonian:** **scqubits**, **sqcircuit**, **pyEPR**, **Qiskit Metal** (LOM/EPR + GDS renderer), CircuitQ, **SQDMetal** (Palace+Gmsh+Qiskit-Metal pipeline).
- **Layout/GDS:** gdstk/gdspy, KLayout, KQCircuits (IQM) for tape-out export.
- **HPC/compute:** AWS Batch / Azure Batch / SLURM clusters; GPU instances; spot for batch sweeps.
- **Auth/SSO:** Keycloak / Clerk / WorkOS / Auth0 (need SAML for labs/universities).
- **Storage/CDN:** S3 + CloudFront / Cloudflare R2 + Cloudflare.
- **Realtime:** Liveblocks / Ably / Pusher (or self-host Yjs).
- **Optimization libs:** Optuna, Ax/BoTorch (Bayesian), pymoo (multi-objective/GA).
- **AI (future module):** **Anthropic Claude API** for design suggestions / geometry-problem detection / auto-optimize; pgvector/Qdrant for embeddings.
- **Ops:** Sentry, Grafana Cloud / Datadog, Stripe (billing), Postmark/SendGrid, Slack.

---

## 13. Phased rollout

1. **MVP (modular monolith):** FastAPI + Postgres + Redis + S3 + Arq workers; auth (managed); projects/designs/versions; one solver (Palace) + Hamiltonian (scqubits/quantum-engine port); results to S3; REST API; SSE progress. Deploy on a small K8s or even ECS/Fly.io.
2. **Collaboration + scale:** add WS/CRDT real-time designer, Redis pub/sub, read replicas, PgBouncer, CDN, HPA.
3. **Orchestration hardening:** introduce **Temporal**, KEDA queue-autoscaling, GPU pool, priority queues, DLQ, idempotency, observability stack.
4. **Enterprise:** SAML SSO, RBAC/RLS, audit, multi-region, billing; HFSS/Q3D licensed integration; optimization at scale.
5. **AI module:** suggestions, auto-optimize, similar-design search (vector DB + Claude).

---

## 14. One-paragraph summary

Build a **stateless async FastAPI** API behind a CDN+load-balancer, with **PostgreSQL (replicas + PgBouncer + Timescale + pgvector)** for transactional data, **Redis** for cache/pub-sub/locks, and **S3** for all large scientific payloads. Push every heavy operation onto **durable, autoscaled worker pools** orchestrated by **Temporal**, so simulations are crash-resumable and never block the web tier. Handle multiplayer design editing with a **CRDT (Yjs)** real-time layer and Redis fan-out. Scale each tier independently on **Kubernetes with HPA + KEDA**, enforce **idempotency, backpressure, and DLQs** for zero data loss, and instrument everything with **OpenTelemetry**. Start as a modular monolith; peel off the Collaboration and Simulation services first. This gives you linear horizontal scale to 100k+ concurrent users with heavy, lossless scientific workloads.
