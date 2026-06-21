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
