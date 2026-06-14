"""QRIVARA physics engine — NumPy port of the frontend `quantum.ts`.

Energies in GHz unless noted; couplings/shifts in MHz. Sources: Koch 2007,
Krantz 2019, IQM 2024. This is the authoritative server-side implementation;
the frontend keeps a JS copy for instant previews.
"""
from __future__ import annotations

import math

import numpy as np

H = 6.62607015e-34
E = 1.602176634e-19
PHI0 = H / (2 * E)
KB = 1.380649e-23


def ec_from_capacitance(c_ff: float) -> float:
    c = max(c_ff, 1e-6) * 1e-15
    return (E * E) / (2 * c * H) / 1e9


def ej_from_ic(ic_na: float) -> float:
    ic = ic_na * 1e-9
    return (ic * PHI0) / (2 * math.pi) / H / 1e9


def ej_from_lj(lj_nh: float) -> float:
    lj = max(lj_nh, 1e-6) * 1e-9
    phi = PHI0 / (2 * math.pi)
    return (phi * phi) / lj / H / 1e9


def f01(ej: float, ec: float) -> float:
    return math.sqrt(max(0.0, 8 * ej * ec)) - ec


def anharmonicity(ec: float) -> float:
    return -ec * 1000


def coupling_g(cg: float, cq: float, cr: float, fq: float, fr: float) -> float:
    beta = cg / math.sqrt(max(cq * cr, 1e-6))
    return 0.5 * beta * math.sqrt(max(fq * fr, 0.0)) * 1000


def dispersive_shift(g: float, fq: float, fr: float, anh: float) -> float:
    delta = (fq - fr) * 1000
    if abs(delta) < 1e-6 or abs(delta + anh) < 1e-6:
        return 0.0
    return ((g * g) / delta) * (anh / (delta + anh))


def purcell_t1(g: float, fq: float, fr: float, kappa: float) -> float:
    delta = (fq - fr) * 1000
    if abs(delta) < 1e-6 or kappa <= 0:
        return math.inf
    gamma = (g / delta) ** 2 * (kappa * 1e6)
    return (1 / gamma) * 1e6


def t1_from_q(q: float, f01_ghz: float) -> float:
    return q / (2 * math.pi * f01_ghz * 1e9) * 1e6


def combine_t1(*t1s_us: float) -> float:
    rate = sum(1 / t for t in t1s_us if t and math.isfinite(t) and t > 0)
    return 1 / rate if rate > 0 else math.inf


def t2(t1_us: float, tphi_us: float) -> float:
    r = 1 / (2 * t1_us) + (1 / tphi_us if tphi_us > 0 else 0)
    return 1 / r


def charge_dispersion(m: int, ej: float, ec: float) -> float:
    ratio = ej / ec
    pref = ec * (2 ** (4 * m + 5) / math.factorial(m)) * math.sqrt(2 / math.pi)
    val = pref * (ej / (2 * ec)) ** (m / 2 + 3 / 4) * math.exp(-math.sqrt(8 * ratio))
    return abs(val) * 1000


def thermal_population(f01_ghz: float, temp_k: float = 0.02) -> float:
    return math.exp(-(H * f01_ghz * 1e9) / (KB * temp_k))


def design_for_target(f01_ghz: float, anharm_mhz: float) -> dict:
    ec = max(abs(anharm_mhz) / 1000, 1e-3)
    f = max(f01_ghz, 0.01)
    ej = (f + ec) ** 2 / (8 * ec)
    return {
        "ec": ec,
        "ej": ej,
        "ratio": ej / ec,
        "cSigma": _EC_AT_1FF / ec,
        "ic": ej / _EJ_PER_NA,
    }


_EC_AT_1FF = ec_from_capacitance(1)
_EJ_PER_NA = ej_from_ic(1)


def loss_budget(interfaces: list[dict], f01_ghz: float) -> dict:
    contributions = [x["p"] * x["tanD"] for x in interfaces]
    inv_q = sum(contributions)
    q = 1 / inv_q if inv_q > 0 else math.inf
    return {"invQ": inv_q, "Q": q, "t1Us": t1_from_q(q, f01_ghz), "contributions": contributions}


def fluxonium_levels(ej: float, ec: float, el: float, flux_ratio: float, dim: int = 40) -> list[float]:
    """H = 4 EC n^2 + 1/2 EL phi^2 - EJ cos(phi - 2*pi*flux), diagonalized in the
    harmonic (LC) basis via numpy.linalg.eigh. Returns the lowest 6 levels [GHz]."""
    n = dim
    phi_zpf = (8 * ec / el) ** 0.25
    n_zpf = 0.5 * (el / (8 * ec)) ** 0.25

    a = np.diag(np.sqrt(np.arange(1, n)), 1)  # lowering operator
    phi = phi_zpf * (a + a.T)
    m = a.T - a
    n2 = -(n_zpf**2) * (m @ m)
    phi2 = phi @ phi

    w, v = np.linalg.eigh(phi)
    cos_phi = (v * np.cos(w - 2 * math.pi * flux_ratio)) @ v.T

    ham = 4 * ec * n2 + 0.5 * el * phi2 - ej * cos_phi
    evals = np.linalg.eigvalsh(ham)
    evals = np.sort(evals)
    return (evals[:6] - evals[0]).tolist()


def design_errors(ej: float, ec: float, temp_k: float = 0.02, tunable: bool = False) -> dict:
    f = f01(ej, ec)
    anh_mhz = ec * 1000
    leakage = 6e3 / (anh_mhz * anh_mhz)
    parity = min(1.0, charge_dispersion(2, ej, ec) / 0.05)
    prep = thermal_population(f, temp_k) * 20
    tls = 0.004 * f
    flux = 0.012 if tunable else 0.003
    total = tls + flux + leakage + prep + parity
    return {"tls": tls, "flux": flux, "leakage": leakage, "prep": prep, "parity": parity, "total": total}


def sweep_ej_ec(tunable: bool = False) -> list[dict]:
    pts = []
    for ratio in range(30, 121, 4):
        for ec_mhz in range(150, 401, 12):
            ec = ec_mhz / 1000
            ej = ratio * ec
            total = design_errors(ej, ec, tunable=tunable)["total"]
            pts.append({"ec": ec, "ratio": ratio, "total": total})
    totals = [p["total"] for p in pts]
    lo, hi = min(totals), max(totals)
    span = (hi - lo) or 1
    for p in pts:
        p["score"] = round(100 * (1 - (p["total"] - lo) / span))
    return pts
