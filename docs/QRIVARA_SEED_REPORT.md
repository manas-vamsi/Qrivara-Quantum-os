# QRIVARA — Seed Investment Report

> **The cloud-native, AI-assisted EDA platform for superconducting quantum processors.**
> Design → simulate → optimize → fabricate → collaborate, in the browser — powered by our own open-source electromagnetic + quantum solver stack (no Ansys licence required).

_Pre-seed / Seed round · [Month Year] · Prepared by [Founder names]_
_Fill in every `[bracketed]` item before sending._

---

## 1. Executive summary

Building a superconducting quantum chip today means stitching together licensed EM field solvers (Ansys HFSS/Q3D, COMSOL — **$40–60k+ per seat per year**), disconnected Python notebooks, and manual hand-offs between physics, layout, and fabrication. There is **no integrated, quantum-aware, cloud design environment** the way Cadence/Synopsys exist for classical chips.

**QRIVARA is that environment.** It is a browser-based EDA platform purpose-built for superconducting qubits, with:

- **Our own electromagnetic field solver** (3-D electrostatic FEM) and a **canonical-physics quantum engine** — so customers run real capacitance extraction, Hamiltonian, coherence, gate-fidelity, and yield analyses **without a single Ansys/COMSOL licence**.
- A **complete, integrated design loop**: visual layout → 25+ simulation analyses → multi-objective optimization → GDS/DXF fabrication export → manufacturability/yield — all in one place.
- **AI-native workflows** — generate a design from a sentence, get an AI design review, and chat with an assistant grounded in your actual project data.
- **Real-time collaboration** — sharing, teams, comments, presence ("Figma for quantum chips").

The platform is **built and working today** (engineering-complete core, pre-commercial-launch). We are raising **[$___]** to harden it for production, add the full-wave solver tier on real HPC, and convert academic + industry pilots into paying customers.

---

## 2. The problem

Superconducting qubits are the leading quantum-computing modality (IBM, Google, Rigetti, IQM, AWS, and a growing wave of startups). But the **design tooling is broken**:

| Pain                                     | Today's reality                                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Licence cost**                         | EM field solvers (Ansys HFSS/Q3D, COMSOL) cost **$40–60k+/seat/year**. A small team pays six figures before designing anything.                                                        |
| **Fragmentation**                        | Layout in one tool, EM sim in another, quantum analysis in hand-rolled Python, fabrication export in yet another. No single source of truth.                                           |
| **Not quantum-aware**                    | Classical EM tools extract capacitance but know nothing about transmons, anharmonicity, dispersive readout, gate fidelity, or frequency collisions. The physics is bolted on manually. |
| **Desktop-bound & siloed**               | Heavy desktop installs, no real collaboration, no versioning, painful onboarding.                                                                                                      |
| **Manufacturability is an afterthought** | Fixed-frequency chips fail at scale from _frequency collisions_ — the dominant yield killer — yet there's no integrated yield tooling for it.                                          |

The result: slow, expensive, error-prone design loops that **don't scale** as chips grow from tens to thousands of qubits.

---

## 3. The solution — QRIVARA

A single web application that takes a superconducting design from idea to fab-ready, with the physics and EM solving built in.

**The loop:** Draw the chip on a visual canvas → run real EM + quantum simulations → optimize parameters against targets → check manufacturing yield → export GDS-II for the foundry → collaborate with your team — without leaving the browser or buying an EM licence.

---

## 4. What we have built (today, working)

This is **not** a deck of mockups. The following is implemented and runs on real computation, validated against the canonical superconducting-qubit literature (Koch 2007, Krantz 2019, Fowler 2012, Hertzberg/IBM 2021).

### 4.1 Our own EM field solver (the core moat)

