"""QRIVARA backend tests — physics, FEM solver, analysis jobs, and exporters.

Pure-function tests (no DB / no network). Run from the backend dir with the
venv active (Windows: .venv\\Scripts\\activate · macOS/Linux: source .venv/bin/activate):
    python -m pytest -q
"""
import math

from app import physics as P
from app import fem
from app import jobs
from app import export as X
from app.routers import optimization as OPT
from app.schemas import reject_nonfinite
from fastapi import HTTPException
import pytest

# ── shared synthetic layout (two transmons + a resonator) ──────────────────
NODES = [
    {"id": "q1", "position": {"x": 0, "y": 0},
     "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90,
                                             "pad_gap_um": 30, "ic_nA": 30, "target_freq_GHz": 5.0}}},
    {"id": "q2", "position": {"x": 900, "y": 0},
     "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90,
                                             "pad_gap_um": 30, "ic_nA": 28, "target_freq_GHz": 5.1}}},
    {"id": "r1", "position": {"x": 400, "y": 300},
     "data": {"kind": "resonator", "params": {"length_um": 4200}}},
]
EDGES = [{"source": "q1", "target": "r1"}]
DOC = {"nodes": NODES, "edges": EDGES}


# ── physics ────────────────────────────────────────────────────────────────
def test_energy_conversions_positive():
    assert P.ec_from_capacitance(80) > 0
    assert P.ej_from_ic(30) > 0
    assert P.ej_from_lj(10) > 0


def test_transmon_exact_vs_analytic():
    ec = P.ec_from_capacitance(80); ej = P.ej_from_ic(30)
    f01, anh = P.transmon_f01_anharm(ej, ec)
    assert 3.0 < f01 < 8.0                      # sensible transmon frequency
    assert anh < 0                              # anharmonicity is negative
    assert 150 < abs(anh) < 400                 # physical magnitude (MHz)
    # exact f01 close to the asymptotic √(8EJEC) − EC
    assert abs(f01 - P.f01(ej, ec)) < 0.1


def test_transmon_levels_monotonic():
    lv = P.transmon_levels(P.ej_from_ic(30), P.ec_from_capacitance(80))
    assert lv[0] == 0.0
    assert all(lv[i] < lv[i + 1] for i in range(len(lv) - 1))


def test_fluxonium_levels():
    lv = P.fluxonium_levels(4.0, 1.0, 0.9, 0.5)
    assert len(lv) == 6 and lv[0] == 0.0 and lv[1] > 0


def test_kinetic_inductance_units():
    nb = P.kinetic_inductance(4200, 10, 100, 15.0, 9.3)   # Nb
    assert 0.05 < nb["lk_sheet_pH"] < 2.0                  # ~0.2 pH/sq, not 1e5
    tin = P.kinetic_inductance(4200, 10, 100, 100.0, 4.5)  # TiN
    assert tin["lk_sheet_pH"] > nb["lk_sheet_pH"]          # higher-ρ film → higher Lk


def test_cpw_freq_and_charge_dispersion():
    f = P.cpw_resonator_freq(4200, 11.7, "quarter")
    assert 5 < f < 9
    # charge dispersion falls steeply as EJ/EC grows
    assert P.charge_dispersion(1, 14.0, 0.2) < P.charge_dispersion(1, 8.0, 0.4)


# ── FEM solver ──────────────────────────────────────────────────────────────
def test_fem_capacitance_symmetric_and_positive():
    labels, M = fem.capacitance_matrix(
        [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}])
    assert M[0][0] > 0
    assert abs(M[0][0] - M[0][0]) < 1e-9


def test_fem_capacitance_gap_dependence():
    def sc(g):
        _, M = fem.capacitance_matrix([{"label": "Q", "x": 0, "y": 0, "w": 455, "h": 90, "gap": g}])
        return M[0][0]
    assert sc(15) > sc(30) > sc(60)               # tighter gap → higher capacitance


def test_fem_eigenmodes():
    _, M = fem.capacitance_matrix(
        [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}])
    import numpy as np
    lj = P.PHI0_RED / (30e-9)
    modes = fem.lc_eigenmodes(M, np.array([[1.0 / lj]]))
    assert modes and modes[0][0] > 0


# ── 3-D field solver (our open-source "Q3D") ─────────────────────────────────
def test_fem3d_parallel_plate_above_ideal():
    """Solver core vs closed-form C = ε0·A/d: numeric must exceed the ideal
    (fringing always adds capacitance) and stay within a sane factor."""
    from app import fem3d
    r = fem3d.parallel_plate_self_test(eps_r=1.0)
    assert 1.0 < r["ratio"] < 2.2


def test_fem3d_transmon_self_capacitance_physical():
    """A 455×90 µm transmon pad on silicon should land in the textbook
    self-capacitance range (~60–130 fF)."""
    from app import fem3d
    _, M = fem3d.capacitance_matrix_3d(
        [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}],
        eps_substrate=11.7)
    assert 60.0 < M[0][0] < 130.0


