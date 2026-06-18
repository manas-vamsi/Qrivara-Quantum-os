"""QRIVARA backend tests — physics, FEM solver, analysis jobs, and exporters.

Pure-function tests (no DB / no network). Run from the backend dir:
    .venv/Scripts/python -m pytest -q
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
