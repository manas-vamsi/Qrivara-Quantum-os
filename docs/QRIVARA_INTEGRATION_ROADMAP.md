# QRIVARA — Open-Source Integration Roadmap (Full-Wave EM + Quantum Ecosystem)

> Code-level plan to evolve QRIVARA from "integrated simulator with our own quasi-static EM solver" into a platform that wraps the mature open-source quantum-hardware stack — full-wave EM (Palace), fab-correct layout (Qiskit Metal), validated inverse design (SQuADDS), exact physics + calibrated gates (scqubits/QuTiP), and Qiskit interop. Researched against the live repos/docs; every dependency is permissively licensed (no Ansys/COMSOL/paid software).
>
> **Principle: wrap mature engines, don't reinvent decades of computational physics.** Each layer plugs into QRIVARA's existing job/worker/result plumbing with mostly *additive* changes.

---

## 0. Summary

| Layer | Repo (licence) | Gives QRIVARA | New files | Effort | Needs |
|---|---|---|---|---|---|
| **1. Full-wave EM** | **Palace** (Apache-2.0) + **Gmsh** (GPL, separate process) | True 3-D eigenmodes + S-parameters ("our own HFSS") | `palace.py`, `geometry.py`, `Dockerfile.palace`, `palace_worker` service | ~2 wks | **HPC/compute** |
| **2. Fab-correct layout** | **Qiskit Metal** / quantum-metal (Apache-2.0) | Parametric, fabrication-correct GDS (pocket cutouts, filleted CPW, length-matched meanders) | `metal_render.py` | ~5.5 d | numpy<2 pin, +150 MB image |
| **3. Validated inverse design** | **SQuADDS** (MIT) | Target specs → real validated geometry (not analytic) | `squadds.py` + `POST /ai/recommend-design` | ~1–2 d | 103 MB dataset cache |
| **4. Exact physics + DRAG gates** | **scqubits** (BSD) + **QuTiP** (LGPL); Qiskit-Dynamics offline | Benchmark/validate our engine; exact dressed ZZ; >99% calibrated CR | `scq.py` + `coupled_spectrum` analysis | ~3–5 d | optional JAX (offline only) |
| **5. SDK interop / digital twin** | **Qiskit** + **Aer** (Apache-2.0) | Export chip as Qiskit Target/BackendV2 + noise model → run circuits on your designed chip | `qiskit_export.py` + `GET /designs/{id}/qiskit-target` | ~2–3 d | optional dep |

**All permissive licences** → reinforces the seed thesis (no per-seat licensed-software cost; high margin). Gmsh is GPL but runs as a *separate process* (the mesher), not linked into our Apache code or Palace — keep it isolated in the Palace worker.

**Sequence (refined from the 4-month plan):**
- **Phase 1 (Months 1–2): Palace + Gmsh.** The flagship gap, the funding justification (HPC). Start with the Gmsh geometry stage (all the risk lives there), validate against Palace's bundled CPW/transmon examples.
- **Phase 2 (Month 2): scqubits benchmark + QuTiP DRAG gates.** Cheap, high-credibility (validates our physics; lifts CR 90%→99%).
- **Phase 3 (Month 3): Qiskit Metal GDS + SQuADDS inverse design.** Makes layouts fab-correct and inverse design real.
- **Phase 4 (Month 4): Qiskit interop / digital twin.** "Run your circuit on your designed chip" — the headline AI-loop demo.

---

## Layer 1 — Palace + Gmsh (full-wave EM) ★ flagship

**What it is:** Palace (AWS, Apache-2.0, MFEM/PETSc/libCEED, MPI+GPU) is a CLI binary driven by one JSON config; it consumes a Gmsh `.msh` tetrahedral mesh and runs **Eigenmode** (freqs + Q + EPR participation), **Driven** (S-parameters), **Electrostatic/Magnetostatic** (C/L matrices), **Transient**. Gmsh (`pip install gmsh`, headless, OpenCASCADE kernel) builds the 3-D model from our rectangular pads.

**Note:** `backend/app/models.py` already has `solver="palace"` on `SimulationJob` — the schema anticipated this.