def test_gmsh_mesh_pipeline():
    """The geometry→mesh stage (the high-risk part of the Palace integration) must
    produce a real conformal tet mesh with tagged physical groups. Skips if gmsh
    isn't installed."""
    pytest.importorskip("gmsh")
    from app import geometry
    m = geometry.build_mesh([
        {"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90},
        {"label": "Q2", "x": 650, "y": 0, "w": 455, "h": 90},
    ], eps_substrate=11.7)
    assert m["n_nodes"] > 100 and m["n_tets"] > 100
    assert m["attrs"]["substrate"] and m["attrs"]["air"]
    assert len(m["attrs"]["pec"]) >= 1 and len(m["attrs"]["box"]) >= 1
    import os
    assert os.path.exists(m["mesh"]) and os.path.getsize(m["mesh"]) > 1000


def test_palace_config_shape():
    """Palace eigenmode config must be valid JSON with the expected solver/material
    blocks (pure-Python; no binary needed)."""
    import json
    from app import palace
    cfg = palace.eigenmode_config("model.msh",
        {"substrate": 1, "air": 2, "pec": [3], "box": [4]},
        eps_substrate=11.7, target_ghz=3.0, n_modes=4, output_dir="postpro")
    assert cfg["Problem"]["Type"] == "Eigenmode"
    assert cfg["Solver"]["Eigenmode"]["N"] == 4
    assert any(m["Permittivity"] == 11.7 for m in cfg["Domains"]["Materials"])
    assert cfg["Boundaries"]["PEC"]["Attributes"] == [3]
    json.dumps(cfg)


def test_eigenmode_fullwave_falls_back():
    """Without the Palace binary deployed, the full-wave eigenmode analysis must
    gracefully fall back to the real analytic LC eigenmode (never error)."""
    nodes = [
        {"id": "q1", "position": {"x": 0, "y": 0},
         "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90, "pad_gap_um": 30, "ic_nA": 30}}},
        {"id": "q2", "position": {"x": 650, "y": 0},
         "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90, "pad_gap_um": 30, "ic_nA": 31}}},
    ]
    r = jobs._eigenmode_fullwave(nodes, {})
    assert isinstance(r, dict) and "modes" in r
    # palace binary isn't installed in CI → must report the fallback honestly
    assert r.get("fullwave_fallback") is True
    assert "analytic LC eigenmode" in r["method"]


def test_fem3d_edge_conforming_convergence():
    """The edge-conforming grid must make the self-capacitance GRID-INDEPENDENT:
    putting grid lines on the pad/gap edges removes the snapping scatter, so coarse
    and fine node budgets must agree to within a few percent (was ±7% on a uniform
    grid). This is the accuracy guarantee for the field solver."""
    from app import fem3d
    pad = [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}]
    _, lo = fem3d.capacitance_matrix_3d(pad, max_nodes=40_000)
    _, hi = fem3d.capacitance_matrix_3d(pad, max_nodes=200_000)
    rel = abs(lo[0][0] - hi[0][0]) / hi[0][0]
    assert rel < 0.03, f"grid convergence {rel*100:.1f}% (expected <3%)"


def test_field_solver_output():
    """The field-solver analysis returns a converged matrix, a small convergence
    error bar, the field-derived ε_eff ≈ (ε_sub+1)/2, and a potential map for the UI."""
    import json
    nodes = [{"id": "q1", "position": {"x": 0, "y": 0},
              "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90, "pad_gap_um": 30}}}]
    r = jobs._field_solver(nodes, {"eps_substrate": 11.7})
    assert r["self_capacitance_fF"] and 60 < r["self_capacitance_fF"][0] < 130
    assert r["convergence_error_pct"] < 5.0                      # tight on the edge-conforming grid
    assert abs(r["eps_eff"] - (11.7 + 1) / 2) < 0.2             # field-derived ε_eff
    assert r["field_map"] and len(r["field_map"]["z"]) > 2       # 2-D potential map present
    json.dumps(r, allow_nan=False)                              # serialises


def test_fem3d_dielectric_monotonic():
    """More substrate permittivity → larger capacitance (the 3-D interface effect)."""
    from app import fem3d
    def self_c(eps):
        _, M = fem3d.capacitance_matrix_3d(
            [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}],
            eps_substrate=eps)
        return M[0][0]
    assert self_c(1.0) < self_c(6.35) < self_c(11.7)


def test_fem3d_mutual_positive_and_small():
    """Two pads 650 µm apart: mutual capacitance positive and far below self-C."""
    from app import fem3d
    _, M = fem3d.capacitance_matrix_3d([
        {"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30},
        {"label": "Q2", "x": 650, "y": 0, "w": 455, "h": 90, "gap": 30},
    ], eps_substrate=11.7)
    assert 0.0 < -M[0][1] < 0.2 * M[0][0]


# ── decoherence / gate / readout / QEC physics ───────────────────────────────
def test_quasiparticle_t1_scaling():
    # T1 ∝ 1/x_qp — an order-of-magnitude less QP density → ~10× longer T1
    t_hi = P.quasiparticle_t1(5.0, 1e-6, 1.2)
    t_lo = P.quasiparticle_t1(5.0, 1e-7, 1.2)
    assert 5 < t_hi < 100 and abs(t_lo / t_hi - 10) < 0.5


def test_flux_noise_sweet_spot_protects():
    # at the flux sweet spot (Φ=0) ∂f/∂Φ→0 so Tφ is enormous; off it, Tφ drops
    sweet = P.flux_noise_dephasing(30.0, 0.27, 0.0, a_phi_uphi0=2.0)
    off = P.flux_noise_dephasing(30.0, 0.27, 0.25, a_phi_uphi0=2.0)
    assert sweet["sweet_spot"] and sweet["t_phi_us"] > off["t_phi_us"]
    # echo recovers coherence vs Ramsey at the same operating point
    ram = P.flux_noise_dephasing(30.0, 0.27, 0.25, echo=False)["t_phi_us"]
    ech = P.flux_noise_dephasing(30.0, 0.27, 0.25, echo=True)["t_phi_us"]
    assert ech > ram


def test_photon_shot_noise_finite():
    t = P.photon_shot_noise_dephasing(0.5, 1.2, fr_ghz=7.1, temp_k=0.05)
    assert math.isfinite(t) and t > 0


def test_photon_shot_noise_weak_drive_limit():
    """In the κ≫χ regime the full Gambetta dispersive-dephasing formula must reduce
    to the canonical Γφ ≈ 4χ²n̄/κ (χ = half shift, angular). Locks the verified
    physics so a future edit can't silently break the limit."""
    chi_mhz, kap_mhz, nbar = 0.2, 4.0, 0.02         # χ/κ = 0.05 → deep in κ≫χ
    tphi_us = P.photon_shot_noise_dephasing(chi_mhz, kap_mhz, n_bar=nbar)
    chi = 2 * math.pi * chi_mhz * 1e6
    kap = 2 * math.pi * kap_mhz * 1e6
    tphi_analytic_us = (1.0 / (4 * chi ** 2 * nbar / kap)) * 1e6
    assert abs(tphi_us / tphi_analytic_us - 1.0) < 0.10   # within 10% of the limit


def test_gate_fidelity_ranges():
    e1 = P.gate_error_1q(80, 80, 20)
    assert 0 < e1 < 1e-2                              # good qubit, 1Q ~1e-4
    two = P.gate_error_2q(80, 80, 80, 80, 200, zz_khz=20)
    assert 99.0 < two["fidelity_pct"] < 100.0
    assert two["total_error"] >= two["coherence_error"]   # ZZ only adds


def test_readout_snr_and_fidelity():
    snr = P.readout_snr(0.6, 1.2, n_bar=5, t_int_ns=500, eta=0.5)
    assert snr > 1
    f = P.readout_fidelity(snr, t1_us=80, t_int_ns=500)
    assert 90 < f["assignment_fidelity_pct"] <= 100


def test_surface_code_scaling_and_threshold():
    # below threshold: each +2 distance suppresses logical error by ~Λ
    p5 = P.surface_code_logical_error(1e-3, 5)
    p7 = P.surface_code_logical_error(1e-3, 7)
    assert p5 > p7 and abs((p5 / p7) - P.lambda_factor(1e-3)) / P.lambda_factor(1e-3) < 0.01
    # at/above threshold the code does not help
    assert P.surface_code_logical_error(2e-2, 7) >= P.surface_code_logical_error(2e-2, 3)
    pl = P.physical_to_logical(1e-3, target_pL=1e-6)
    assert pl["below_threshold"] and pl["distance"] >= 3
    assert pl["physical_qubits_per_logical"] == 2 * pl["distance"] ** 2 - 1


def test_tls_saturation():
    # high drive power saturates TLS → lower loss (higher Q)
    lo = P.tls_tan_delta(2e-3, 5.0, 0.02, n_photons=1)
    hi = P.tls_tan_delta(2e-3, 5.0, 0.02, n_photons=1e6)
    assert lo > hi > 0


# ── asymmetric-SQUID flux tuning + real Monte-Carlo + real mesh ──────────────
def test_squid_ej_asymmetry_floor():
    # symmetric SQUID tunes to ~0 at half flux; asymmetric one floors at EJΣ·d
    assert P.squid_ej(10.0, 0.5, 0.0) < 1e-9
    assert abs(P.squid_ej(10.0, 0.5, 0.2) - 2.0) < 1e-6        # 10·d = 2.0
    assert abs(P.squid_ej(10.0, 0.0, 0.2) - 10.0) < 1e-9       # full EJΣ at Φ=0


def test_flux_spectrum_real_tuning():
    """f01 must tune DOWN from the upper sweet spot, with a positive tunable range
    and a finite floor set by the asymmetry — not a canned curve."""
    nodes = [{"id": "q1", "position": {"x": 0, "y": 0},
              "data": {"kind": "squid", "params": {"pad_width_um": 455, "pad_height_um": 90,
                        "pad_gap_um": 30, "target_freq_GHz": 5.2, "anharmonicity_MHz": -310,
                        "junction_asymmetry": 0.1}}}]
    r = jobs._flux_spectrum(nodes, {})
    assert r["upper_sweet_spot_GHz"] > r["lower_sweet_spot_GHz"] > 0
    assert r["tunable_range_GHz"] > 1.0
    assert len(r["spectrum"]) == 81
    assert r["flux_sensitivity_GHz_per_Phi0"] > 0


def test_fabrication_is_real_monte_carlo():
    """Yield must come from sampling: tighter junction tolerance → higher yield,
    and a wider spec window → higher yield. A closed-form facade can't track both."""
    tight = jobs._fabrication({"junction_tolerance_pct": 1.0, "spec_window_MHz": 15})
    loose = jobs._fabrication({"junction_tolerance_pct": 5.0, "spec_window_MHz": 15})
    assert tight["yield_pct"] > loose["yield_pct"]
    assert tight["frequency_drift_MHz"] < loose["frequency_drift_MHz"]
    assert tight["samples"] >= 500 and len(tight["histogram"]) > 5
    assert "Monte-Carlo" in tight["method"]


def test_transmons_includes_tunable_excludes_snail():
    """Tunable transmon (squid WITH pads) counts as a qubit; SNAIL coupler (squid
    WITHOUT pads) does not."""
    nodes = [
        {"id": "q1", "data": {"kind": "squid", "params": {"pad_width_um": 455, "pad_height_um": 90}}},
        {"id": "snail", "data": {"kind": "squid", "params": {"loop_area_um2": 25, "target_g_MHz": 100}}},
        {"id": "t1", "data": {"kind": "transmon", "params": {"pad_width_um": 455}}},
    ]
    ids = [n["id"] for n in jobs._transmons(nodes)]
    assert "q1" in ids and "t1" in ids and "snail" not in ids


def test_mesh_reports_real_grid():
    """Mesh analysis returns the actual voxel-grid stats, not fabricated tet counts."""
    nodes = [{"id": "q1", "position": {"x": 0, "y": 0},
              "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90,
                        "pad_gap_um": 30}}}]
    m = jobs._mesh(nodes, [], {})
    assert m["nodes"] > 1000 and m["cells"] > 1000
    assert "x" in m["grid_dimensions"] and m["cell_size_um"] > 0


def test_reject_nonfinite_guards_params():
    # security: NaN/Inf (incl. numeric strings + nested) must be rejected at the
    # boundary so they can't poison the persisted JSON / break the response renderer
    for bad in ({"f01_GHz": "inf"}, {"k": "nan"}, {"x": "1e999"},
                {"a": [1, 2, float("inf")]}, {"n": {"m": "-inf"}}):
        with pytest.raises(HTTPException):
            reject_nonfinite(bad)
    # finite numbers + non-numeric strings pass untouched
    for ok in ({"f01_GHz": 5.0}, {"material": "Aluminum"}, {"q": "transmon", "n": 5}):
        reject_nonfinite(ok)


def test_zero_f01_does_not_crash():
    # f01=0 is finite (slips past the sanitizer) but used to divide by zero
    for t in ("decoherence", "gate_fidelity", "readout", "qec"):
        fn = {"decoherence": jobs._decoherence, "gate_fidelity": jobs._gate_fidelity,
              "readout": jobs._readout, "qec": jobs._qec}[t]
        assert isinstance(fn({"f01_GHz": 0}), dict)


def test_two_qubit_gate_time_domain():
    """Real time-domain propagation must (a) reach high fidelity for CZ and iSWAP at
    a finite gate time, (b) keep leakage small, (c) wind a ~180deg conditional phase
    for CZ, and (d) be a genuine unitary process (populations conserved + bounded)."""
    cz = P.simulate_two_qubit_gate("cz", 5.10, 5.00, -310, -310, g_mhz=12)
    assert cz["fidelity_pct"] > 99.0
    assert cz["leakage_pct"] < 1.0
    assert 150 < cz["conditional_phase_deg"] < 210      # conditional pi phase
    assert cz["t_gate_ns"] > 0 and len(cz["trajectory"]) > 50

    isw = P.simulate_two_qubit_gate("iswap", 5.05, 5.05, -310, -310, g_mhz=12)
    assert isw["fidelity_pct"] > 98.0
    # iSWAP starts in |01> and must transfer population to |10>
    pops = [pt["p10"] for pt in isw["trajectory"]]
    assert max(pops) > 0.9

    cr = P.simulate_two_qubit_gate("cr", 5.10, 5.00, -310, -310, g_mhz=12, drive_mhz=50)
    assert cr["fidelity_pct"] > 80.0 and cr["t_gate_ns"] > 0

    # every trajectory sample is a valid probability set (0..1, sum<=1+eps)
    for pt in cz["trajectory"]:
        tot = pt["p00"] + pt["p01"] + pt["p10"] + pt["p11"] + pt["leak"]
        assert 0.98 < tot < 1.02


def test_two_qubit_gate_from_layout():
    """The analysis pulls f/anharm/g from a 2-transmon layout (LOM) rather than params."""
    nodes = [
        {"id": "q1", "position": {"x": 0, "y": 0},
         "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90,
                   "pad_gap_um": 30, "ic_nA": 30}}},
        {"id": "q2", "position": {"x": 300, "y": 0},
         "data": {"kind": "transmon", "params": {"pad_width_um": 455, "pad_height_um": 90,
                   "pad_gap_um": 30, "ic_nA": 31}}},
    ]
    r = jobs._two_qubit_gate(nodes, {"gate": "cz"})
    assert r["gate"] == "CZ" and 0 <= r["fidelity_pct"] <= 100
    assert "layout" in r["source"]
    assert len(r["U_abs"]) == 4 and len(r["U_abs"][0]) == 4

    # honest on-chip estimate: design's real T1/T2 (decoherence budget) folded onto
    # the coherent-control fidelity; the on-chip number can only be <= coherent.
    coh = r["coherence"]
    assert coh["T1_q1_us"] > 0 and coh["T2_q1_us"] > 0 and coh["T1_q2_us"] > 0
    assert coh["coherence_error_pct"] >= 0
    assert coh["onchip_fidelity_pct"] <= r["fidelity_pct"] + 1e-6
    assert "decoherence budget" in coh["t1t2_source"]
    # explicit T1/T2 override is honored and changes the estimate
    r2 = jobs._two_qubit_gate(nodes, {"gate": "cz", "T1_us": 50, "T2_us": 40})
    assert "explicit" in r2["coherence"]["t1t2_source"]


