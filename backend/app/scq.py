"""scqubits bridge — exact, industry-standard superconducting-qubit modeling.

QRIVARA's `physics.py` is our own fast engine (charge-basis transmon, fluxonium,
gates); it is validated to agree with scqubits to ~1e-5 on single-qubit spectra.
This module wraps scqubits (BSD-3) for the things exact diagonalization does
better than our closed-form/perturbative formulas:

  • `coupled_spectrum` — the EXACT dressed two-transmon spectrum and ZZ interaction
    via `HilbertSpace` diagonalization. Unlike the perturbative `physics.zz_interaction`
    (which diverges near a frequency collision), this stays correct in that regime.

All scqubits imports are lazy + guarded, so the backend deploys and runs without
scqubits installed (the analysis degrades gracefully).
"""
from __future__ import annotations

import math

from . import physics


def available() -> bool:
    try:
        import scqubits  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def _ec_ej(f01_ghz: float, anh_mhz: float) -> tuple[float, float]:
    """(EC, EJ) [GHz] from a target f01 and anharmonicity (α = −EC convention)."""
    ec = max(abs(anh_mhz) / 1000.0, 1e-3)
    ej = (max(f01_ghz, 0.01) + ec) ** 2 / (8.0 * ec)
    return ec, ej


def coupled_spectrum(f1_ghz: float, f2_ghz: float, anh1_mhz: float, anh2_mhz: float,
                     g_mhz: float, levels: int = 4, ncut: int = 31) -> dict:
    """Exact dressed spectrum + ZZ of two capacitively-coupled transmons via
    scqubits `HilbertSpace`. The user-facing coupling `g_mhz` is the qubit-qubit
    EXCHANGE rate; it is converted to the n·n charge-coupling coefficient using the
    0→1 charge matrix elements so the dressed result is physically consistent with
    the rest of QRIVARA. Returns dressed levels, both qubit frequencies, the exact
    ZZ, and the perturbative ZZ for comparison."""
    import scqubits as scq

    ec1, ej1 = _ec_ej(f1_ghz, anh1_mhz)
    ec2, ej2 = _ec_ej(f2_ghz, anh2_mhz)
    dim = int(max(3, min(levels, 6)))
    t1 = scq.Transmon(EJ=ej1, EC=ec1, ng=0.0, ncut=ncut, truncated_dim=dim)
    t2 = scq.Transmon(EJ=ej2, EC=ec2, ng=0.0, ncut=ncut, truncated_dim=dim)

    # 0→1 charge matrix elements (energy eigenbasis) → exchange J = g_nn · n01_1 · n01_2
    n01_1 = abs(t1.matrixelement_table("n_operator")[0, 1])
    n01_2 = abs(t2.matrixelement_table("n_operator")[0, 1])
    denom = max(n01_1 * n01_2, 1e-6)
    g_nn = (g_mhz / 1000.0) / denom

    hs = scq.HilbertSpace([t1, t2])
    hs.add_interaction(g=g_nn, op1=t1.n_operator, op2=t2.n_operator, add_hc=False)
    hs.generate_lookup()
    n_ev = min(dim * dim, 16)
    evals = hs.eigenvals(evals_count=n_ev)
    e0 = float(evals[0])

    def E(b: tuple) -> float:
        return float(evals[hs.dressed_index(b)] - e0)

    e00, e01, e10, e11 = E((0, 0)), E((0, 1)), E((1, 0)), E((1, 1))
    zz_khz = (e11 + e00 - e01 - e10) * 1e6
    pert_khz = physics.zz_interaction(f1_ghz, f2_ghz, anh1_mhz, anh2_mhz, g_mhz)

    return {
        "f01_q1_GHz": round(e10, 5),
        "f01_q2_GHz": round(e01, 5),
        "dressed_levels_GHz": [round(float(evals[i] - e0), 5) for i in range(min(n_ev, 9))],
        "exact_zz_kHz": round(zz_khz, 3),
        "perturbative_zz_kHz": round(pert_khz, 3),
        "near_collision": abs(zz_khz) > 500.0,
        "g_MHz": round(g_mhz, 3),
        "method": "scqubits HilbertSpace exact diagonalization (dressed spectrum + ZZ)",
    }


