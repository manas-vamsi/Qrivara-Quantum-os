# QRIVARA — Feature Inventory & Product Flow

> Reference map of everything the platform does today, the end-to-end flow, how it
> compares to the incumbents, and the science each feature is built on (with
> citations) — so you can research deeper and add your own points.
>
> Legend: ✅ built & wired · ⚠️ built with honest caveats · 🔌 integration done, needs HPC/binary · ❌ not built yet
>
> *Add your notes inline under any section.*

---

## 1. What QRIVARA is (positioning)

An end-to-end, browser-based **Quantum EDA platform / "Quantum OS"** for superconducting
quantum processors. One integrated environment for the whole hardware loop:

> **Design → Simulate → Analyze → Optimize → Fabricate-predict → Validate → Collaborate**

It replaces a stitched-together toolchain (Layout → Ansys HFSS/Q3D → COMSOL → Python
scripts → Qiskit Metal → internal tools) with a single platform that **owns its own
field solver** (no licensed Ansys/COMSOL dependency) and a **paper-validated quantum
engine**. Tagline used internally: *"VS Code + Figma + Ansys HFSS + COMSOL + Qiskit Metal
+ internal quantum lab toolchain, in one browser app."*

---

## 2. The product flow (the design loop)

| Stage | Where it happens (page) | What the user does |
|---|---|---|
| **1. Design** | Visual Designer · Code Studio · 3D View | Drag/connect components on an infinite canvas, or write Python that round-trips to the canvas; see the 3-D device |
| **2. Extract** | Simulation → Layout group | Solve the electrostatic field → Maxwell capacitance matrix; DRC; mesh |
| **3. Quantize** | Simulation → Quantum group | Capacitance → Hamiltonian (LOM), transmon/fluxonium spectra, coupling, EPR |
| **4. Analyze performance** | Simulation → Performance group | Coherence (T1/T2), gates, readout, crosstalk, QEC, frequency-collision yield, **packaging** |
| **5. Optimize** | Optimization | Goal-driven multi-objective tuning, Pareto fronts, inverse design, Monte-Carlo yield, AI advisor |
| **6. Fabricate-predict** | Fabrication · Exports | Surface-loss/DRC, yield; export GDS-II / DXF / DRC / SPICE / Touchstone |
| **7. Validate** | Experiments · Feedback analysis · Qiskit Target | Version history & evolution; compare sim vs measured → recalibrate; export a digital twin |
| **8. Collaborate** | Collaboration · Messages · Teams · Comments | Share (RBAC), comment on components, teams, presence, notifications |

Everything is backed by a real FastAPI + Postgres backend (async job workers); every UI
number is **computed**, not mocked ("no-fake-data" policy).

---

## 3. Feature inventory by area

### A. Design & layout
- ✅ **Visual Designer** — infinite React-Flow canvas; drag-drop component palette; connect/route; multi-tier analysis launch. Recently upgraded: keyboard shortcuts, duplicate/copy-paste, snap-to-grid, **live qubit-physics inspector** (f01/anharmonicity/EC/EJ update as you tune, with real units/ranges from a parameter catalog), quick-start templates, real save status.
- ✅ **Code Studio** — in-app IDE (Monaco) that executes Python **server-side** and streams output; VS Code-style file tree; bidirectional canvas ↔ code round-trip. (Execution behind a config flag; sandbox for multi-tenant.)
- ✅ **3-D View** — Three.js device geometry, material layers, mesh preview; mirrors the canvas.
- ✅ **Component Library** — transmons (Xmon, concentric), fluxonium, tunable transmon/SQUID, resonators, couplers, feedlines, launchpads, flux lines, junctions, airbridges, TSVs, ground, Purcell filters, parametric amplifiers — each parametric.
- ✅ **Material Library** — conductors (Al, Nb, Ta, TiN, NbN, NbTiN, granular-Al) + substrates (Si, sapphire, quartz) with real properties; loss interfaces; DRC rules.
- ✅ **Parameter catalog** — every parameter has unit / min / max / typical / group (drives the inspector).
- ✅ **SQuADDS-style validated designs** — known-good parameter sets with measured-vs-simulated values, usable as fab-ready starting points.
- ✅ Save / load / autosave / undo-redo / version snapshots.