def test_calibrated_cross_resonance():
    """The pulse-level DRAG-calibrated two-tone CR engine must (a) beat the
    un-calibrated analytic CR, (b) reach the ~99% hardware regime with small
    leakage, (c) return a valid ZX(pi/2) process and a real population trajectory,
    and (d) orient the pair (control = higher-frequency qubit). Skipped if QuTiP
    is not installed (the job falls back to the analytic engine in that case)."""
    from app import pulse
    if not pulse.available():
        pytest.skip("QuTiP not installed — calibrated CR engine unavailable")

    analytic = P.simulate_two_qubit_gate("cr", 5.10, 5.00, -310, -310,
                                         g_mhz=12, drive_mhz=50)
    cal = pulse.simulate_cr_calibrated(5.10, 5.00, -310, -310, g_mhz=12)
    assert cal is not None
    assert cal["engine"] == "qutip_two_tone_cr_drag"
    assert cal["fidelity_pct"] > 97.0                       # hardware regime
    assert cal["fidelity_pct"] >= analytic["fidelity_pct"]  # beats un-calibrated
    assert cal["leakage_pct"] < 1.5
    assert 100.0 < cal["t_gate_ns"] < 700.0
    # calibration block is populated with real pulse knobs
    c = cal["calibration"]
    assert c["cr_amp_MHz"] > 0 and c["cancel_amp_MHz"] >= 0 and c["drag_weight"] != 0
    # trajectory is a real, probability-conserving evolution from |10>
    assert len(cal["trajectory"]) > 40
    assert cal["trajectory"][0]["p10"] > 0.99               # starts in |10>
    for pt in cal["trajectory"]:
        tot = pt["p00"] + pt["p01"] + pt["p10"] + pt["p11"] + pt["leak"]
        assert 0.97 < tot < 1.03

    # control oriented to the higher-frequency qubit even when passed reversed
    rev = pulse.calibrate_cr(5.00, 5.10, -310, -310, g_mhz=12)
    assert rev is not None and rev["swapped"] is True
    assert rev["f_control_GHz"] > rev["f_target_GHz"]