# ── QUBIT ZOO — multi-family spectra via scqubits orchestration ─────────────────
# Each family routes to the scqubits class that actually models it (exact
# diagonalization). Families scqubits has no circuit for (bosonic encodings,
# semiconductor qubits) are marked supported=False with the NEAREST model + a paper
# reference — never a fabricated spectrum (no-fake-data). `params` are sensible
# defaults; the caller may override any of them. `solver` is read by qubit_spectrum.
QUBIT_FAMILIES: list[dict] = [
    {"id": "fixed_transmon", "label": "Fixed-frequency Transmon", "solver": "Transmon",
     "params": {"EJ": 15.0, "EC": 0.3, "ng": 0.0}, "tunable": False,
     "refs": ["Koch 2007"], "note": "The workhorse: charge-insensitive Cooper-pair box (EJ/EC≫1)."},
    {"id": "tunable_transmon", "label": "Tunable (SQUID) Transmon", "solver": "TunableTransmon",
     "params": {"EJmax": 30.0, "EC": 0.3, "d": 0.1, "flux": 0.0, "ng": 0.0}, "tunable": True,
     "refs": ["Koch 2007", "Krantz 2019"], "note": "SQUID-tuned EJ(Φ); frequency-tunable, flux-noise sensitive."},
    {"id": "xmon", "label": "Xmon", "solver": "Transmon",
     "params": {"EJ": 18.0, "EC": 0.28, "ng": 0.0}, "tunable": False,
     "refs": ["Barends 2013"], "note": "Cross-shaped planar transmon — same Hamiltonian, optimized geometry/coupling."},
    {"id": "gatemon", "label": "Gatemon", "solver": "Transmon",
     "params": {"EJ": 12.0, "EC": 0.3, "ng": 0.0}, "tunable": True,
     "refs": ["Larsen 2015", "de Lange 2015"], "note": "Semiconductor-nanowire JJ: EJ tuned by a gate voltage (modeled here as a transmon at the set EJ)."},
    {"id": "charge_qubit", "label": "Charge Qubit (Cooper-pair box)", "solver": "Transmon",
     "params": {"EJ": 2.0, "EC": 4.0, "ng": 0.5}, "tunable": False,
     "refs": ["Nakamura 1999", "Bouchiat 1998"], "note": "Transmon's ancestor in the EJ/EC≲1 regime — charge-sensitive (note ng)."},
    {"id": "fluxonium", "label": "Fluxonium", "solver": "Fluxonium",
     "params": {"EJ": 4.0, "EC": 1.0, "EL": 0.9, "flux": 0.5}, "tunable": True,
     "refs": ["Manucharyan 2009"], "note": "JJ shunted by a large superinductor; very low f01 at the half-flux sweet spot."},
    {"id": "heavy_fluxonium", "label": "Heavy Fluxonium", "solver": "Fluxonium",
     "params": {"EJ": 5.0, "EC": 0.5, "EL": 0.3, "flux": 0.5}, "tunable": True,
     "refs": ["Earnest 2018", "Lin 2018"], "note": "Fluxonium with small EC/EL → sub-GHz f01, very long T1."},
    {"id": "cshunt_flux_qubit", "label": "C-shunt Flux Qubit", "solver": "FluxQubit",
     "params": {"flux": 0.5}, "tunable": True,
     "refs": ["You 2007", "Yan 2016"], "note": "Capacitively-shunted 3-JJ flux qubit — flat sweet spot, long coherence."},
    {"id": "flux_qubit", "label": "Flux Qubit (3-JJ persistent current)", "solver": "FluxQubit",
     "params": {"flux": 0.5}, "tunable": True,
     "refs": ["Mooij 1999", "Orlando 1999"], "note": "Persistent-current qubit; double-well at half flux."},
    {"id": "zeropi", "label": "0–π Qubit", "solver": "ZeroPi",
     "params": {"flux": 0.23}, "tunable": True,
     "refs": ["Brooks 2013", "Gyenis 2021"], "note": "Intrinsically protected: disjoint wavefunctions suppress relaxation & dephasing."},
    {"id": "cos2phi", "label": "cos2φ Qubit (Bifluxon-like)", "solver": "Cos2PhiQubit",
     "params": {"flux": 0.5}, "tunable": True,
     "refs": ["Smith 2020"], "note": "Pair-tunneling element → cos(2φ) potential; charge- and flux-protected."},
    {"id": "kerr_cat", "label": "Kerr-Cat Qubit", "solver": "KerrOscillator",
     "params": {"E_osc": 6.0, "K": 0.3}, "tunable": False,
     "refs": ["Puri 2017", "Grimm 2020"], "note": "Bosonic: a Kerr nonlinear oscillator under two-photon drive stabilizes a cat manifold (the spectrum here is the bare Kerr ladder; the stabilized cat encoding/bias-preserving gates are not modeled)."},
    # ── families with no circuit Hamiltonian in scqubits — honest pointers, no fake spectra ──
    {"id": "gkp", "label": "GKP (grid-state) Qubit", "solver": "conceptual", "supported": False,
     "tunable": False, "nearest": "bosonic oscillator", "refs": ["Gottesman 2001", "Campagne-Ibarcq 2020"],
     "note": "An ENCODING of a logical qubit into oscillator grid states, not a static circuit — needs a driven/measured cavity model, out of scope for a spectrum solve."},
    {"id": "andreev", "label": "Andreev (spin) Qubit", "solver": "conceptual", "supported": False,
     "tunable": True, "nearest": "gatemon", "refs": ["Hays 2021"],
     "note": "Andreev bound states in a weak link — a mesoscopic/spin model, not a lumped circuit; closest lumped proxy is the gatemon."},
    {"id": "phase_qubit", "label": "Phase Qubit", "solver": "conceptual", "supported": False,
     "tunable": True, "nearest": "current-biased junction (washboard)", "refs": ["Martinis 2002"],
     "note": "Current-biased JJ in a tilted washboard — metastable-well levels; largely historical, superseded by the transmon."},
]

