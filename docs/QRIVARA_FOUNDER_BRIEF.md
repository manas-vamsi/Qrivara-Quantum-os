# QRIVARA — Internal Founder Brief

> Candid status for the co-founders. No spin. What's real, what's half-done, what's missing, what we need (people + compute + money), and the decisions we have to make together. Use this to align before we talk to investors.

*[Date] · for [Founder names] only*

---

## 1. TL;DR — where we actually are

- The **hard, defensible core is built and validated**: our own EM field solver (3-D electrostatic FEM) + a canonical-physics quantum engine + 25+ analyses + the full design→sim→optimize→fab→collaborate loop, in the browser.
- It is **engineering-complete but pre-production**: we still need real auth, deployment to a live tenant, and a compute tier that scales beyond one machine.
- The one genuinely-missing big capability is **full-wave EM** (we do quasi-static today). Everything else is either done or a wiring/polish task.
- We are **bottlenecked by compute and runway**, not by whether the science works. That's the story for the raise.

---

## 2. What is FULLY built and validated ✅

**EM solver (our moat — this is the expensive part nobody else gives away):**
- 3-D electrostatic FEM (∇·(ε∇φ)=0, variable permittivity, substrate/vacuum interface), **edge-conforming grid → ±0.4% grid-converged**, absolute fF, no fudge factor, no Ansys.
- 2-D quasi-static tier (fast), LC eigenmodes, EPR quantization.
- Validated vs analytic parallel-plate; correct dielectric & gap scaling; physical transmon capacitance.
- **Visible** in the app (Field Solver tab: potential heatmap + mesh + convergence + matrix).

**Quantum physics engine (paper-validated, exact — not fits):**
- Exact transmon (charge basis), fluxonium, SQUID flux tuning.
- Full coherence budget: T1 (dielectric/Purcell/quasiparticle), T2 (photon-shot + flux 1/f, Ramsey/echo).
- Time-domain 2-qubit gates via real Schrödinger propagation + leakage-aware fidelity; **cross-resonance is DRAG-calibrated (two-tone echoed CR, QuTiP) to ~99%**, with an honest **on-chip estimate** that folds in the design's T₁/T₂.
- **Validated against `scqubits`** to <0.001 GHz (correct, not curve-fit). **Qiskit `Target` digital-twin export** (transpile circuits against the designed chip).
- Dispersive readout, ZZ/classical crosstalk, surface-code QEC, kinetic inductance.
- Frequency-collision yield map (IBM heavy-hex model).

**Platform (all real, backend-wired):**
- Visual Designer (save/load/autosave/undo-redo/codegen), **Code Studio — a real in-app IDE that executes Python server-side and streams output, with a VS Code-style file/folder workspace + canvas round-trip**, 3-D View.
- **Experiments — real version history** (design snapshots with freq/fidelity evolution + comparison).
- Optimization (Nelder-Mead multi-objective, live Pareto, MC yield, exact inverse design, **design-derived objectives / parameters / error-budget**, **AI advisor** with a physics-derived rule-based fallback).
- **Results** with real metrics + version-evolution charts.
- Exports: GDS-II, DXF, DRC, SPICE, Touchstone, **Qiskit `Target` digital twin**.
- AI: NL design generation, AI advisor, agentic assistant (grounded in DB; multi-provider fallback).
- Collaboration: sharing/RBAC, teams, messages/channels, comments, presence, notifications, profiles, bookmarks/folders, avatar upload.
- Dashboard with real computed KPIs.
- FastAPI + Postgres backend, async job workers, **59 passing backend tests**, clean typed frontend build.

---

## 3. What is PARTIAL / scoped ⚠️ (works; honest caveats)

*(Most of what used to be "preview" is now fully built — Experiments version history, the Optimization objectives/parameters/error-budget/satisfaction panels, the Results evolution charts, the DRAG-calibrated CR gate, Code Studio execution, and avatar upload all shipped. What remains:)*