- **3-D electrostatic FEM solver** ("our own Q3D"): solves the variable-permittivity Poisson equation ∇·(ε∇φ)=0 on an **edge-conforming grid**, resolving the substrate↔vacuum interface, and extracts the **Maxwell capacitance matrix in absolute femtofarads** — with **no empirical fudge factor** and **no licensed dependency** (pure NumPy/SciPy).
- **Validated & grid-converged to ±0.4%** (verified against the analytic parallel-plate result; correct dielectric and gap scaling; physical transmon self-capacitance).
- A fast **2-D quasi-static** tier for instant design-loop feedback, plus LC-eigenmode and **EPR (energy-participation) quantization**.
- **Visible to the user**: a "Field Solver" view renders the actual solved potential field, the mesh, the convergence error bar, and the extracted matrix.

### 4.2 Canonical-physics quantum engine

Exact, paper-validated implementations (not curve-fits):

- **Exact transmon spectrum** (charge-basis diagonalization), **fluxonium**, tunable/SQUID **flux tuning**.
- **Coherence budget**: T1 (dielectric/Purcell/quasiparticle) and T2 (photon-shot + flux 1/f, Ramsey vs echo).
- **Time-domain 2-qubit gates** — genuine Schrödinger propagation with leakage-aware average gate fidelity. The cross-resonance gate is **DRAG-calibrated (two-tone echoed CR, QuTiP) to ~99%**, matching real-hardware practice (Sheldon 2016 / Sundaresan 2020); CZ / iSWAP are near-exact. An honest **on-chip fidelity estimate** folds in the design's own T₁/T₂.
- **Validated against `scqubits`** (the industry-standard exact-diagonalization package) to <0.001 GHz — proof the engine is _correct_, not a curve-fit.
- **Qiskit digital-twin export** — turn the designed chip into a Qiskit `Target` (per-qubit frequencies/coherence, gate errors/durations, coupling map) and transpile real circuits against it.
- **Dispersive readout** (SNR + assignment fidelity), **ZZ / classical crosstalk**, **surface-code QEC** (logical error, Λ, code distance).
- **Frequency-collision yield maps** (the IBM heavy-hex manufacturability model) — the scaling problem, built in.

### 4.3 The integrated platform (25+ analyses, one workspace)

- **Visual Designer** — drag-and-drop chip canvas, component library, save/load/autosave, undo/redo, live Code↔Canvas sync.
- **Code Studio** — a real in-browser **IDE**: Monaco editor, a VS Code-style **file/folder workspace**, and a **Run button that executes Python server-side and streams the real output** (plus the canvas round-trip for design scripts).
- **Experiments** — real design **version history** (snapshots) with frequency/fidelity evolution and snapshot comparison.
- **Optimization** — real multi-objective optimizer (Nelder-Mead), live Pareto fronts, Monte-Carlo yield, exact inverse design, plus a design-derived **objectives / parameters / error-budget** view and an **AI design advisor** (LLM, with a physics-derived rule-based fallback that always works).
- **Results & 3-D View** — real computed metrics, version-evolution charts, and a to-scale 3-D layout view.
- **Fabrication & exports** — **GDS-II**, DXF, DRC, SPICE netlist, Touchstone S-parameters, and the **Qiskit `Target`** digital twin.
- **Collaboration** — project sharing/permissions, teams, messaging/channels, comments, presence, notifications, profiles, bookmarks & folders.
- **Dashboard** — real computed workspace KPIs.

> **Engineering quality signal:** the platform is backed by an automated test suite (**59 backend tests passing**), a clean type-checked frontend build, and a documented "no-fake-data" engineering policy — every number on screen is computed, verified module-by-module with live screenshots.

---

## 5. Why we win — highlights competitors don't have