### B. Electromagnetic / field solvers (the moat — own stack, no Ansys)
- ✅ **2-D quasi-static FEM** (`fem.py`) — fast capacitance from a real Laplace solve.
- ✅ **3-D electrostatic FEM** (`fem3d.py`) — variable-permittivity ∇·(ε∇φ)=0 on an edge-conforming grid; resolves the substrate/vacuum interface (Q3D-class); absolute fF, grid-converged to ±0.4%, no fudge factor.
- ✅ **Maxwell capacitance matrix** extraction (self/mutual/ground) → NumPy/CSV/JSON.
- ✅ **LC eigenmodes** (normal-mode spectrum from C + Josephson L).
- 🔌 **Full-wave EM (AWS Palace)** — Gmsh meshing + Palace config + worker dispatch built & tested with analytic fallback; needs the Palace MPI binary on an HPC node to go live.

### C. Quantum physics & analysis suite (~30 analyses, all paper-cited)
Grouped as they appear in the Simulation page:
- **Layout:** Validation/DRC · Capacitance extraction · Field Solver (potential heatmap + convergence + ε_eff) · Circuit Graph (→ SPICE netlist) · Mesh.
- **Modes & RF:** Eigenmode (LC) · Eigenmode (full-wave/Palace) · Frequency/Resonance (CPW + hanger S21) · S-Parameters · Kinetic Inductance.
- **Quantum:** LOM (capacitance → Hamiltonian) · Hamiltonian/Coherence · EPR (energy participation, Minev method) · Coupling vs flux · Flux Spectroscopy · Coupled Spectrum (exact, via scqubits).
- **Performance:** Decoherence (T1/T2 budget) · **Surface Participation → geometry-derived T1** (new) · Gate Fidelity · 2-Qubit Gate time-domain (CZ/iSWAP/CR) · Frequency Collisions / Yield · Dispersive Readout · Error Correction (surface code) · Classical Crosstalk · **Packaging / Box Modes** (new).
- **Tools:** Parameter Sweep · Measurement Feedback (sim vs measured → recalibration).
- Physics depth: exact charge-basis transmon diagonalization, fluxonium, asymmetric-SQUID flux tuning, multi-channel coherence (dielectric/Purcell/quasiparticle T1; photon-shot + flux 1/f Tφ; Ramsey vs echo), DRAG-calibrated cross-resonance (~99% via QuTiP), ZZ, dispersive readout SNR, surface-code logical error + Λ. **Validated against scqubits to <0.001 GHz.**

### D. Optimization & AI
- ✅ Multi-objective optimization (scipy Nelder-Mead over real transmon physics) + live convergence.
- ✅ Pareto front (gate-speed vs ZZ-crosstalk), exact closed-form **inverse design** (target → Cσ/Ic).
- ✅ Monte-Carlo / process-variation **yield** with sensitivity analysis.
- ✅ Design-derived objectives / parameters / error-budget panels.
- ✅ **AI**: natural-language design generation, AI design advisor, agentic assistant (tool-calling, grounded in the DB), multi-provider fallback (Groq → Gemini → OpenRouter) with a physics-derived rule-based fallback.

### E. Fabrication & yield
- ✅ Surface-participation loss analysis & DRC.
- ✅ Junction-spread Monte-Carlo → frequency distribution, yield, failure probability.
- ✅ Frequency-collision yield map (IBM heavy-hex CR model, Hertzberg 2021).
- ⚠️ Process variation is on Ic/Cσ (no foundry corner analysis yet); GDS is geometry-correct but **not PDK-validated for tape-out**.

### F. Exports / interoperability
- ✅ **GDS-II** (real polygon geometry: Xmon crosses, CPW meanders, feedlines, launchpad tapers, junction layer).
- ✅ **DXF**, **DRC** report, **SPICE** netlist, **Touchstone** (S-params), CSV/JSON/Markdown.
- ✅ **Qiskit `Target` digital twin** — transpile & simulate circuits against the chip you designed.

### G. Collaboration & platform
- ✅ Sharing with **RBAC** (owner/editor/commenter/viewer), per-project visibility (private/org/link/public), team grants.
- ✅ Teams, channels & messages, per-component comments/discussions, presence, notifications, profiles, bookmarks/folders, avatar upload.
- ✅ Dashboard with real computed KPIs (active qubits, sims today, avg gate fidelity, optimization gain, solver queue).
- ✅ Results page (metrics + version-evolution charts) and Experiments (version history + run comparison).