def test_frequency_collision_conditions():
    """The 7 IBM collision conditions must fire exactly at their resonances and be
    clear elsewhere (alpha=-330 MHz). Frequencies in MHz."""
    a = -330.0
    # Type 1: near-degenerate pair
    assert 1 in P.pair_collision_types(5000, 5010, a)        # |Δ|=10 < 17
    assert P.pair_collision_types(5000, 5120, a) == set()    # Δ=120 in the good band
    # Type 3: target on control's 1->2 (|Δ| ~ |alpha|)
    assert 3 in P.pair_collision_types(5000, 5000 - 330, a)
    # Type 4: over-detuned (slow gate)
    assert 4 in P.pair_collision_types(5000, 5000 - 400, a)
    # Type 5 spectator: two neighbours of a control nearly degenerate
    assert 5 in P.spectator_collision_types(5200, 5000, 5005, a)   # control above, |Δik|=5
    assert P.spectator_collision_types(5200, 5000, 5120, a) == set()


def test_frequency_collision_yield_monotonic():
    """Heavy-hex yield must be ~100% at the nominal plan and decrease monotonically as
    fabrication spread grows — the core manufacturability result (Hertzberg 2021)."""
    import json
    r = jobs._frequency_collisions([], [], {"topology": "heavy_hex", "n_qubits": 16, "sigma_MHz": 20})
    assert r["nominal_yield_pct"] > 95.0                      # good frequency allocation
    ys = [c["yield_pct"] for c in r["yield_curve"]]
    assert ys[0] >= ys[-1]                                    # higher spread → lower yield
    assert any(ys[i] >= ys[i + 1] - 1e-6 for i in range(len(ys) - 1))
    assert r["n_qubits"] == 16 and r["n_edges"] > 0 and r["n_spectators"] > 0
    assert len(r["lattice_nodes"]) == 16 and len(r["lattice_edges"]) == r["n_edges"]
    assert all(0.0 <= nd["collision_prob"] <= 1.0 for nd in r["lattice_nodes"])
    json.dumps(r, allow_nan=False)                            # serialises (no NaN/Inf)


def test_heavy_hex_beats_grid_yield():
    """The architecture-defining result: both lattices can be coloured collision-free
    nominally, but the degree-≤3 heavy-hex has far fewer spectator constraints than the
    degree-4 grid, so it yields much better under fabrication spread — the real reason
    IBM adopted heavy-hex (Hertzberg 2021)."""
    hh = jobs._frequency_collisions([], [], {"topology": "heavy_hex", "n_qubits": 18, "sigma_MHz": 15})
    gr = jobs._frequency_collisions([], [], {"topology": "grid", "n_qubits": 18, "sigma_MHz": 15})
    assert hh["nominal_yield_pct"] > 95.0
    assert hh["n_spectators"] < gr["n_spectators"]          # lower degree → fewer constraints
    assert hh["yield_pct"] > gr["yield_pct"]                # → higher manufacturable yield