| Capability                                              | QRIVARA |  Ansys HFSS/Q3D   |   Qiskit Metal   | Generic notebooks |
| ------------------------------------------------------- | :-----: | :---------------: | :--------------: | :---------------: |
| **No EM licence required** (own solver)                 |   ✅    | ❌ ($40–60k/seat) | ❌ (needs Ansys) |        ✅         |
| **Quantum-aware physics** (transmon, gates, T1/T2, QEC) |   ✅    |        ❌         |    ⚠️ partial    |     ⚠️ manual     |
| **Integrated loop** (layout→sim→opt→fab)                |   ✅    |        ❌         |        ⚠️        |        ❌         |
| **Browser-based, zero-install**                         |   ✅    |        ❌         |        ❌        |        ❌         |
| **Real-time collaboration / teams**                     |   ✅    |        ❌         |        ❌        |        ❌         |
| **AI design generation + advisor**                      |   ✅    |        ❌         |        ❌        |        ❌         |
| **Frequency-collision yield maps**                      |   ✅    |        ❌         |        ❌        |        ⚠️         |
| **Fab-ready exports (GDS/DXF/SPICE)**                   |   ✅    |        ⚠️         |        ✅        |        ❌         |

**The one-sentence moat:** _We replaced the single most expensive, licence-locked piece of the quantum-design stack (the EM field solver) with our own validated solver, and wrapped the entire design loop around it in a collaborative, AI-native web app — so a quantum hardware team can do real chip design at a fraction of the cost, with no installs and no per-seat field-solver tax._

---

## 6. Market opportunity

- **Quantum computing** is moving from research to scaled engineering; superconducting qubits lead in deployed systems and headcount. _(Cite your latest sources — e.g., quantum market projected to reach tens of $B by the 2030s; EDA market ~$15B.)_
- **Buyers:** quantum hardware startups & scale-ups, national labs, university quantum groups, foundries, and the hardware arms of large players.
- **Why it's a category:** as chips scale from ~100 to 1,000+ qubits, _design-tool_ cost and _manufacturability_ become the bottleneck — exactly the "EDA moment" classical chips had. QRIVARA is positioned to be **the Cadence/Synopsys of quantum hardware**.
- **Wedge:** academic + early-stage hardware teams who can't justify Ansys seats — land there, expand into industrial accounts.

_(Replace with your validated TAM/SAM/SOM figures and named target logos.)_

---

## 7. Business model & licensing (how we make money)

Because **we own our solver stack, our gross margin is high** — we don't pay a per-seat Ansys/COMSOL licence, so we can price aggressively below the incumbent workflow and still profit.

**SaaS, tiered + usage-based:**

| Tier                     | Who                   | Price (suggested)           | Includes                                                              |
| ------------------------ | --------------------- | --------------------------- | --------------------------------------------------------------------- |
| **Academic / Free**      | students, researchers | $0 / low                    | full design loop, capped compute, public projects — _adoption funnel_ |
| **Pro**                  | individual engineers  | **$[__]/seat/mo**           | private projects, full analysis suite, exports                        |
| **Team**                 | hardware startups     | **$[__]/seat/mo**           | collaboration, teams, priority compute, version history               |
| **Enterprise / Foundry** | scale-ups, labs, fabs | **custom / annual licence** | SSO, on-prem/VPC option, full-wave HPC tier, support, SLA             |
| **Compute credits**      | all paid tiers        | **usage-based**             | heavy 3-D / full-wave / large-chip simulation jobs                    |

**Additional licensing revenue:**

- **Solver/engine licensing** — license our validated physics + EM engine to teams who want it embedded.
- **On-prem / private-cloud licence** for security-sensitive customers (defense, national labs).
- **Academic site licences** (cheap, drives adoption + hiring funnel + citations).

---

## 8. Status & traction

- **Product:** core platform **built and working** (engineering-complete), validated against canonical literature, full automated test suite passing. Pre-commercial-launch.
- **Differentiated IP:** our own EM field solver + quantum engine (the hard, defensible part) is done.
- **[Add any: pilot users, design partners, LOIs, academic collaborators, advisor names, demo link.]**

---

## 9. Roadmap (use of the raise)

**0–6 months (production-readiness):**

- Production auth, multi-tenant security, deploy to managed cloud (the platform is Dockerized and deploy-scaffolded; needs production infra).
- Onboard first design partners / pilot accounts.
- Harden compute: queue + autoscaling workers for simulation jobs.

