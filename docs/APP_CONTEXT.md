# QRIVARA — Application Context (Frontend, as built)

_The "Operating System for Quantum Hardware Design." Everything below is implemented in the React/TypeScript frontend today. Use this to plan backend endpoints and external integrations._

## 1. Stack & architecture

| Layer | Choice |
|---|---|
| Build / framework | Vite 5 + React 18 + TypeScript (strict) |
| Styling | Tailwind CSS v3 — token-driven "Quantum Metal" copper theme (dark + light), SSOT in `src/index.css` + `tailwind.config.js` + `src/lib/tones.ts` |
| Animation | framer-motion |
| Charts | recharts (themed via `src/lib/chartTheme.tsx`) |
| Canvas | @xyflow/react (React Flow 12) — the Visual Designer |
| Code editor | @monaco-editor/react |
| State | zustand (`src/store/useAppStore.ts`, persisted: theme, sidebar, **profile**) |
| Physics | hand-written engine in `src/lib/quantum.ts` (runs client-side today) |
| Data | mock layer in `src/data/mockData.ts` (this is what the backend must replace) |

**Routing:** public landing at `/`, app at `/app/*`. All app state is currently client-side; **there is no backend yet** — everything reads from `mockData.ts`.

## 2. Pages (routes under `/app`)

| Route | Page | Purpose |
|---|---|---|
| `/app` | Dashboard | KPIs, throughput chart, projects, activity, solver queue |
| `/app/projects` | Projects | Folders, tags, search, grid/list, bookmarks |
| `/app/designer` | Visual Designer | Infinite canvas, drag-drop components, inspector, **Generate Code**, **Simulate**, output console |
| `/app/code` | Code Studio | Monaco editor, Qiskit-Metal Python, file tree, canvas⇄code sync |
| `/app/simulation` | Simulation | Tabs: Validation, Frequency, Hamiltonian, Capacitance, Coupling, Sweeps + solver runs table |
| `/app/optimization` | Optimization | Objectives, params, convergence, Pareto, EJ–EC region, yield Monte-Carlo, inverse design |
| `/app/results` | Results Dashboard | **Per-project** metrics + graphs (requires project selection) |
| `/app/fabrication` | Fabrication | Material stack, surface-participation/TLS loss budget, DRC |
| `/app/experiments` | Experiments | Version history (git-like), evolution, run comparison |
| `/app/collaboration` | Collaboration | Team presence, shared projects, reviews, threaded comments |
| `/app/components` | Component Library | Catalog of all components + their parameters |
| `/app/materials` | Material Library | Conductors + substrates with properties |
| `/app/settings` | Settings | Appearance, account (saves to store), integrations, notifications, security |
| `/` | Landing | Marketing site + hero flow animation + New-Design entry |

Global: **New Design modal** (Domain Selection → Project Creation), ⌘K command palette.

## 3. Component library (the design primitives) — `COMPONENT_LIBRARY`

Each has `{ id, kind, name, category, description, defaults (parameters), color }`.

- **Qubits:** Transmon (pad_width/height/gap, junction_width/length, target_freq, anharmonicity, material, layer), Xmon (arm_length/width, cross_width, gap), Fluxonium (inductor_count, loop_area, junction_area, target_freq)
- **Resonators:** CPW Resonator (length, width, gap, impedance, target_freq), Readout Resonator (length, coupling, frequency)
- **Couplers:** Capacitive (distance, coupling_length, capacitance), Inductive (mutual_inductance, loop_area, distance)
- **Control:** Drive Line (width, gap, impedance, power), Flux Line (current, width, distance)
- **Readout:** Feedline (length, width, gap, impedance), Readout Port (freq_range, power)
- **Chip:** Chip Substrate (length, width, thickness, material), Ground Plane (layer, thickness), Air Bridges (length, width, height)

Universal per-instance: name, position X/Y, layer.

## 4. Materials database

- **Conductors** (`CONDUCTORS`): Aluminum, Niobium, Titanium Nitride, Tantalum, Gold, Copper — props: conductivity (S/m), Tc (K).
- **Substrates** (`SUBSTRATES`): Silicon, Sapphire, Silicon Carbide, Quartz — props: εr, loss tangent, thickness.
- **Loss interfaces** (`LOSS_INTERFACES`): metal-air, substrate-air, metal-substrate, bulk — surface participation p + loss tangent.
- **DRC rules** (`DRC_RULES`): min CPW gap, trace width, junction overlap, qubit spacing, airbridge span, TSV pitch, dicing keep-out.

## 5. Physics engine — `src/lib/quantum.ts` (client-side today; candidate to move server-side)

`ecFromCapacitance`, `ejFromIc`, `ejFromLj`, `f01`, `anharmonicity`, `squidEj`, `couplingG`, `dispersiveShift`, `purcellT1`, `t1FromQ`, `combineT1`, `t2`, `chargeDispersion` (parity-switching), `thermalPopulation`, `designErrors` (5-term model), `capacitanceForEc`/`icForEj`/`designForTarget` (inverse design), `lossBudget` (TLS), `eigSym` (Jacobi eigensolver), `fluxoniumLevels` (numerical diagonalization), `sweepEjEc`.

All values verified against published references (Koch 2007, Krantz 2019, IQM 2024).

## 6. Simulations modeled (currently mock; backend must run real solvers)

- **Layout Validation** — overlaps, disconnected components, spacing, geometry.
- **Frequency / eigenmode** — S21 transmission, convergence vs mesh pass.
- **Capacitance** — Maxwell capacitance matrix → Hamiltonian (LOM).
- **Coupling** — g vs flux, ZZ crosstalk.
- **Parameter sweep** — multi-point sweeps → performance graphs.
- **Hamiltonian / coherence** — EC/EJ/f01/anharmonicity/χ/Purcell-T1/T1/T2, transmon + numerical fluxonium.
- **Solver runs** — modeled for Ansys HFSS, Ansys Q3D, AWS Palace.

## 7. Optimization

5 physics-based objectives (TLS/T1, flux-noise dephasing, leakage, state-prep, parity-switch), EJ–EC optimal-region search, Pareto front, convergence, **yield/Monte-Carlo** (process variation), **inverse design** (Bayesian / GA / gradient), targets (frequency, coupling, anharmonicity, Q).

## 8. Code generation

Canvas → **Qiskit Metal** Python: `DesignPlanar`, `TransmonPocket`, `RouteMeander`, `CoupledLineTee`, `TunableCoupler01`, `LaunchpadWirebond`, `LOManalysis`. Output flows into Code Studio.

## 9. Domains (architecture is multi-domain ready)

Superconducting Circuits (V1, active). Coming soon: Fluxonium Systems, Photonic, Spin Qubits, Quantum Sensors, Quantum Networking, Custom Devices.

## 10. What the backend must provide (gap list)

Replace `mockData.ts` with real services for: **auth/orgs/teams**, **projects/designs/versions/snapshots**, **the design document (component graph) with real-time collaboration**, **simulation job orchestration** (run HFSS/Q3D/Palace/Hamiltonian, store results), **optimization runs**, **results/metrics storage & retrieval**, **materials DB**, **experiment tracking**, **comments/reviews/activity**, **code generation/export**, **search**, **notifications**, and (future) the **AI module**.
