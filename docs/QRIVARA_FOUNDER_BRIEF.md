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
- Time-domain 2-qubit gates (CZ/iSWAP/CR) via real Schrödinger propagation + leakage-aware fidelity.
- Dispersive readout, ZZ/classical crosstalk, surface-code QEC, kinetic inductance.
- Frequency-collision yield map (IBM heavy-hex model).

**Platform (all real, backend-wired):**
- Visual Designer (save/load/autosave/undo-redo/codegen), Code Studio (runnable-Python generation + round-trip), 3-D View.
- Optimization (Nelder-Mead multi-objective, Pareto, MC yield, inverse design).
- Exports: GDS-II, DXF, DRC, SPICE, Touchstone.
- AI: NL design generation, AI advisor, agentic assistant (grounded in DB; multi-provider fallback).
- Collaboration: sharing/RBAC, teams, messages/channels, comments, presence, notifications, profiles.
- Dashboard with real computed KPIs.
- FastAPI + Postgres backend, async job workers, 48 passing backend tests, clean typed frontend build.

---

## 3. What is PARTIAL / "preview" ⚠️ (works, but not the full thing)

- **Experiments page** — currently sample/preview UI. Real version-history exists in the backend (design snapshots) but isn't aggregated into the page yet. ~0.5–1 wk.
- **A few Optimization/Results charts** (objective tracking, long-term evolution) marked "preview" pending backend aggregation.
- **Cross-resonance gate** works but is **un-calibrated** (no DRAG/pulse-shaping) → ~90% fidelity; CZ/iSWAP are strong (98–99%).
- **Inverse design** is analytic (target→params), not geometry/field inverse.
- **Code Studio "Run"** does the real Code↔Designer round-trip for design scripts; for free-form physics scripts it tells the user to run locally (we deliberately don't execute arbitrary Python server-side — security).
- **Settings** account/profile/theme are real; password/2FA/avatar/integrations are honestly marked "coming soon" (need the auth backend).

---

## 4. What is NOT built yet ❌ (the real gaps)

| Gap | Effort | Needs |
|---|---|---|
| **Full-wave EM** (3-D eigenmode + driven S-params) | Large | Integrate **Palace** (AWS, open-source) as a worker job — wrap, don't rebuild. **Needs HPC.** |
| **Geometry-derived T1** (surface participation from the field) | Medium | Extends our field solver; we have the field, need the loss-participation integral. |
| **Tunable-coupler net-zero ZZ** analysis | Medium | New physics module. |
| **Production auth + multi-tenant deploy** | Medium | Supabase/JWT wiring (scaffolded) + managed cloud. |
| **Compute scaling** (100+ qubit chips, heavy 3-D) | Medium–Large | Distributed/HPC workers — **single machine is the ceiling today.** |
| **Live foundry/PDK + DRC packs** | Medium | Partnerships + rules data. |

---

## 5. Architecture (so we're on the same page)

- **Frontend:** React + TypeScript (Vite), React Flow canvas, Monaco editor, Recharts, Three.js (3-D). Builds clean, type-checked.
- **Backend:** FastAPI (Python) + Postgres (SQLModel), RBAC, async background workers for sim jobs, JWT-ready (Supabase). Dockerized + deploy scaffolding (Fly/Railway/Render + Cloudflare/Vercel) already written.
- **Compute core:** NumPy/SciPy (FEM solvers + physics) — *pure open-source, zero licensed dependency.*
- **AI:** multi-provider (Groq → Gemini → OpenRouter) with fallback; tool-calling grounded in the DB.
- **Quality:** 48 backend tests, "no-fake-data" policy (every UI number is computed), screenshot-verified UI flows.

---

## 6. Honest limitations (say these out loud)

1. **Quasi-static, not full-wave** — capacitance extraction is real and ±0.4% converged, but we don't yet do full-wave eigenmode/S-params. Frequencies come from the LC + Josephson model. (Palace = the fix.)
2. **Compute ceiling** — 3-D FEM is capped (~6 qubits on the 3-D tier; 16-qubit FEM cap) on one machine. Bigger chips need HPC. **This is the binding constraint.**
3. **T1 loss is parameterized**, not yet geometry-derived.
4. **Not yet hardened for production** (auth, multi-tenant, SLA, security review for enterprise).
5. **Pre-revenue, pre-users** — we have the product, not yet the market proof. First pilots are the next milestone.

---

## 7. What we need next (prioritized)

1. **Production-ize** — auth, deploy to a live tenant, get it in front of 2–3 design partners. (Unblocks everything.)
2. **Compute tier** — job queue + autoscaling cloud workers; then the **full-wave (Palace) tier on HPC.**
3. **Close the physics gaps** — geometry-derived T1, tunable-coupler ZZ, DRAG gates.
4. **Finish the "preview" UIs** — Experiments version history, the remaining Optimization/Results charts.
5. **Land academic users** (free tier) → adoption + credibility + hiring funnel.

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
