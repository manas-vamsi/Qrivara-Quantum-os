# QRIVARA — Cheapest-Possible Backend Plan

_Goal: get a real backend running for **~$0–6/month** while you have few users, using tech that **scales later** without a rewrite. Pay for scale only when scale (and revenue) arrives._

## 0. The principle

- The "100k-user" architecture (Kubernetes, Temporal, GPU pools, OpenSearch, managed realtime) is the **end state**, not the start. Idle, it costs hundreds/month for nothing.
- Pick components that are **cheap/free now** but are the *same technologies* the scalable design uses (Postgres, S3-compatible storage, stateless FastAPI). Then scaling = "turn the dial," not "rewrite."
- **Don't pay for idle capacity.** Use free tiers, scale-to-zero, and a single small box.

## 1. The ONLY thing that's genuinely expensive: simulations

Everything else (API, DB, auth, dashboards) is cheap. Real EM simulation is CPU/GPU-hours + (for Ansys) licenses. Keep it near-$0 until people pay:

- **Use open-source solvers** → no license fees: **AWS Palace** (FEM), **scqubits / pyEPR / Qiskit-Metal LOM** (Hamiltonian/coherence). Skip Ansys HFSS/Q3D until an enterprise customer pays for it.
- **Your `quantum.ts` physics** runs in **milliseconds** on the cheapest box — port it to Python and you get f01, anharmonicity, χ, T1/T2, fluxonium spectra **for free**, no special compute. This covers a LOT of the app.
- **Heavy EM solves run on-demand on spot/preemptible VMs** that you spin up per job and **kill when done** (scale-to-zero) — you pay only per run, cents per job.
- **Cap the free tier** (e.g., N light analyses/day, heavy EM solves = paid). This makes cost track revenue.

## 2. Cheapest concrete stack (two options)

### Option A — "Supabase-managed" (least to build, recommended start)
Let one platform give you Postgres + Auth + Storage + Realtime so you write almost no infra code.

| Need | Use | Cost |
|---|---|---|
| Frontend hosting | **Cloudflare Pages** (static Vite build) | **Free** (unlimited) |
| DB + Auth + Storage + Realtime | **Supabase** free tier | **Free** (500MB DB, 1GB storage, 50k MAU, realtime, RLS) |
| Custom API / sim orchestration | **FastAPI** on a tiny box or **Fly.io**/Render free | **$0–5** |
| Big result files | Supabase Storage or **Cloudflare R2** (free egress!) | **Free** (10GB) |
| Background jobs | a small **Arq** worker on the same box | **Free** |
| Email | **Resend** (3k/mo free) | **Free** |
| Errors/uptime | **Sentry** free + **UptimeRobot** free | **Free** |
| **Total** | | **≈ $0–6/mo + ~$10/yr domain** |

Upgrade path: Supabase Pro ($25/mo) when you outgrow the free DB; everything else stays.

### Option B — "One cheap box, you own it" (cheapest at any real usage)
Run **everything in Docker Compose on a single VM**: FastAPI + Postgres + Redis + worker.

| Need | Use | Cost |
|---|---|---|
| The box | **Oracle Cloud Always-Free** (4 ARM cores / 24 GB RAM, 200GB, 10TB egress) | **Free forever** |
| ↳ or if you want simpler signup | **Hetzner CX22** (2 vCPU/4GB) | **~€3.8/mo (~$4)** |
| Frontend | Cloudflare Pages | **Free** |
| DB / cache / queue | Postgres + Redis **in Docker on the box** | **Free** (just RAM) |
| Object storage | **Cloudflare R2** (10GB free, **$0 egress** — key for big downloads) | **Free → cheap** |
| Auth | self-host **Keycloak**, or **Clerk** free (10k MAU) | **Free** |
| **Total** | | **$0 (Oracle) or ~$4/mo (Hetzner) + domain** |

> Oracle Always-Free is the single best cost play (a genuinely capable free VM forever). Caveat: occasional ARM-capacity availability hiccups at signup. Hetzner is the cheap, hassle-free fallback.

### Even cheaper / simpler (tiny scope): **PocketBase**
One Go binary = SQLite + auth + file storage + realtime + admin UI, on a $4 box. Near-zero ops. Good for an MVP/demo; SQLite limits concurrency, so it's a stepping stone, not the 100k endgame. Keep a small FastAPI sidecar for simulations.

## 3. What to DEFER (premature = expensive)

Cut all of this until you have paying users / real load:
- ❌ Kubernetes → use one box or a PaaS. (K8s alone burns hours + $$.)
- ❌ Temporal cluster, RabbitMQ cluster → a single Arq/RQ worker + Redis is plenty early.
- ❌ GPU pool → none until a customer needs big FEM; then spot, on-demand.
- ❌ Read replicas, multi-region, OpenSearch, ClickHouse → one Postgres (with its built-in full-text search) handles early scale.
- ❌ Managed realtime (Liveblocks/Ably) → Supabase Realtime (free) or skip multiplayer at first (single-editor designs).
- ❌ Ansys licenses → open-source solvers only until enterprise pays.

## 4. Cost ladder by stage

| Stage | Users | Setup | ~Cost/mo |
|---|---|---|---|
| **Demo / MVP** | 1–1k | Cloudflare Pages + Supabase free (or Oracle free box) | **$0** |
| **Early traction** | 1k–10k | + small paid box for FastAPI/workers, R2 storage, Supabase Pro | **$25–60** |
| **Growing** | 10k–50k | + bigger box / managed Postgres (Neon/RDS), Redis (Upstash), Sentry | **$150–500** |
| **Scale (the 100k design)** | 100k+ | K8s + HPA/KEDA, replicas, Temporal, spot GPU pool, CDN | **pay-as-you-grow** (revenue-funded) |

The point: you only climb the ladder when usage forces it — and by then you're earning.

## 5. Single recommendation

**Start with Option A (Cloudflare Pages + Supabase) + a tiny FastAPI service for simulation orchestration.** Reasons:
1. Supabase hands you Postgres + Auth + Storage + Realtime + RLS on a **free tier** — you skip building the 4 most time-consuming backend pieces.
2. It's **Postgres underneath**, so it's the *same* DB the scalable design uses — no rewrite later; you can even self-host Supabase or migrate to plain Postgres.
3. FastAPI stays tiny and stateless (just sim orchestration + the physics engine port), so it costs ~$0–5 and scales horizontally when needed.
4. Use **Cloudflare R2** for big result files (zero egress fees = cheap downloads of large datasets).

Total to launch: **~$0/month** (plus a domain). You only start paying when you have users — and most of those first costs are a single $25 Supabase Pro upgrade.

## 6. Money-saving habits to bake in from day one
- **Scale-to-zero** everything that can (serverless DB like Neon, on-demand sim VMs).
- **Cloudflare for egress** (R2 + Pages = $0 bandwidth, which is the sneaky cost at scale).
- **Cap free-tier compute**; gate heavy EM solves behind payment.
- **Cache aggressively** (Redis + HTTP/CDN) so the cheap DB isn't the bottleneck.
- **Static frontend on CDN** = the UI costs nothing to serve regardless of user count.