_FAMILY_BY_ID = {f["id"]: f for f in QUBIT_FAMILIES}


def _level_metrics(ev: list[float]) -> dict:
    """f01, f12 and a generic anharmonicity (f12−f01) from a level list [GHz]."""
    ev = [float(x - ev[0]) for x in ev]
    f01 = ev[1] - ev[0] if len(ev) > 1 else 0.0
    f12 = ev[2] - ev[1] if len(ev) > 2 else 0.0
    return {
        "levels_GHz": [round(x, 5) for x in ev],
        "f01_GHz": round(f01, 5),
        "f12_GHz": round(f12, 5),
        "anharmonicity_MHz": round((f12 - f01) * 1000.0, 1) if len(ev) > 2 else None,
    }


def _build_qubit(scq, fam: dict, p: dict, levels: int):
    """Instantiate the scqubits object for a family with overridable params."""
    import numpy as np
    s = fam["solver"]
    g = lambda k, d: float(p.get(k, fam["params"].get(k, d)))  # noqa: E731
    if s == "Transmon":
        return scq.Transmon(EJ=g("EJ", 15.0), EC=g("EC", 0.3), ng=g("ng", 0.0),
                            ncut=31, truncated_dim=levels)
    if s == "TunableTransmon":
        return scq.TunableTransmon(EJmax=g("EJmax", 30.0), EC=g("EC", 0.3), d=g("d", 0.1),
                                   flux=g("flux", 0.0), ng=g("ng", 0.0), ncut=31, truncated_dim=levels)
    if s == "Fluxonium":
        return scq.Fluxonium(EJ=g("EJ", 4.0), EC=g("EC", 1.0), EL=g("EL", 0.9),
                             flux=g("flux", 0.5), cutoff=110, truncated_dim=levels)
    if s == "FluxQubit":
        # symmetric 3-JJ flux qubit (α-junction = 0.8) — standard scqubits example params
        ej, ecj, ecg = 35.0, 1.0, 50.0
        return scq.FluxQubit(EJ1=ej, EJ2=ej, EJ3=0.8 * ej, ECJ1=ecj, ECJ2=ecj, ECJ3=ecj / 0.8,
                             ECg1=ecg, ECg2=ecg, ng1=0.0, ng2=0.0, flux=g("flux", 0.5),
                             ncut=10, truncated_dim=levels)
    if s == "ZeroPi":
        grid = scq.Grid1d(-6 * np.pi, 6 * np.pi, 200)
        return scq.ZeroPi(grid=grid, EJ=10.0, EL=0.04, ECJ=20.0, EC=0.04,
                          ng=g("ng", 0.1), flux=g("flux", 0.23), ncut=30, truncated_dim=levels)
    if s == "Cos2PhiQubit":
        return scq.Cos2PhiQubit(EJ=15.0, ECJ=2.0, EL=1.0, EC=0.04, dL=0.6, dCJ=0.0, dEJ=0.0,
                                flux=g("flux", 0.5), ng=g("ng", 0.0), ncut=7,
                                zeta_cut=30, phi_cut=7, truncated_dim=levels)
    if s == "KerrOscillator":
        return scq.KerrOscillator(E_osc=g("E_osc", 6.0), K=g("K", 0.3), truncated_dim=levels)
    raise ValueError(f"no scqubits builder for solver {s}")