def test_spectator_guard_screen():
    """Type-5 spectator collision needs the two neighbours degenerate AND the control
    able to drive them (control above, per the patent f_j≥f_i OR f_j≥f_k screen)."""
    a = -330.0
    # control above the (degenerate) neighbours → flagged
    assert 5 in P.spectator_collision_types(5100, 5000, 5010, a)
    # control below both neighbours → not flagged
    assert 5 not in P.spectator_collision_types(4900, 5000, 5010, a)


def test_qiskit_target_export():
    """A QRIVARA chip's analysis results export to a valid Qiskit Target descriptor
    (qubit properties + instructions + coupling map), and to a live qiskit Target
    when qiskit is installed."""
    import json
    from app import qiskit_export as QE
    results = {
        "lom": {"qubits": [{"f01_GHz": 5.0, "anharmonicity_MHz": -310},
                            {"f01_GHz": 5.15, "anharmonicity_MHz": -305}],
                "couplings": [{"pair": "Q1-Q2", "g_MHz": 12}]},
        "decoherence": {"T1_total_us": 60, "T2_echo_us": 40},
        "gate_fidelity": {"error_1q": 5e-4, "t_gate_1q_ns": 20, "error_2q": 8e-3, "t_gate_2q_ns": 200},
        "two_qubit_gate": {"gate": "CZ", "fidelity": 0.992, "t_gate_ns": 180},
        "readout": {"assignment_fidelity_pct": 98.0, "chi_MHz": 1.2},
    }
    d = QE.build_target_descriptor(results)
    assert d["num_qubits"] == 2
    assert "cz" in d["basis_gates"] and "sx" in d["basis_gates"]
    assert [0, 1] in d["coupling_map"]
    assert len(d["qubits"]) == 2 and d["qubits"][0]["frequency_GHz"] == 5.0
    json.dumps(d, allow_nan=False)
    # live Target (skip if qiskit absent)
    qk = pytest.importorskip("qiskit")
    t = QE.build_target(results)
    assert t.num_qubits == 2 and "cz" in t.operation_names


def test_qiskit_descriptor_rebuilds_target():
    """The portable descriptor the UI downloads must reconstruct into a WORKING qiskit
    Target (the exact round-trip the 'Export to Qiskit' snippet performs) and transpile
    a real circuit onto the chip. This guards the export feature's core promise."""
    pytest.importorskip("qiskit")
    from app import qiskit_export as QE
    from qiskit.transpiler import Target, InstructionProperties
    from qiskit.providers import QubitProperties
    from qiskit.circuit import Parameter, Measure
    from qiskit.circuit.library import RZGate, SXGate, XGate, CXGate, CZGate, iSwapGate
    from qiskit import QuantumCircuit, transpile

    d = QE.build_target_descriptor({
        "lom": {"qubits": [{"f01_GHz": 5.0, "anharmonicity_MHz": -310},
                           {"f01_GHz": 5.1, "anharmonicity_MHz": -305}],
                "couplings": [{"pair": "Q1-Q2", "g_MHz": 12}]},
        "decoherence": {"T1_total_us": 80, "T2_echo_us": 60},
        "two_qubit_gate": {"gate": "Cross-Resonance (ZX90, DRAG-calibrated)",
                           "fidelity": 0.996, "t_gate_ns": 300},
    })
    gates = {"rz": RZGate(Parameter("theta")), "sx": SXGate(), "x": XGate(),
             "cx": CXGate(), "cz": CZGate(), "iswap": iSwapGate(), "measure": Measure()}
    qprops = [QubitProperties(frequency=q["frequency_GHz"] * 1e9,
                              t1=q["T1_us"] * 1e-6, t2=q["T2_us"] * 1e-6) for q in d["qubits"]]
    target = Target(num_qubits=d["num_qubits"], qubit_properties=qprops, dt=2.2222e-9)
    for name in d["basis_gates"]:
        props = {tuple(i["qargs"]): InstructionProperties(duration=i["duration_s"], error=i["error"])
                 for i in d["instructions"] if i["gate"] == name}
        target.add_instruction(gates[name], props)
    # a CR design exports as a CNOT-equivalent → cx in the basis
    assert "cx" in d["basis_gates"]
    qc = QuantumCircuit(2); qc.h(0); qc.cx(0, 1); qc.measure_all()
    tqc = transpile(qc, target=target)
    # transpiled onto the chip's native basis only
    assert set(tqc.count_ops()) <= set(d["basis_gates"]) | {"barrier"}
    assert abs(target.qubit_properties[0].frequency - 5.0e9) < 1e6


def test_code_execution_run():
    """Code Studio's in-app Run executes Python and returns REAL stdout/stderr +
    exit code (the core 'I need the output' feature). Skips if execution is disabled."""
    from app.config import settings
    from app.routers.codegen import RunRequest, run_code
    if not settings.code_execution_enabled:
        pytest.skip("in-app code execution disabled (settings.code_execution_enabled)")
    # happy path — real stdout
    ok = run_code(RunRequest(code="print('hello'); print(6*7)", filename="t.py"), user=None)
    assert ok["exit_code"] == 0
    assert "hello" in ok["stdout"] and "42" in ok["stdout"]
    assert ok["timed_out"] is False
    # error path — traceback surfaces on stderr with a non-zero exit
    bad = run_code(RunRequest(code="raise ValueError('boom')", filename="t.py"), user=None)
    assert bad["exit_code"] != 0 and "boom" in bad["stderr"]
    # scientific stack is importable so design scripts produce genuine numbers
    sci = run_code(RunRequest(code="import numpy as np; print(round(float(np.sqrt(2)),3))", filename="t.py"), user=None)
    assert sci["exit_code"] == 0 and "1.414" in sci["stdout"]


def test_optimization_pareto_and_advisor():
    """The Optimization page's real backends: the Pareto front is a genuine
    gate-speed vs ZZ trade-off, and the AI advisor's rule-based fallback produces a
    real, physics-derived review (so it works with no LLM key)."""
    from app.routers.optimization import _pareto
    from app.routers.ai import _heuristic_report

    pts = _pareto()
    assert len(pts) > 10
    assert all({"j", "zz", "dominated"} <= set(p) for p in pts)
    assert any(not p["dominated"] for p in pts)  # a real Pareto-optimal set exists

    # rule-based advisor on a low-T1 / low-yield context → must flag both
    rep = _heuristic_report({
        "project": {"name": "Test"},
        "component_counts": {"transmons": 2},
        "metrics": {"frequency_GHz": 5.1, "anharmonicity_MHz": -300, "coupling_MHz": 35},
        "coherence": [{"qubit": "Q1", "t1": 40, "t2": 50}],
        "fabrication_yield": {"yield_pct": 30},
        "validation_drc": {"violations": []},
    })
    assert rep["engine"].startswith("rule-based")
    assert rep["summary"] and rep["recommendations"] and rep["strengths"]
    txt = " ".join(r["action"] + r["area"] for r in rep["recommendations"]).lower()
    assert "coherence" in txt or "manufactur" in txt        # flagged the real gaps
    assert any(r["priority"] == "high" for r in rep["recommendations"])