- **Cross-resonance gate** is now **DRAG-calibrated (two-tone, QuTiP) to ~99%**; the fast analytic ~90% estimate remains as the no-QuTiP fallback. The reported number is a **coherent-control fidelity** (ideal/instantaneous echo, no spectators) — the on-chip estimate adds T₁/T₂, but it is not a full master-equation device sim.
- **Inverse design** is the **exact closed-form** transmon inversion (target → Cσ/Ic) — instant and correct, but not a field/geometry inverse (that's a future optimizer-in-the-loop item).
- **Code Studio execution** runs Python server-side (real output) **behind a config flag**, fine for local/trusted use; a multi-tenant deployment needs it sandboxed/containerized (or off).
- **Settings**: profile, avatar upload, bookmarks/folders are real; **password change + 2FA** are honestly "coming soon" because they belong to the production identity provider (Supabase), not our backend; third-party "integrations" are N/A (we replaced Ansys with our own stack).

---

## 4. What is NOT built yet ❌ (the real gaps)

| Gap | Effort | Needs |
|---|---|---|
| **Full-wave EM** (3-D eigenmode + driven S-params) | **Integration DONE; binary on HPC** | Gmsh meshing + **Palace** config + worker dispatch + analytic fallback are **built & tested**. Only the Palace MPI binary needs an HPC node to activate. |
| **Geometry-derived T1** (surface participation from the field) | Medium | Extends our field solver; we have the field, need the loss-participation integral. |
| **Tunable-coupler net-zero ZZ** analysis | Medium | New physics module. |
| **SQuADDS library + Qiskit-Metal GDS** | Medium | Isolated worker image (their `numpy<2` clashes with our stack); wrap on the HPC tier. |
| **Production auth + multi-tenant deploy** | Medium | Supabase/JWT wiring (scaffolded) + managed cloud. Also unblocks in-app password/2FA. |
| **Compute scaling** (100+ qubit chips, heavy 3-D) | Medium–Large | Distributed/HPC workers — **single machine is the ceiling today.** |
| **Live foundry/PDK + DRC packs** | Medium | Partnerships + rules data. |

---

## 5. Architecture (so we're on the same page)

- **Frontend:** React + TypeScript (Vite), React Flow canvas, Monaco editor, Recharts, Three.js (3-D). Builds clean, type-checked.
- **Backend:** FastAPI (Python) + Postgres (SQLModel), RBAC, async background workers for sim jobs, JWT-ready (Supabase). Dockerized + deploy scaffolding (Fly/Railway/Render + Cloudflare/Vercel) already written.
- **Compute core:** NumPy/SciPy (FEM solvers + physics) — *pure open-source, zero licensed dependency.*
- **AI:** multi-provider (Groq → Gemini → OpenRouter) with fallback; tool-calling grounded in the DB.
- **Quality:** 59 backend tests, "no-fake-data" policy (every UI number is computed), screenshot-verified UI flows.

---

## 6. Honest limitations (say these out loud)

1. **Quasi-static, not full-wave (yet on HPC)** — capacitance extraction is real and ±0.4% converged; frequencies come from the LC + Josephson model. The full-wave path (Gmsh + Palace + worker) is **built and tested with a fallback** — it just needs the Palace MPI binary on an HPC node to go live.
2. **Compute ceiling** — 3-D FEM is capped (~6 qubits on the 3-D tier; 16-qubit FEM cap) on one machine. Bigger chips need HPC. **This is the binding constraint.**
3. **T1 loss is parameterized**, not yet geometry-derived.
4. **Not yet hardened for production** (auth, multi-tenant, SLA, security review for enterprise).
5. **Pre-revenue, pre-users** — we have the product, not yet the market proof. First pilots are the next milestone.

---

## 7. What we need next (prioritized)

1. **Production-ize** — auth, deploy to a live tenant, get it in front of 2–3 design partners. (Unblocks everything.)
2. **Compute tier** — job queue + autoscaling cloud workers; then the **full-wave (Palace) tier on HPC.**
3. **Close the remaining physics gaps** — geometry-derived T1 (surface participation) and tunable-coupler net-zero ZZ. *(DRAG-calibrated gates, version history, and the Optimization/Results panels are already done.)*
4. **Land academic users** (free tier) → adoption + credibility + hiring funnel.

---

## 8. Resources & money — and WHY (this is the funding rationale)

**We can't go further on one workstation. Concretely:**
- 3-D FEM and **full-wave solving are RAM/CPU/GPU-bound**; large chips and full-wave runs **exceed a single machine** — we need cloud HPC + autoscaling workers.
- We need a **managed production database + storage + autoscaling** for multi-tenant SaaS.
- **LLM API credits** for the AI features cost real money at usage scale.
- We need **2–3 hires**: a physics/FEM engineer (full-wave + T1 participation), a full-stack engineer (production hardening), and developer relations (adoption).
- Security/compliance work for enterprise + foundry customers.

**Money buys:** compute (the hard ceiling), infra, the team to close the gaps, and runway to land paying pilots. *The science is proven; we're buying scale and reach.*

**Monetization we can stand behind (because we own the solver → high margin):**
- SaaS tiers (Academic free → Pro → Team → Enterprise/Foundry) + usage-based compute credits.
- On-prem / private-cloud licence for security-sensitive customers.
- Engine/solver licensing for teams who want it embedded.
- Academic site licences (cheap; adoption funnel).

---

## 9. Decisions we should make together

- **How much are we raising, and what runway?** (Drives the use-of-funds split in the seed report.)
- **Open-core vs fully-proprietary?** Do we open-source the base solver (adoption + credibility) and monetize HPC/collaboration/enterprise — or keep it closed?
- **Wedge market:** academic-first (free → land) vs go straight at funded hardware startups?
- **Build vs wrap for full-wave:** confirm we integrate Palace (wrap) rather than building a full-wave solver (don't — it's 50–100+ person-years).
- **Hiring order:** physics engineer first (close the science gaps) or full-stack first (ship to pilots)?
- **Pricing:** set the actual Pro/Team numbers and the compute-credit unit.

---

## 10. Risk register (so we're not surprised)

| Risk | Mitigation |
|---|---|
| Incumbent (Ansys) or a big player builds quantum-aware EDA | Speed + cloud + collaboration + price; own the academic funnel early. |
| Full-wave integration harder than expected | Wrap Palace (proven OSS), don't rebuild; quasi-static covers most of the loop already. |
| Compute costs scale faster than revenue | Usage-based pricing passes heavy-sim cost to the user; cap free tier. |
| Long enterprise sales cycles | Land academic + startups first (short cycles), expand. |
| Key-person/physics depth | Hire the physics/FEM engineer early; document the engine (already well-documented + tested). |

---

*Bottom line for our conversation: the expensive, defensible part is done and validated. We are raising to (1) lift the compute ceiling, (2) ship to real users, and (3) close the full-wave gap — not to find out whether the idea works. It works.*