### H. Backend / infra / quality
- ✅ FastAPI + Postgres (SQLModel), async background sim workers, JWT-ready (Supabase) auth with fail-closed production guard.
- ✅ **Production hardening** (new): request-ID + structured access logs, per-IP rate limiting, body-size guard, security headers, leak-free global error handler.
- ✅ 64 passing backend tests; clean typed frontend build; Dockerized + deploy scaffolding (Fly/Railway/Render + Cloudflare/Vercel).

---

## 4. Coverage vs the 20-module spec

| # | Spec module | Status |
|---|---|---|
| 1 | Quantum Chip Layout Designer | ✅ |
| 2 | Parameter Sweep Engine | ✅ |
| 3 | Electrostatic FEM Solver | ✅ |
| 4 | Capacitance Matrix Extraction | ✅ |
| 5 | Eigenmode Solver | ✅ / 🔌 (full-wave) |
| 6 | Full Maxwell 3D Solver | 🔌 Palace integration done, needs HPC binary |
| 7 | Transmon Solver | ✅ (validated vs scqubits) |
| 8 | Fluxonium Solver | ✅ |
| 9 | Hamiltonian Builder | ✅ |
| 10 | Coupling Analyzer | ✅ |
| 11 | EPR Analysis | ✅ |
| 12 | Noise & Decoherence | ✅ (+ geometry-derived T1 now) |
| 13 | Purcell Analyzer | ✅ |
| 14 | Crosstalk Simulator | ✅ |
| 15 | Pulse Simulator | ✅ |
| 16 | Gate Fidelity Simulator | ✅ (coherent-control + on-chip T1/T2) |
| 17 | Packaging Simulator | ✅ **(built this round — box modes + collision/Purcell screen)** |
| 18 | Fabrication Variation Simulator | ✅ (Ic/Cσ) |
| 19 | AI Design Optimizer | ✅ |
| 20 | Digital Twin System | ✅ (Qiskit Target export; full calibration loop = future) |

---

## 5. Differentiators (vs the incumbents) — research these

- **vs Ansys HFSS / Q3D:** we ship our **own** 3-D field solver (open-source NumPy/SciPy), in the browser, free — no licence. Research point: head-to-head accuracy benchmark on identical geometries.
- **vs COMSOL:** integrated quantum layer (field → Hamiltonian → coherence → gates), not a general PDE tool you script.
- **vs Qiskit Metal:** Qiskit Metal does layout + renders to Ansys; we do layout **and** the physics **and** optimization **and** collaboration in one place, with our own solver. (Qiskit-Metal GDS interop is a planned worker due to its `numpy<2` clash.)
- **vs SQuADDS:** we embed SQuADDS-style validated designs and can wire the live HuggingFace dataset later.
- **vs scqubits / QuTiP:** we use them where they're best (exact diagonalization, pulse sim) and validate against them, but wrap them in a full product loop.

---

## 6. Honest limitations / gaps (good research/roadmap targets)

1. **No validation against a real fabricated device** yet (validated vs literature + scqubits, not measured hardware) — the single most credibility-defining claim to close.
2. **Full-wave EM not live** — Palace integration built, needs an HPC node.
3. **Compute ceiling** — single machine; 3-D FEM capped (~6 qubits 3-D, 16-qubit FEM); 100–1000-qubit chips need distributed/HPC workers.
4. **Surface-participation T1** is a µm-grid estimate (~×2 on the nm layers; bulk is robust) — a finer near-surface mesh would tighten it.
5. **Gate fidelity** is coherent-control + additive T1/T2, not a full open-system master-equation device sim.
6. **Inverse design** is closed-form single-qubit, not a field/geometry inverse.
7. No **tunable-coupler net-zero-ZZ** module; single-mode element quantization (no multi-mode/distributed-element/radiation).
8. GDS not **PDK-validated** for tape-out; no foundry/PDK packs; process variation on Ic/Cσ only.
9. Production: real multi-tenant auth/deploy, object storage, monitoring, CI/CD, rate-limiting-at-edge, SOC2/ISO still to do.
10. Collaboration is not true CRDT live co-editing; linear snapshots (no branch/merge); AI has no eval/guardrail harness or cost controls at scale.

---

## 7. Science & methods behind the features (citations to research)

