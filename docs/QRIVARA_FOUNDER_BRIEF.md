# QRIVARA — Internal Founder Brief

> Candid status for the co-founders. No spin. What's real, what's half-done, what's missing, what we need (people + compute + money), and the decisions we have to make together. Use this to align before we talk to investors.

*[Date] · for [Founder names] only*

---

## 1. TL;DR — where we actually are

- The **hard, defensible core is built and validated**: our own EM field solver (3-D electrostatic FEM) + a canonical-physics quantum engine + 25+ analyses + the full design→sim→optimize→fab→collaborate loop, in the browser.
- It is **engineering-complete but pre-production**: we still need real auth, deployment to a live tenant, and a compute tier that scales beyond one machine.
- The four biggest gaps to "outstanding" (full list in §6): **(1) validation against a real fabricated device, (2) full-wave EM on HPC, (3) compute scale, (4) production hardening.** Most other gaps are scoped, known increments — not unknowns.
- We are **bottlenecked by compute, validation-access, and runway**, not by whether the science works. That's the story for the raise.

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

## 6. Honest limitations — the full list (say these out loud)

> The gap between "engineering-complete core" (where we are) and an *outstanding* product. Grouped; the first four are the ones that most matter.

**The big four**

1. **No validation against a real fabricated device.** The physics is validated vs the literature *and* `scqubits` (to <0.001 GHz) — excellent — but never correlated to measured hardware. For a quantum-EDA tool, "our prediction matched the fabbed chip within X%" is the single most credibility-defining claim, and we don't have it yet. **Needs a fab/measurement partner.**
2. **Full-wave EM isn't live.** We do quasi-static capacitance (±0.4%) + analytic LC eigenmodes; frequencies come from the LC + Josephson model. The Gmsh + Palace + worker integration is **built and tested with a fallback** — it just needs the Palace MPI binary on an HPC node.
3. **Compute ceiling.** 3-D FEM is capped (~6 qubits 3-D; 16-qubit FEM) on one machine. 100–1,000-qubit chips — the actual market — need distributed/HPC + autoscaling workers. **This is the binding constraint.**
4. **Not production-hardened.** Dev auth is a header; Supabase JWT is scaffolded but unwired. No live multi-tenant deploy, no monitoring/backups, no security review.

**Physics / scientific depth**

5. **T₁ is parameterized**, not geometry-derived (the surface-participation integral from the solved field).
6. **No tunable-coupler net-zero-ZZ** module yet.
7. **Gate fidelity is coherent-control** (ideal/instantaneous echo, no spectators, no Lindblad master-equation in the pulse sim); the on-chip T₁/T₂ number is additive, not a full open-system device sim.
8. **Single-mode element quantization** — no multi-mode/distributed-element, packaging/box-mode, or radiation analysis.
9. **Inverse design is closed-form, single-qubit** — not a field/geometry inverse or multi-qubit layout solver.
10. **No head-to-head benchmark vs Ansys/COMSOL** on identical geometries, and **no uncertainty bars** on most predicted quantities.
11. **Loss uses fixed interface participations**, not a measured-material database; process-variation is Monte-Carlo on Ic/Cσ only (no foundry corner analysis).

**Infrastructure / scale / security**

12. **No object storage** — avatars are data-URLs in the DB; GDS/large artifacts have nowhere to live at scale.
13. **In-app code execution runs Python server-side** (fine locally, behind a flag; needs a sandbox/container for multi-tenant).
14. **Code Studio workspace is localStorage-only** (not server-side or shared).
15. **No CI/CD, observability, rate-limiting, secrets management, or SOC2/ISO** — all needed for enterprise/defense.

**Ecosystem / fabrication**

16. **SQuADDS** (validated-design library) + **Qiskit-Metal** (fab-correct GDS) are blocked by a `numpy<2` clash → need an isolated worker image.
17. **No foundry/PDK integration** or per-foundry DRC packs; GDS export is geometry-correct but **not PDK-validated for tape-out.**

**Product / collaboration / UX**

18. **Not true live co-editing** — sharing/comments/presence exist, but no CRDT/multi-cursor real-time sync (the "Figma" claim is aspirational here).
19. **Linear snapshots, no branch/merge or design diff-merge.**
20. **AI** depends on external LLM keys (working) but has **no eval/guardrail harness and no cost controls** at scale.
21. **Thin onboarding** (getting-started + docs exist, no interactive tutorial/template gallery); **not mobile-optimized; accessibility (WCAG) un-audited;** notifications are in-app only (no email/push).

**Engineering quality**

22. **Test coverage is backend-physics-heavy (59 tests);** frontend/E2E tests are manual (Playwright), not in CI.
23. A few **honest "coming soon" stubs** remain (password/2FA, third-party integrations) — correctly labeled, not fake, but incomplete.

**Business / go-to-market**

24. **Pre-revenue, pre-users** — no pilots, design partners, or LOIs yet.
25. **No published benchmarks / case studies / whitepaper;** pricing and TAM/SAM/SOM unquantified.
26. **Team of two (one dev)** — key-person and bandwidth risk.

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