def qubit_spectrum(family_id: str, params: dict | None = None, levels: int = 6) -> dict:
    """Exact spectrum of a named qubit family via scqubits (the Qubit Zoo). Routes the
    family to its scqubits class, returns the lowest `levels` energy levels [GHz],
    f01/anharmonicity, the params used, references and an honest note. Conceptual
    families (GKP, Andreev, phase) return supported=False with the nearest model —
    never a fabricated spectrum. Any solver error degrades to supported=False."""
    fam = _FAMILY_BY_ID.get(family_id)
    if fam is None:
        return {"family": family_id, "supported": False, "error": "unknown family",
                "method": "qubit zoo"}
    base = {"family": fam["id"], "label": fam["label"], "solver": fam["solver"],
            "tunable": fam.get("tunable", False), "refs": fam.get("refs", []),
            "note": fam.get("note", "")}
    if fam.get("supported") is False or fam["solver"] == "conceptual":
        return {**base, "supported": False, "nearest_model": fam.get("nearest"),
                "method": "conceptual — no circuit Hamiltonian (see nearest model & refs)"}
    if not available():
        return {**base, "supported": False, "error": "scqubits not installed",
                "method": "qubit zoo (scqubits unavailable)"}
    try:
        import scqubits as scq
        n = int(max(3, min(levels, 8)))
        obj = _build_qubit(scq, fam, params or {}, n)
        ev = list(obj.eigenvals(evals_count=n))
        params_used = {k: float(params.get(k, v)) for k, v in fam["params"].items()} if params else dict(fam["params"])
        return {**base, "supported": True, **_level_metrics(ev),
                "params_used": params_used,
                "method": f"scqubits {fam['solver']} exact diagonalization"}
    except Exception as exc:  # noqa: BLE001 — exotic constructors vary across scqubits versions
        return {**base, "supported": False, "error": str(exc)[:120],
                "method": f"scqubits {fam['solver']} — solve failed (graceful)"}


def transmon_levels_scq(ej: float, ec: float, ng: float = 0.0, ncut: int = 31,
                        levels: int = 4) -> list[float]:
    """scqubits transmon spectrum [GHz] relative to ground — for benchmarking
    `physics.transmon_levels`."""
    import scqubits as scq
    t = scq.Transmon(EJ=ej, EC=ec, ng=ng, ncut=ncut, truncated_dim=levels)
    ev = t.eigenvals(evals_count=levels)
    return [float(x - ev[0]) for x in ev]


def fluxonium_levels_scq(ej: float, ec: float, el: float, flux: float,
                         cutoff: int = 110, levels: int = 6) -> list[float]:
    """scqubits fluxonium spectrum [GHz] relative to ground — for benchmarking
    `physics.fluxonium_levels`."""
    import scqubits as scq
    fl = scq.Fluxonium(EJ=ej, EC=ec, EL=el, flux=flux, cutoff=cutoff, truncated_dim=levels)
    ev = fl.eigenvals(evals_count=levels)
    return [float(x - ev[0]) for x in ev]