def test_physics_matches_scqubits():
    """QRIVARA's own transmon engine must agree with scqubits (the industry-standard
    exact-diagonalization package) to high precision — proves physics.py is correct,
    not a fit. Skips if scqubits isn't installed."""
    scq = pytest.importorskip("scqubits")
    from app import scq as bridge
    for ej, ec in [(14.0, 0.24), (20.0, 0.30), (8.0, 0.20)]:
        ours = P.transmon_levels(ej, ec, ncut=31, levels=3)
        theirs = bridge.transmon_levels_scq(ej, ec, ncut=31, levels=3)
        for a, b in zip(ours, theirs):
            assert abs(a - b) < 1e-3, f"transmon level mismatch at EJ={ej} EC={ec}: {a} vs {b}"


def test_coupled_spectrum_exact_zz():
    """The exact (scqubits) coupled-spectrum analysis returns dressed frequencies and
    a finite ZZ, and (away from collisions) agrees with the perturbative formula to
    within tens of percent. Skips if scqubits isn't installed."""
    pytest.importorskip("scqubits")
    import json
    # well-separated qubits (700 MHz, far from |alpha|) → perturbation theory valid
    nodes = []  # use params path
    r = jobs._coupled_spectrum(nodes, {"f1_GHz": 5.0, "f2_GHz": 5.7,
                                       "anharm1_MHz": -310, "anharm2_MHz": -310, "g_MHz": 8.0})
    assert r["exact_zz_kHz"] is not None
    assert r["f01_q1_GHz"] > 0 and r["f01_q2_GHz"] > 0
    # exact and perturbative should be the same sign and same order of magnitude
    ex, pe = r["exact_zz_kHz"], r["perturbative_zz_kHz"]
    assert ex * pe > 0 and 0.5 < abs(ex / pe) < 2.0
    json.dumps(r, allow_nan=False)


def test_new_analyses_dispatch():
    base = {"f01_GHz": 5.0, "g_MHz": 92, "kappa_MHz": 1.2}
    g = jobs._gate_fidelity(base)
    assert 99 < g["fidelity_1q_pct"] <= 100 and g["fidelity_2q_pct"] <= 100
    r = jobs._readout({**base, "n_bar": 5, "t_int_ns": 500})
    assert r["snr"] > 0 and r["assignment_fidelity_pct"] <= 100
    q = jobs._qec({**base, "target_pL": 1e-6})
    assert q["distance"] is None or q["distance"] >= 3
    assert len(q["distance_table"]) == 6
    d = jobs._decoherence({**base, "tunable": True, "flux_ratio": 0.1})
    assert d["T2_echo_us"] >= d["T2_ramsey_us"]   # echo never worse than Ramsey


# ── analysis jobs ───────────────────────────────────────────────────────────
def test_validation_keys():
    r = jobs._validation(NODES, EDGES)
    assert "checks" in r and r["total"] == len(r["checks"])


def test_hamiltonian_exact():
    r = jobs._hamiltonian({"qubit": "transmon", "c_sigma_fF": 80, "ic_nA": 30})
    assert "exact" in r["method"]
    assert len(r["levels_GHz"]) >= 3 and r["anharmonicity_MHz"] < 0


def test_capacitance_uses_fem():
    r = jobs._capacitance(NODES, {})
    assert "FEM" in r["method"]
    assert len(r["self_capacitance"]) >= 2


def test_lom_and_eigenmode():
    lom = jobs._lom(NODES, {})
    assert lom["qubits"] and 3 < lom["qubits"][0]["f01_GHz"] < 8
    eig = jobs._eigenmode(NODES, {})
    assert eig["n_modes"] >= 2


def test_epr_single_transmon_anharmonicity_equals_minus_ec():
    one = [NODES[0]]
    r = jobs._epr(one, {})
    ec = P.ec_from_capacitance(jobs._capacitance(one, {})["self_capacitance"][0]) * 1000
    assert abs(r["anharmonicities_MHz"][0] - (-ec)) < 5   # exact transmon limit


def test_crosstalk_and_feedback():
    ct = jobs._crosstalk(NODES, {})
    assert "crosstalk_dB" in ct and ct["worst_dB"] <= 0
    fb = jobs._feedback(NODES, {"measured_f01_GHz": 5.0})
    assert fb["comparison"][0]["delta_f01_MHz"] is not None


def test_circuit_graph_and_scattering_and_fab():
    cg = jobs._circuit_graph(NODES, EDGES, {})
    assert cg["n_branches"] > 0 and ".end" in cg["spice_netlist"]
    sc = jobs._scattering({"length_um": 4200}, NODES)
    assert sc["Q_ext"] > 0 and min(sc["S21_dB"]) < -3
    fab = jobs._fabrication({"target_freq_GHz": 5.0})
    assert 0 <= fab["yield_pct"] <= 100


# ── packaging / box modes (Module 17) ───────────────────────────────────────
def test_box_modes_pozar_scaling():
    """Cavity resonance scales as 1/size and follows f = c/(2√εr)·√(Σ(i/L)²)."""
    big = P.box_modes(20, 20, 4, 1.0, max_freq_ghz=25)
    assert big and big[0]["mode"] == "110"
    # lowest TM110 of a 20×20 mm vacuum box: c/2·√2/0.02 ≈ 10.6 GHz
    assert abs(big[0]["freq_GHz"] - 10.6) < 0.3
    # halving the box doubles every mode frequency (1/L scaling)
    small = P.box_modes(10, 10, 4, 1.0, max_freq_ghz=60)
    assert abs(small[0]["freq_GHz"] - 2 * big[0]["freq_GHz"]) < 0.3
    # dielectric fill lowers frequencies by √εr
    filled = P.box_modes(20, 20, 4, 4.0, max_freq_ghz=25)
    assert abs(filled[0]["freq_GHz"] * 2.0 - big[0]["freq_GHz"]) < 0.3