- **Transmon / cQED:** Koch et al. 2007 (transmon); Blais 2004, Krantz et al. 2019 (cQED review); Schreier 2008 (charge dispersion).
- **EPR / quantization:** Minev et al. 2021 (energy participation ratio / pyEPR); lumped/quasi-lumped oscillator model.
- **Coherence / loss:** Catelani 2011 (quasiparticle T1); Ithier 2005 (1/f flux noise); Gambetta 2006/2007 (photon-shot dephasing, dispersive readout); Wang et al. 2015 APL (**surface participation & dielectric loss** — our geometry-derived T1); "Materials Matters" 2106.05919 (TLS saturation); Houck 2008 (Purcell).
- **Gates:** Strauch 2003 (CZ via |11⟩–|02⟩); DiCarlo 2009; Sheldon 2016 & Sundaresan 2020 (cross-resonance / DRAG); Abad 2022 (coherence-limited gate bound); Pedersen 2007 (leakage-aware fidelity).
- **Frequency collisions / yield:** Hertzberg et al. 2021 (npj QI) + IBM US Patent 12,039,402 (collision tolerance bounds); heavy-hex lattice.
- **QEC:** Fowler et al. 2012 (surface code); Google 2023/2024 (Λ suppression, below-threshold).
- **Kinetic inductance:** Mattis–Bardeen.
- **Packaging / box modes:** Pozar, *Microwave Engineering* §6.3 (rectangular cavity modes); Wenner 2011 (chip-package / wirebond modes).
- **Tools we validate against / interoperate with:** scqubits (exact spectra), QuTiP (pulse sim), Qiskit `Target` (digital twin), SQuADDS (validated designs), Gmsh + AWS Palace (full-wave).

---

## 8. One-line elevator points (for decks / research framing)

- "Own EM field solver in the browser — no Ansys/COMSOL licence."
- "Design → physics → optimize → fab-predict → validate → collaborate, in one app."
- "Paper-validated quantum engine, cross-checked against scqubits to <0.001 GHz."
- "Every number is computed, not mocked — and exportable (GDS, SPICE, Touchstone, Qiskit Target)."
- "Geometry-derived coherence: the layout's field tells you T1, not a hand-set number."
- "Fabrication yield before you tape out: junction spread + frequency-collision + packaging modes."

---

## 9. Build status — WHAT WE HAVE (updated)

Everything below is built, wired to the real backend, and covered by **71 passing backend
tests** + a clean typed frontend build. Nothing is faked ("no-fake-data" rule).

**Core platform & solvers**
- ✅ Visual Designer (keyboard shortcuts, duplicate/copy-paste, snap-to-grid, **live qubit-physics inspector**, quick-start templates, real save status), Code Studio, 3-D View.
- ✅ Own 2-D + 3-D electrostatic FEM (±0.4%, no Ansys), LC eigenmodes, capacitance matrix.
- 🔌 Full-wave EM (Palace) — integration built & tested; needs the binary (see §12).

**~36 analyses** (all paper-cited): validation/DRC, capacitance, field solver, circuit graph, **knowledge graph**, mesh, eigenmode (LC + full-wave), frequency/S-params, kinetic inductance, LOM, Hamiltonian, EPR, coupling, flux spectroscopy, coupled spectrum, **Qubit Zoo (12 families via scqubits)**, decoherence, **surface-participation → geometry-T1**, gate fidelity, 2-qubit time-domain gate, frequency-collision yield, readout, QEC, crosstalk, **packaging/box modes**, **control electronics**, **cryogenic drive line**, **auto-calibration emulator**, sweep, feedback.

**Design intelligence & data**
- ✅ Optimization (Nelder-Mead, Pareto, inverse design, MC yield), AI advisor + agentic assistant, **natural-language & paper-to-design** generation.
- ✅ **Materials Intelligence** (enriched DB + comparison + coherence predictor), Component Library, SQuADDS-style validated designs.
- ✅ Exports: GDS-II, DXF, DRC, SPICE, Touchstone, **Qiskit Target digital twin**.

**Platform**
- ✅ Collaboration (RBAC, teams, messages, comments, presence, notifications), Dashboard, Results, Experiments (version history).
- ✅ FastAPI + Postgres + async workers + **production hardening** (rate-limit, request-id logs, security headers, clean error handling).