**New files & flow:**
```
QRIVARA design (nodes/edges)
  → jobs._build_conductors(qubits)                      [EXISTING, reuse]
  → geometry.build_mesh()   (Gmsh OCC: substrate+air boxes + pad surfaces;
                             occ.fragment → conformal interfaces; physical groups;
                             local refinement near metal; write .msh; RETURN attr→role map)
  → palace._eigen_config()/_driven_config()  (Attributes ← physical-group IDs;
                             Lj ← ic_nA; εr ← substrate; PEC on metal; LumpedPort = junction)
  → subprocess: palace -np N config.json    (in the palace_worker container)
  → parse eig.csv / port-EPR.csv  (eigenmode)  OR  port-S.csv (driven)
  → result dict in EXISTING shape → stamp_done() → Postgres → poll → UI
```

**Integration seams (additive only):**
- `jobs.py`: add `SIMULATION_TYPES["eigenmode_fullwave"]` and `["sparams_fullwave"]`; add two dispatch lambdas `_eigenmode_fullwave` / `_sparams_fullwave`. **Each falls back to the existing analytic `_eigenmode` / `_scattering` if the Palace binary/mesh is unavailable** (the codebase's universal graceful-degradation pattern).
- Result keys deliberately match the existing **EPR view** (`frequencies_GHz`, `EPR_matrix`, `anharmonicities_MHz`, `cross_kerr_MHz`), **eigenmode view** (`modes:[{freq_GHz,Q,...}]`), and **scattering view** (`freq_points_GHz`, `S11_dB`, `S21_dB`) → **no frontend rewrite**; `export.result_to_touchstone` works for the driven S-params for free.
- `runner.py` / `worker.py`: **no changes** — the queue/claim/cancel/dispatch is solver-agnostic; a Palace job is just a `SimulationJob` row. `FOR UPDATE SKIP LOCKED` makes a dedicated `palace_worker` safe to add.
- `config.py`: add `palace_enabled`, `palace_bin`, `palace_np`, `palace_timeout_s`, `palace_max_qubits` (mirror the `cap_solver`/`fem3d_max_qubits` pattern).
- `docker-compose.yml`: add a `palace_worker` service from a new `Dockerfile.palace` (Spack-built Palace + `pip install gmsh`); it drains the same job table with `SIM_WORKER_ENABLED=true`.

**Hardest parts (in order):** (1) **Gmsh mesh robustness** — conformal `occ.fragment` of pads onto the substrate/air interface, watertight geometry, local refinement near metal edges; thin-PEC (zero-thickness) pads keep it simple. (2) **Build/deploy** — Spack/MPI image; pin a Palace release, cache the build in CI, or use a prebuilt container. (3) **Runtime/queue** — minutes per solve vs ms; dedicated worker + longer stale-timeout + honest UI progress. (4) **Attribute↔config sync** — `build_mesh` must *return* the physical-group→role map and `palace.py` must consume it (never hard-code attribute IDs).

**Validate against** Palace's bundled `cpw` and transmon examples *before* trusting user designs. **This layer is the reason the seed deck asks for compute/HPC.**

---

## Layer 2 — Qiskit Metal (fabrication-correct GDS)

**What it is:** `pip install quantum-metal` (v0.7.4, Apache-2.0) runs **fully headless** (lite install, no Qt/PySide — set `MPLBACKEND=Agg`). Pipeline: `DesignPlanar` → `QComponent.make()` → geopandas geometry tables → `QGDSRenderer` (gdstk) → `.gds`. QLibrary has `TransmonPocket`, `TransmonCross`, `RouteMeander` (length-matched), `CoupledLineTee`, `LaunchpadWirebond`, etc.

**Integration:** new `backend/app/metal_render.py` with `render_design_to_gds(doc) -> bytes`. Maps the QRIVARA node graph → Metal QComponents (factory per `kind`), wires edges → `QRoute`. Hook into `export.py`'s existing `design_to_gds(doc)` with a fallback to the current hand-built polygons when Metal isn't installed.

**Param mapping (excerpt):** `pad_width_um→pad_width`, `pad_gap_um→pad_gap`, `length_um→total_length` (RouteMeander), `arm_length_um→cross_length` (TransmonCross), `taper_length_um→taper_height` (LaunchpadWirebond).

**Biggest fidelity wins:** ground-plane **pocket cutouts** (the current `export.py` likely draws only positive polygons), filleted CPW bends, exact length-matched meanders, auto-routing (`RoutePathfinder`).

**Risks:** gdstk C++ wheel (use prebuilt manylinux wheels; add `g++/cmake` only if needed), geopandas/GDAL (use wheels), **`numpy<2` pin required by Metal**, coordinate scale (React-Flow px → µm — store a `chip_um_per_px` factor in `design.doc`), edge→pin mapping (compute bearing from qubit to neighbor → nearest cardinal connection pad). +~150 MB to the worker image (keep in a `requirements-metal.txt` for the GDS worker only).

---

## Layer 3 — SQuADDS (validated inverse design)

**What it is:** `pip install SQuADDS` (v0.4.5, MIT). A HuggingFace-hosted DB (~103 MB) of HFSS-simulated **TransmonCross (xmon) + CPW cavity/claw** designs, queryable by target specs `(f01, anharmonicity, f_r, κ, g)` via `SQuADDS_DB` + `Analyzer.find_closest` + `ScalingInterpolator`. Inverse RMS errors: f_r 3.8%, α 4.1%, g 10.4%, κ 16.9% (good starting geometry; we verify with our own solver).

**Integration:** new `backend/app/squadds.py` (lazy-loaded, dataset cached on a Docker volume via `HF_DATASETS_CACHE`) + new endpoint `POST /ai/recommend-design`: target specs → SQuADDS closest/interpolated geometry → map to QRIVARA node params → optionally verify by running our own `_capacitance`/`_lom` → return a ready-to-open `design_doc`. Upgrades the **analytic-only** inverse design in `routers/optimization.py` and enriches `designgen.assemble()`. Can also populate `catalog.py` VALIDATED_DESIGNS from the `measured_device_database` subset.

**Coverage:** xmon + CPW cavity only → fall back to the existing analytic inverse design for two-pad transmon / fluxonium / tunable. Wrap in `try/except` + `_SQUADDS_AVAILABLE` guard so the backend stays deployable without it.

---

## Layer 4 — scqubits + QuTiP (exact physics + calibrated gates)

**scqubits** (`pip install scqubits`, BSD, ~20 MB, NumPy/SciPy): identical charge-basis transmon to ours → use it to **benchmark/validate `physics.py`** (a `tests/test_scqubits_benchmark.py` asserting transmon/fluxonium spectra agree to ~1e-5, anharmonicity, and ZZ within 20% far from resonance). Adds capabilities we lack: exact dressed **ZZ via `HilbertSpace`** (vs our perturbative formula), **`ParameterSweep`** Kerr/χ-vs-flux, and **`SymbolicCircuit`** arbitrary-circuit quantization (the SQcircuit-style gap).
- New `backend/app/scq.py` (lazy import) + `SIMULATION_TYPES["coupled_spectrum"]` → exact dressed two-qubit spectrum + exact ZZ.

**QuTiP** (`pip install qutip`, LGPL, ~30 MB, NumPy): replace the **uncalibrated square-pulse CR** in `physics.simulate_two_qubit_gate` with a **Gaussian + DRAG** envelope via `qt.sesolve`, returning the same result shape (fidelity/leakage/trajectory). Expected **CR 90% → >99%**. DRAG β/amplitude come from an **offline** Qiskit-Dynamics+JAX calibration (run once, store params in DB) — JAX never in the request path. Seam: a one-line fork in `_two_qubit_gate` routing `gate="cr", use_calibrated_drag=true` to the QuTiP path; CZ/iSWAP stay on our fast exact propagator.

**Engine selection rule:** fast single-qubit + CZ/iSWAP → keep our `physics.py` (ms, no deps); coupled spectra / exact ZZ → scqubits; calibrated CR/CZ fidelity → QuTiP; gradient pulse optimization → Qiskit-Dynamics offline only.

---

## Layer 5 — Qiskit interop (digital twin)

**What it is:** export a QRIVARA-designed chip as a Qiskit `Target`/`BackendV2` + Aer `NoiseModel` so users **run circuits against their designed chip**. Join point = `qiskit.transpiler.Target`: our `f01→QubitProperties.frequency`, `T1/T2→t1/t2`, `gate errors→InstructionProperties.error`, design-graph edges → coupling map.

**Integration:** new `backend/app/qiskit_export.py` (`build_target_from_results`, `build_backend_from_results`, `build_noise_model`) + `GET /designs/{id}/qiskit-target` (aggregates the design's completed `SimulationJob` results → Target JSON descriptor; supplements with live `_hamiltonian` if needed). The JSON-descriptor endpoint needs **no server-side Qiskit** (pure translation); the digital-twin simulation path needs `qiskit`+`qiskit-aer` (optional). Pin `qiskit>=1.4,<3.0` (note: 2.0 removed `InstructionProperties.calibration` — we only use `duration`+`error`, so we're safe).

---

## Licensing & dependency summary (all permissive — supports the "no licence cost" thesis)

| Package | Licence | Size | Where |
|---|---|---|---|
| Palace | Apache-2.0 | (binary, Spack) | `palace_worker` only |
| Gmsh | GPL-2.0+ | ~50 MB wheel | `palace_worker` only (separate process) |
| quantum-metal | Apache-2.0 | ~150 MB w/ deps | GDS worker (`requirements-metal.txt`) |
| SQuADDS | MIT | pkg small + 103 MB data | backend (volume-cached) |
| scqubits | BSD-3 | ~20 MB | backend |
| QuTiP | LGPL | ~30 MB | backend |
| qiskit / qiskit-aer | Apache-2.0 | ~50 / ~200 MB | optional |

Keep heavy/optional deps out of the core API image — put Palace+Gmsh in the Palace worker, Metal in the GDS worker, and gate qiskit/squadds behind lazy imports + `try/except` so the base backend always deploys.

## Compute / infra implications (ties directly to the funding ask)
- **Palace full-wave needs real HPC** (multi-core/MPI; minutes–tens-of-minutes per solve; large chips need many cores). This is the concrete "one workstation is the ceiling" item in the seed report's use-of-funds.
- Add a **dedicated long-job worker pool** (Palace) separate from the fast analytic queue, with autoscaling.
- **Dataset/volume**: SQuADDS 103 MB cache; image bloat from Metal/Aer → multi-stage builds + per-worker requirements.

## How to drive Claude Code (feed in this order — one layer at a time)
1. **Palace + Gmsh:** "Implement `geometry.build_mesh()` (Gmsh OCC, edge-conforming, returns attr→role map) then `palace.py` (config emit + subprocess + CSV parse to the existing eigenmode/EPR/scattering result shapes); add the two SIMULATION_TYPES + dispatch with analytic fallback; add `Dockerfile.palace` + `palace_worker` compose service; validate against Palace's CPW example." Build + validate the **mesh stage first**.
2. **scqubits benchmark + QuTiP DRAG:** "Add `scq.py` + `test_scqubits_benchmark.py`; add `coupled_spectrum` analysis; route `cr` gate through a QuTiP DRAG path behind `use_calibrated_drag`."
3. **Qiskit Metal GDS:** "Add `metal_render.py`; map the node graph → QComponents; hook into `export.design_to_gds` with fallback; pin numpy<2; set MPLBACKEND=Agg."
4. **SQuADDS:** "Add `squadds.py` + `POST /ai/recommend-design`; cache dataset on a volume; verify geometry with our `_lom`."
5. **Qiskit interop:** "Add `qiskit_export.py` + `GET /designs/{id}/qiskit-target`; optional Aer noise-model digital twin."

## Risks (cross-cutting)
- **Mesh robustness** (Palace) is the single biggest technical risk — invest there first.
- **Build/deploy weight** — Palace (Spack/MPI), Metal (gdstk/geopandas), Aer (C++): isolate per-worker, use prebuilt wheels/containers, multi-stage Docker.
- **Version churn** — pin everything (`qiskit>=1.4,<3`, `numpy<2` for Metal, Palace release tag, `SQuADDS==` exact).
- **Keep graceful degradation** — every new engine behind a lazy import + fallback so the base platform never breaks (matches the existing "no-fake-data, never break a job" policy).

---
*Researched live (June 2026) against Palace, Gmsh, Qiskit Metal, SQuADDS, scqubits, QuTiP, Qiskit-Dynamics, and Qiskit/Aer docs + repos. Full per-repo technical briefs (with code skeletons, API tables, and source URLs) are available on request — this is the consolidated, sequenced plan.*