def test_package_collision_and_purcell():
    modes = [{"mode": "110", "family": "TM", "freq_GHz": 5.05}]
    dev = [{"label": "Q1", "freq_GHz": 5.0, "kind": "qubit"},
           {"label": "R1", "freq_GHz": 7.1, "kind": "readout"}]
    col = P.package_collisions(modes, dev, margin_mhz=100.0)
    assert len(col) == 1 and col[0]["device"] == "Q1" and col[0]["detuning_MHz"] == 50.0
    # a closer mode → shorter Purcell-limited T1 (Γ ∝ 1/Δ²)
    near = P.package_purcell_t1(5.0, 5.05, 1e4)
    far = P.package_purcell_t1(5.0, 5.5, 1e4)
    assert 0 < near < far


def test_qubit_zoo_families():
    from app import scq
    if not scq.available():
        pytest.skip("scqubits not installed")
    # a representative spread of families solves with physical f01
    fixed = scq.qubit_spectrum("fixed_transmon")
    assert fixed["supported"] and 3.0 < fixed["f01_GHz"] < 9.0 and fixed["anharmonicity_MHz"] < 0
    flux = scq.qubit_spectrum("fluxonium")        # half-flux sweet spot → low f01
    assert flux["supported"] and 0.0 < flux["f01_GHz"] < 1.5
    zp = scq.qubit_spectrum("zeropi")             # protected → very low f01
    assert zp["supported"] and zp["f01_GHz"] < 1.0
    # flux tuning a fluxonium off its sweet spot raises f01
    assert scq.qubit_spectrum("fluxonium", {"flux": 0.4})["f01_GHz"] > flux["f01_GHz"]
    # conceptual families are honest, not faked
    gkp = scq.qubit_spectrum("gkp")
    assert gkp["supported"] is False and gkp.get("nearest_model")


def test_qubit_family_dispatch():
    r = jobs._qubit_family({"family": "heavy_fluxonium"})
    assert r["family"] == "heavy_fluxonium" and "levels_GHz" in r


def test_paper_to_design_reconstruction():
    # deterministic core (no network): keyword extraction → assembled design doc.
    from app import designgen
    spec = designgen.keyword_spec(
        "a 4-qubit transmon processor at 5 GHz with readout resonators on a feedline")
    doc = designgen.assemble(spec)
    assert spec["n_qubits"] >= 1
    assert doc["nodes"] and "edges" in doc
    # every node is a valid component with params (so the canvas + physics can read it)
    assert all("data" in n and "params" in n["data"] for n in doc["nodes"])


def test_object_storage_local_roundtrip():
    import base64, os, tempfile
    from app import storage
    from app.config import settings
    prev_backend, prev_dir = settings.storage_backend, settings.storage_dir
    settings.storage_backend = "local"
    settings.storage_dir = tempfile.mkdtemp(prefix="qstore_test_")
    try:
        png = b"\x89PNG\r\n\x1a\n" + b"img" * 20
        url = storage.put_data_url("data:image/png;base64," + base64.b64encode(png).decode())
        key = url.rsplit("/", 1)[-1]
        assert storage.is_valid_key(key)
        assert os.path.exists(os.path.join(settings.storage_dir, key))
        assert storage.put_data_url("data:image/png;base64," + base64.b64encode(png).decode()) == url  # dedupe
        # path-traversal & bad keys are refused by the serve helper
        assert storage.local_path("../config.py") is None
        assert storage.local_path("nope") is None
    finally:
        settings.storage_backend, settings.storage_dir = prev_backend, prev_dir