→ **19 of 20 spec modules built; the 20th (full-wave) is integration-complete and binary-gated.** Plus ~7 features beyond the original spec (Qubit Zoo, Materials Intelligence, Cryogenic designer, Control electronics, Auto-calibration, Knowledge graph, Paper-to-design).

## 10. What we NEED TO BUILD (and the blocker on each)

Recently completed (this batch): ✅ **Production auth** — Supabase HS256 JWT verification is now implemented in `security.py` (stdlib, no dep; verifies signature + exp, rejects alg-confusion, provisions the user). ✅ **Object storage** — pluggable `storage.py` adapter (local-fs default + S3/R2 lazy), `/storage/<key>` serve endpoint, avatar-upload offload wired. ✅ **CI/CD** — `.github/workflows/ci.yml` runs backend pytest + frontend build on every push/PR. Only the *deploy to a live tenant* + a real bucket's credentials remain (config-only).

| Item | Effort | Blocker / what it needs |
|---|---|---|
| **Activate full-wave (Palace)** | Small | The Palace MPI binary on a Linux host (WSL2/Docker on a laptop for small jobs; a VM/HPC for big). Integration is done. |
| **Distributed/HPC compute tier** | Medium | A job queue + autoscaling cloud workers (Ray/Celery+Redis) — for 100+ qubit chips. |
| **Multi-tenant deploy** | Medium | Auth code is done (Supabase JWT); needs a managed cloud tenant + the JWT secret/bucket creds set. |
| **Validation vs a fabricated device** | Partnership | A fab/measurement partner — the single most credibility-defining gap. |
| **Foundry/PDK packs + tape-out DRC** | Partnership | Foundry partnerships + proprietary rule data. |
| **Knowledge-graph at scale (Neo4j)** | Medium | A graph-DB server (the in-app dependency graph already covers the single-design case). |
| **Exact 0-π / cat / GKP / Andreev gate physics** | Large (research) | Multi-mode quantization + new theory (their spectra already work via scqubits). |
| **CI/CD, monitoring, SOC2/ISO, AI eval/cost guardrails** | Medium | Standard production hardening for enterprise/defense customers. |

## 11. Cost estimates (rough — for planning, not quotes)

| Stage | Monthly infra | One-time / notes |
|---|---|---|
| **Now — solo dev / demo** | **~$0–50** (free tiers: Vercel/Cloudflare, a small managed Postgres, LLM free/low tier) | A decent dev laptop (see §12). Everything runs locally. |
| **Pilot — a few design partners** | **~$150–600** (1 cloud VM 16–32 vCPU / 64–128 GB for heavy solves, managed Postgres, object storage, LLM usage, hosting) | No cluster needed yet — one beefy VM covers full-wave + big FEM. |
| **Production — scaling** | **~$1.5k–5k** (autoscaling workers, bigger DB, storage, HPC bursts for full-wave/large chips, monitoring) | Usage-based compute credits can pass heavy-sim cost to users. |
| **Team (the real cost)** | — | 2–3 hires (physics/FEM eng, full-stack, devrel) ≈ **$300k–600k/yr** — the dominant line item, per the founder brief. |

LLM API (the AI features) is usage-based: roughly **$20–200/mo** at small scale, more at usage scale; cap the free tier. Full-wave HPC is **pay-per-run** (cloud spot instances), not always-on.

### Where the money actually goes — software side

Almost all the *software itself is free/open-source* (your standing rule). The spend is hardware + hosted services, and most services have a free tier until you have real users.

| What you pay for | For | Cost | Free until… |
|---|---|---|---|
| **The platform's software** (FastAPI, React, NumPy/SciPy, scqubits, QuTiP, Palace, Postgres, Valkey) | the entire stack | **$0 — free/OSS** | always free |
| **Dev machine** ⭐ | building it smoothly | one-time (see §12) | — *(the one thing worth buying now)* |
| Cloud compute / sim workers | running backend + simulations at scale | pay-as-you-go; scales to zero when idle | local laptop / free trial |
| Managed Postgres (Supabase / Neon) | production database | $0 → ~$50/mo | free tier covers a pilot |
| Object storage (S3 / Cloudflare R2) | GDS, avatars, large artifacts | ~$0.02/GB/mo | free tier |
| Auth / SSO (Supabase) | login, university SSO | $0 → ~$25/mo | free tier |
| Frontend hosting / CDN (Vercel / Cloudflare) | the web app | $0 → ~$20/mo | free tier |
| LLM API (Groq / Gemini / OpenRouter) | the AI features | $0 → ~$200/mo | free/low tiers |
| Domain + TLS | the web address | ~$12/yr; TLS free | — |
| CI/CD + error tracking (GitHub Actions, Sentry) | quality/monitoring | $0 | free tiers |
| Full-wave HPC (Palace) | big full-wave runs only | pay-per-run | not needed until you do full-wave at scale |

