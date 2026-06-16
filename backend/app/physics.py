"""QRIVARA physics engine — NumPy port of the frontend `quantum.ts`.

Energies in GHz unless noted; couplings/shifts in MHz. Sources: Koch 2007,
Krantz 2019, IQM 2024. This is the authoritative server-side implementation;
the frontend keeps a JS copy for instant previews.
"""
from __future__ import annotations

import math

import numpy as np

H = 6.62607015e-34
HBAR = H / (2 * math.pi)
E = 1.602176634e-19
PHI0 = H / (2 * E)          # flux quantum h/2e
PHI0_RED = HBAR / (2 * E)   # reduced flux quantum ħ/2e
KB = 1.380649e-23
EPS0 = 8.8541878128e-12     # vacuum permittivity [F/m]
C_LIGHT = 299792458.0       # speed of light [m/s]


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


def dispersive_shift(g: float, fq: float, fr: float, anh: float, full: bool = True) -> float:
    """Dispersive (cross-Kerr) shift χ [MHz]. The RWA term is g²·α/(Δ(Δ+α)); with
    ``full`` we add the counter-rotating Σ term (paper eq.10) that the review warns
    not to drop — omitting it overestimates the Lamb shift by ~25% at 4/7 GHz.
    g, fq, fr in GHz/MHz-consistent units; anh in MHz."""
    delta = (fq - fr) * 1000
    if abs(delta) < 1e-6 or abs(delta + anh) < 1e-6:
        return 0.0
    chi = ((g * g) / delta) * (anh / (delta + anh))
    if full:
        sigma = (fq + fr) * 1000
        if abs(sigma) > 1e-6 and abs(sigma + anh) > 1e-6:
            chi += ((g * g) / sigma) * (anh / (sigma + anh))
    return chi


def purcell_t1(g: float, fq: float, fr: float, kappa: float) -> float:
    delta = (fq - fr) * 1000
    if abs(delta) < 1e-6 or kappa <= 0:
        return math.inf
    gamma = (g / delta) ** 2 * (kappa * 1e6)
    return (1 / gamma) * 1e6


def purcell_filter_t1(g: float, fq: float, fr: float, kappa_f: float, bw_f: float) -> float:
    """Purcell-limited T1 [µs] with a bandpass filter near the resonator (paper
    eq.15): Γ = (g/Δ)²·(ωQ/ωR)·(κF/2Δ)·κ. ``kappa_f`` is the resonator linewidth
    and ``bw_f`` the filter bandwidth (both MHz)."""
    delta = (fq - fr) * 1000
    if abs(delta) < 1e-6 or kappa_f <= 0 or bw_f <= 0:
        return math.inf
    gamma = (g / delta) ** 2 * (fq / fr) * (bw_f / (2 * abs(delta))) * (kappa_f * 1e6)
    return (1 / gamma) * 1e6 if gamma > 0 else math.inf


def kinetic_inductance(length_um: float, width_um: float, thickness_nm: float,
                       rho_n_uohm_cm: float, tc_k: float) -> dict:
    """Sheet + total kinetic inductance from Mattis–Bardeen (paper eq.17):
    Lk ≈ 0.18·l·ħ·ρn/(w·t·kB·Tc). ρn in µΩ·cm. Returns sheet [pH/□] and total [nH]
    (e.g. Nb ≈ 0.1 pH/□, TiN/NbN ≈ tens of pH/□)."""
    rho = max(rho_n_uohm_cm, 1e-9) * 1e-8         # µΩ·cm → Ω·m
    t = max(thickness_nm, 1e-3) * 1e-9
    tc = max(tc_k, 1e-3)
    lk_sheet = 0.18 * HBAR * rho / (t * KB * tc)   # H per square
    squares = max(length_um, 0.0) / max(width_um, 1e-6)
    return {
        "lk_sheet_pH": lk_sheet * 1e12,
        "lk_total_nH": lk_sheet * squares * 1e9,
        "squares": round(squares, 2),
    }


def zz_interaction(f1_ghz: float, f2_ghz: float, anh1_mhz: float, anh2_mhz: float, j_mhz: float) -> float:
    """Static ZZ rate [kHz] between two capacitively-coupled transmons via their
    higher levels (perturbation theory, paper §4.2). Δ = ω1−ω2, J the coupling;
    anharmonicities are negative."""
    delta = (f1_ghz - f2_ghz) * 1000
    a1, a2 = anh1_mhz, anh2_mhz
    if abs(delta - a2) < 1e-6 or abs(delta + a1) < 1e-6:
        return 0.0
    zeta = 2 * j_mhz * j_mhz * (1.0 / (delta - a2) - 1.0 / (delta + a1))
    return zeta * 1000  # MHz → kHz


def cpw_eps_eff(eps_sub: float) -> float:
    """Effective permittivity of a coplanar waveguide on a substrate: ≈(εr+1)/2
    (half the field is in vacuum)."""
    return (eps_sub + 1.0) / 2.0


def cpw_resonator_freq(length_um: float, eps_sub: float = 11.7, mode: str = "half") -> float:
    """Fundamental resonance [GHz] of a CPW resonator of physical length l:
    f = c / (m·l·√εeff), m=2 (half-wave) or 4 (quarter-wave). Paper §4.1."""
    l = max(length_um, 1.0) * 1e-6
    m = 2.0 if mode == "half" else 4.0
    f = C_LIGHT / (m * l * math.sqrt(cpw_eps_eff(eps_sub)))
    return f / 1e9


def coupling_capacitance(overlap_um2: float, gap_um: float, eps_eff: float = 6.35) -> float:
    """Geometry estimate of a coupling capacitance [fF] from overlap area and gap
    (paper §4.1: C scales with overlap area / separation). Parallel-plate with an
    effective permittivity averaging substrate and vacuum."""
    area = max(overlap_um2, 0.0) * 1e-12
    d = max(gap_um, 0.1) * 1e-6
    return EPS0 * eps_eff * area / d * 1e15


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