**6–12 months (depth + scale):**

- **Full-wave EM tier** (eigenmode + S-parameters) activated on real HPC. The **Gmsh meshing + Palace (AWS, open-source) config + worker integration are already built and tested** with a graceful analytic fallback; only the Palace MPI binary needs the HPC node. _A primary reason we need compute funding._
- **Geometry-derived T1** (surface-participation loss from the field solve) and tunable-coupler net-zero-ZZ. _(DRAG-calibrated 2Q gates — already shipped.)_
- Larger-chip FEM (beyond the current single-machine cap) via distributed compute; SQuADDS validated-design library + Qiskit-Metal fab-correct GDS on an isolated worker image.

**12–18 months (category leadership):**

- Live foundry/PDK integrations, design-rule packs, SQuADDS-style validated-design library expansion, enterprise features, and the agentic "AI co-designer."

---

## 10. The ask

We are raising **[$___]** for **[__]-month runway** to:

| Use of funds                     | Why                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Compute & HPC infrastructure** | Heavy FEM, **full-wave solving, and large (100+ qubit) chips exceed what a single workstation can handle** — they require multi-core/GPU HPC and autoscaling cloud workers. This is a hard technical constraint today and a core reason for the raise. |
| **Managed cloud infra**          | Production database, storage, autoscaling, security/compliance for enterprise customers.                                                                                                                                                               |
| **Team**                         | Physics/FEM engineer(s), full-stack engineer(s), and developer relations to drive academic + industry adoption.                                                                                                                                        |
| **AI/LLM costs**                 | The AI design + assistant features consume model API credits at scale.                                                                                                                                                                                 |
| **Go-to-market**                 | Pilots, design partnerships, conferences, academic site licences.                                                                                                                                                                                      |

_(Insert the specific amount, the split, and the milestones each tranche unlocks.)_

---

## 11. Why now

- Superconducting qubit counts are scaling fast → **design-tool and yield pain is acute right now.**
- The open-source scientific-compute + open full-wave (Palace) ecosystem has matured enough to **credibly replace licensed EM tools.**
- AI (LLMs) now make **natural-language, assisted design** real — a genuinely new interaction model for EDA.
- No incumbent owns "integrated, cloud, quantum-aware EDA." The category is **open.**

---

## 12. Team & contact

_[Founders, roles, relevant background — physics/quantum + software. Advisors. Contact email / demo link / data room.]_

---

### Appendix A — Honest limitations (and how funding closes them)

We hold a strict "no fake data" engineering standard, so we're precise about what is _not_ yet done:

- **Full-wave EM** (3-D eigenmode/S-params): the **meshing (Gmsh) + Palace config + worker integration are built and tested** with an analytic fallback today; the Palace MPI binary runs on the HPC tier (the raise). Quasi-static capacitance extraction (±0.4%) covers the design loop now.
- **T1 surface participation** is currently parameterized, not yet geometry-derived from the field (roadmap).
- **SQuADDS** validated-design library and **Qiskit-Metal** fab-correct GDS need an isolated worker image (a `numpy<2` dependency conflict), planned alongside the HPC tier.
- **Production auth/deploy** not yet wired to a live tenant (scaffolded; part of the 0–6 month plan); in-app password/2FA depend on that identity layer.
- **Compute ceiling**: 3-D FEM is currently capped (single-machine); large chips need the funded HPC tier.

_Framed honestly because defensible claims are the strongest claims — every capability listed in §4 is real and testable in a live demo._

### Appendix B — Validation references

Transmon/anharmonicity (Koch 2007); cQED & gates (Krantz 2019); surface-code QEC (Fowler 2012; Google 2023); frequency collisions (Hertzberg/IBM 2021); leakage-aware gate fidelity (Pedersen 2007). EM solver validated against the analytic parallel-plate capacitance and grid-convergence-tested to ±0.4%.