**Right now (solo dev, no live users): the only thing actually worth spending money on is a capable development machine.** Everything else has a free tier until you have paying users — so today's real software-side cost is essentially **just the laptop.**

**Bottom line:** the science is done and runs on free/cheap infra today; money buys **a dev machine now, then compute scale + the team + production hardening later** — not "does it work."

## 12. Hardware & dev-environment requirements (the honest version)

**Is it real / do you need a better laptop?** The application is real and already runs.
Your laptop is a **developer-comfort** issue, **not** a product ceiling — because the heavy
compute is **server-side**. Users hit it through a browser; scaling lives on a cloud server,
not on your machine. So you do **not** need an expensive laptop to *ship* this — you need a
*comfortable dev machine* + *cheap cloud when you scale*.

**Developing on 8 GB RAM — real talk:** it works for small designs but will hurt.
Running Vite (frontend) + FastAPI + the Python venv (numpy/scipy/scqubits/qutip) + a browser
+ an editor at the same time on 8 GB means **constant swapping**, and you'll see:
- **3-D View / big-canvas render lag and jank** (Three.js + React Flow + charts are memory-hungry; low RAM + weak GPU → stutter, dropped frames, occasional tab crash).
- **Out-of-memory or very slow solves** on the 3-D FEM (it builds large sparse matrices — up to ~150k grid nodes) and on scqubits/QuTiP runs.
- **Slow builds** (`tsc` + Vite) and a sluggish overall feel.

**Recommended dev machine:**

| RAM | Verdict for developing QRIVARA |
|---|---|
| **8 GB** | Works for small designs only; expect swapping, render jank, OOM on heavy solves. Close other apps; keep meshes/qubit counts small. **Not ideal for clean building.** |
| **16 GB** | **Practical minimum** for a smooth experience — frontend + backend + browser + solves without thrashing. |
| **32 GB** | **Comfortable** — bigger FEM solves, multiple services, local full-wave (Palace in WSL2) for 1–2 qubits. |

If your laptop allows it, **adding a RAM stick to 16 GB is a cheap upgrade (~$30–60)** and the single biggest quality-of-life improvement for development. A new 16 GB laptop is ~$700–1000; 32 GB ~$1200–1800.

**For full-scale simulation, the answer is the cloud, not your laptop:** put the backend on a
64–256 GB cloud VM (or autoscaling workers) and your 8 GB laptop just drives the browser UI —
which it can do fine. Don't buy a workstation to chase scale; rent compute by the hour.

### The specific case: building this on a shared 8 GB company laptop

Right now this is being built on an **8 GB company laptop that also runs day-job work** — and that's
the real constraint, for three reasons:

1. **Two heavy workloads, one small pool of RAM.** Company apps + QRIVARA's frontend, backend, Python
   solver venv and a browser are all competing for 8 GB. The result is constant swapping, slow builds,
   3-D-view render lag, and the genuine risk of QRIVARA work slowing down or interfering with paid work.
2. **It's good enough to *learn/demo* on, not to *develop on daily*.** 8 GB runs small designs; sustained
   development wants **16 GB minimum, 32 GB comfortable** (see the table above).
3. **Keep the venture off employer hardware.** Building your own product on a company-owned machine can
   blur **IP ownership** and mixes personal work with company data/security policies. A separate machine
   keeps QRIVARA cleanly *yours* — this is standard founder caution, worth taking seriously early.

**So yes — a dedicated dev laptop is a legitimate, foundational investment, not a luxury.** It's the
*one* line item on the whole software-side budget that's worth money today (everything else is free
until you have users), it pays for itself in development speed, and it protects your ownership of the
work. A 16 GB machine (~$700–1,000, or a ~$30–60 RAM upgrade if your own laptop has a slot) is the
practical target; 32 GB if you can stretch to it.

*— end —*