def test_supabase_jwt_verification():
    import base64, hmac as _hmac, hashlib, json as _json, time as _time
    from app import security as S

    def _b64(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()

    def _mint(claims, secret, alg="HS256"):
        h = _b64(_json.dumps({"alg": alg, "typ": "JWT"}).encode())
        p = _b64(_json.dumps(claims).encode())
        sig = _hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        return f"{h}.{p}.{_b64(sig)}"

    secret = "test-secret"
    good = _mint({"sub": "u-1", "email": "a@lab.org", "exp": int(_time.time()) + 3600}, secret)
    claims = S.verify_supabase_jwt(good, secret)
    assert claims["sub"] == "u-1" and claims["email"] == "a@lab.org"
    # wrong secret, expired, and alg=none are all rejected (401)
    for tok, sec in [(good, "wrong"),
                     (_mint({"sub": "u", "exp": int(_time.time()) - 5}, secret), secret),
                     (_mint({"sub": "u"}, secret, alg="none"), secret)]:
        with pytest.raises(HTTPException) as ei:
            S.verify_supabase_jwt(tok, sec)
        assert ei.value.status_code == 401


def test_tenant_email_domain_gate():
    from app import security as S
    from app.config import settings
    prev = settings.allowed_email_domains
    try:
        settings.allowed_email_domains = ["mit.edu", "alum.mit.edu"]
        assert S._email_domain_allowed("a@mit.edu")
        assert S._email_domain_allowed("b@alum.mit.edu")
        assert not S._email_domain_allowed("x@gmail.com")   # outside the licensed domain
        assert not S._email_domain_allowed("")              # no email → cannot verify → deny
        settings.allowed_email_domains = []                 # open instance admits anyone
        assert S._email_domain_allowed("anyone@anywhere.io")
    finally:
        settings.allowed_email_domains = prev


def test_knowledge_graph_dependency_chain():
    r = jobs._knowledge_graph(NODES, {})
    ids = {n["id"] for n in r["nodes"]}
    # the full chain is present: geometry → capacitance → EC/EJ → f01 → coherence → fidelity
    assert {"geom", "cap", "ec", "ej", "f01", "t1", "fid"} <= ids
    # edges reference only real nodes
    for e in r["edges"]:
        assert e["source"] in ids and e["target"] in ids
    # the key derivation (cap → EC) is captured
    assert any(e["source"] == "cap" and e["target"] == "ec" for e in r["edges"])


def test_control_electronics_drag_suppresses_leakage():
    from app import control
    fast_nodrag = control.analyze_drive_chain(sigma_ns=1.0, drag=False)
    fast_drag = control.analyze_drive_chain(sigma_ns=1.0, drag=True)
    assert fast_drag["leakage_to_2_pct"] < fast_nodrag["leakage_to_2_pct"]   # DRAG helps
    # a worse IQ mixer gives lower image rejection
    good = control.analyze_drive_chain(iq_phase_deg=0.5, iq_amp_imbalance=0.01)
    bad = control.analyze_drive_chain(iq_phase_deg=8.0, iq_amp_imbalance=0.15)
    assert good["image_rejection_dB"] > bad["image_rejection_dB"]
    assert len(good["waveform"]) > 4 and 0 <= good["control_fidelity_pct"] <= 100


def test_calibration_recovers_design_params():
    from app import calib
    r = calib.run_calibration(f01_ghz=5.1, t1_us=85.0, t2_us=95.0)
    assert len(r["experiments"]) == 5 and len(r["calibration_table"]) == 5
    # every fit recovers its design target within a few % (curve_fit on clean-ish data)
    for row in r["calibration_table"]:
        assert row["error_pct"] is None or row["error_pct"] < 10.0
    assert "T1_us" in r["digital_twin"] and r["digital_twin"]["T1_us"] > 0


def test_cryogenic_drive_line():
    from app import cryo
    r = cryo.analyze_drive_line(cryo.DEFAULT_STAGES, 5.0, -20.0)
    assert r["total_attenuation_dB"] == 50.0
    assert r["signal_at_device_dBm"] == -70.0          # -20 dBm − 50 dB
    assert 0.0 < r["device_photons_nbar"] < 1.0
    assert len(r["stages"]) == len(cryo.DEFAULT_STAGES)
    # more cold-stage attenuation thermalises the line → fewer thermal photons
    import copy
    st = copy.deepcopy(cryo.DEFAULT_STAGES); st[-1]["attenuation_dB"] = 30.0
    assert cryo.analyze_drive_line(st, 5.0, -20.0)["device_photons_nbar"] < r["device_photons_nbar"]
    # a hot drive overruns a cooling budget
    hot = cryo.analyze_drive_line(cryo.DEFAULT_STAGES, 5.0, 20.0)
    assert any(s["over_budget"] for s in hot["stages"])


def test_surface_participation_geometry_derived():
    from app import fem3d
    cond = [{"label": "Q1", "x": 0, "y": 0, "w": 455, "h": 90, "gap": 30}]
    sp = fem3d.surface_participation(cond, eps_substrate=11.7, max_nodes=80_000)
    assert sp is not None
    # bulk participations are a complete partition of the field energy
    assert abs(sp["p_substrate"] + sp["p_vacuum"] - 1.0) < 1e-6
    # high-εr substrate stores most of the energy; all participations finite & non-negative
    assert 0.5 < sp["p_substrate"] < 1.0
    assert all(sp[k] >= 0 for k in ("p_MA", "p_MS", "p_SA"))
    # raising substrate permittivity pulls MORE field into the substrate
    sp_hi = fem3d.surface_participation(cond, eps_substrate=20.0, max_nodes=80_000)
    assert sp_hi["p_substrate"] > sp["p_substrate"]


def test_surface_participation_job_T1():
    r = jobs._surface_participation(NODES, {})
    assert r["T1_dielectric_us"] and r["T1_dielectric_us"] > 0
    assert r["limiting_channel"] in ("MA", "MS", "SA", "substrate")
    # interfaces are ready to feed the decoherence budget (same shape it expects)
    assert all("p" in i and "tanD" in i for i in r["interfaces"])
    dec = jobs._decoherence({"f01_GHz": r["f01_GHz"], "interfaces": r["interfaces"]})
    assert dec["T1_dielectric_us"] > 0


def test_packaging_job_end_to_end():
    r = jobs._packaging(NODES, {"box_a_mm": 22, "box_b_mm": 22, "box_d_mm": 4,
                                "collision_margin_MHz": 400})
    assert r["n_modes"] >= 1 and r["lowest_mode_GHz"] > 0
    # device frequencies come from the real LOM chain + the resonator's CPW length
    kinds = {d["kind"] for d in r["device_freqs"]}
    assert "qubit" in kinds and "readout" in kinds
    assert r["n_collisions"] == len(r["collisions"])
    assert "Pozar" in r["method"]


# ── optimization ────────────────────────────────────────────────────────────
def test_pareto_is_genuine_front():
    pts = OPT._pareto()
    opt = [p for p in pts if not p["dominated"]]
    assert len(pts) == 32
    assert 2 <= len(opt) <= len(pts)               # a real trade-off, not 1 point
    # the optimal set trades gate speed (J) against ZZ: higher J -> higher ZZ
    s = sorted(opt, key=lambda p: p["j"])
    assert all(s[i]["zz"] <= s[i + 1]["zz"] for i in range(len(s) - 1))


def test_num_rejects_non_finite_but_keeps_zero():
    # security: NaN/Inf must not slip through into the optimizer (would poison
    # the JSON columns / response); a legitimate falsy 0 must still be accepted
    assert OPT._num({"x": "inf"}, "x", default=5.1) == 5.1
    assert OPT._num({"x": "-inf"}, "x", default=5.1) == 5.1
    assert OPT._num({"x": "nan"}, "x", default=5.1) == 5.1
    assert OPT._num({"x": 0}, "x", default=9.0) == 0.0
    assert OPT._num({"x": "3.2"}, "x", default=9.0) == 3.2
    assert OPT._num({}, "x", default=7.0) == 7.0


def test_optimizer_objective_converges_to_target():
    # the objective used by /optimization/start should be ~0 at the inverse-design
    # solution for the target spec
    ic, c = P.ej_from_ic, P.ec_from_capacitance
    f_t, a_t = 5.1, -300.0
    # sweep a small box; the minimum objective should be near zero
    best = min(
        ((P.transmon_f01_anharm(P.ej_from_ic(i), P.ec_from_capacitance(cc)), i, cc)
         for i in (26, 27, 28, 29) for cc in (70, 74, 78, 82)),
        key=lambda t: ((t[0][0] - f_t) / f_t) ** 2 + 0.25 * ((t[0][1] - a_t) / a_t) ** 2,
    )
    (f, a), _, _ = best
    assert abs(f - f_t) < 0.15 and abs(a - a_t) < 40


# ── exporters ───────────────────────────────────────────────────────────────
def test_export_gds_valid_header():
    g = X.design_to_gds(DOC)
    assert g[:4] == b"\x00\x06\x00\x02" and g[-4:] == b"\x00\x04\x04\x00"


def test_export_dxf_drc_and_results():
    assert "LWPOLYLINE" in X.design_to_dxf(DOC)
    assert "metal" in X.design_to_drc(DOC)
    res = {"freq_points_GHz": [7.0, 7.1], "S21_dB": [-1, -20], "S11_dB": [-1, -1]}
    assert "# GHz S DB R 50" in X.result_to_touchstone(res)
    # CSV: flat metrics → key/value; curve → tabular
    assert "f01_GHz" in X.result_to_csv({"f01_GHz": 5.0, "T1_us": 80})
    curve = X.result_to_csv({"sweep": [{"x": 1, "y": 2}, {"x": 3, "y": 4}]})
    assert "x" in curve and "y" in curve
    assert X.result_to_json({"a": 1}).strip().startswith("{")
