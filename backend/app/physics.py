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


def transmon_levels(ej: float, ec: float, ng: float = 0.0, ncut: int = 31,
                    levels: int = 6) -> list[float]:
    """Exact transmon spectrum by charge-basis diagonalization (scqubits-style):
    H = 4·EC·(n − ng)² − EJ·cos φ, where cos φ couples adjacent charge states |n⟩,
    |n±1⟩ by −EJ/2. Returns the lowest `levels` eigenenergies [GHz] relative to the
    ground state. Exact replacement for the asymptotic f01 = √(8EJEC) − EC."""
    n = np.arange(-ncut, ncut + 1)
    ham = np.diag(4.0 * ec * (n - ng) ** 2)
    off = -0.5 * ej * np.ones(len(n) - 1)
    ham += np.diag(off, 1) + np.diag(off, -1)
    evals = np.sort(np.linalg.eigvalsh(ham))
    return (evals[:levels] - evals[0]).tolist()


def transmon_f01_anharm(ej: float, ec: float, ng: float = 0.0, ncut: int = 31) -> tuple[float, float]:
    """Exact transmon (f01 [GHz], anharmonicity [MHz]) from charge-basis
    diagonalization — captures the corrections the asymptotic formulas miss."""
    lv = transmon_levels(ej, ec, ng=ng, ncut=ncut, levels=3)
    f01 = lv[1] - lv[0]
    anh = ((lv[2] - lv[1]) - f01) * 1000.0
    return f01, anh


def coupling_g(cg: float, cq: float, cr: float, fq: float, fr: float) -> float:
    beta = cg / math.sqrt(max(cq * cr, 1e-6))
    return 0.5 * beta * math.sqrt(max(fq * fr, 0.0)) * 1000


def dispersive_shift(g: float, fq: float, fr: float, anh: float, full: bool = True) -> float:
    """Dispersive (cross-Kerr) shift χ [MHz]. The RWA term is g²·α/(Δ(Δ+α)); with
    ``full`` we add the counter-rotating Σ term (Koch 2007 eq.3.8 / Krantz 2019
    §IV). The counter-rotating correction is modest at typical detunings
    (~3–8% at 5/7 and 4/7 GHz) but grows as Σ shrinks; keep it for fidelity.
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
    if f01_ghz <= 0:
        return math.inf
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


# ── DECOHERENCE CHANNELS (Krantz 2019 §III/§V; Catelani 2011; Material Matters) ──
def quasiparticle_t1(f01_ghz: float, x_qp: float = 1e-6, tc_k: float = 1.2) -> float:
    """Quasiparticle-limited T1 [µs] (Catelani 2011 PRL 106 077002):
    Γqp = (ω01/π)·√(2Δ/ħω01)·x_qp, with the BCS gap Δ = 1.764·kB·Tc and
    x_qp = n_qp/n_cp the normalized QP density (typ. 1e-6–1e-8). Tc from the film
    material (Al≈1.2 K, Nb≈9.3 K). Returns ∞ for x_qp→0."""
    w = 2 * math.pi * max(f01_ghz, 1e-6) * 1e9
    delta = 1.764 * KB * max(tc_k, 1e-3)
    gamma = (w / math.pi) * math.sqrt(2 * delta / (HBAR * w)) * max(x_qp, 0.0)
    return (1.0 / gamma) * 1e6 if gamma > 0 else math.inf


def transmon_freq_vs_flux(ej_sum: float, ec: float, flux_ratio: float) -> float:
    """f01 [GHz] of a symmetric SQUID transmon at external flux Φ/Φ0 = flux_ratio:
    EJ(Φ) = EJΣ·|cos(πΦ/Φ0)|, then the exact transmon f01."""
    ej_eff = ej_sum * abs(math.cos(math.pi * flux_ratio))
    f, _ = transmon_f01_anharm(max(ej_eff, 1e-6), ec)
    return f


def flux_noise_dephasing(ej_sum: float, ec: float, flux_ratio: float,
                         a_phi_uphi0: float = 1.0, t_us: float = 10.0,
                         echo: bool = False, f_ir_hz: float = 1.0) -> dict:
    """1/f flux-noise pure-dephasing Tφ [µs] for a tunable transmon (Ithier 2005;
    Krantz 2019 §III-B). First order: Γφ = D_Φ·A_Φ·√(2|ln(ω_ir·t)|), echo replaces
    the log by ln2. At a flux sweet spot D_Φ→0 and the 2nd-order term
    Γφ⁽²⁾ ≈ D²_Φ·A²_Φ takes over. D_Φ = ∂ω01/∂Φ from finite differences on
    `transmon_freq_vs_flux`. A_Φ in µΦ0 (typ. 1–10)."""
    h = 1e-4
    fp = transmon_freq_vs_flux(ej_sum, ec, flux_ratio + h)
    fm = transmon_freq_vs_flux(ej_sum, ec, flux_ratio - h)
    f0 = transmon_freq_vs_flux(ej_sum, ec, flux_ratio)
    d1_hz = (fp - fm) / (2 * h) * 1e9                      # ∂f/∂Φ  [Hz/Φ0]
    d2_hz = (fp - 2 * f0 + fm) / (h * h) * 1e9             # ∂²f/∂Φ² [Hz/Φ0²]
    a = max(a_phi_uphi0, 0.0) * 1e-6                       # Φ0
    t = max(t_us, 1e-6) * 1e-6
    d_omega1 = 2 * math.pi * abs(d1_hz)                    # rad/s per Φ0
    d_omega2 = 2 * math.pi * abs(d2_hz)
    log_arg = 2 * math.pi * max(f_ir_hz, 1e-9) * t
    log_factor = math.log(2.0) if echo else max(abs(math.log(log_arg)) if log_arg > 0 else 1.0, 1e-6)
    g1 = d_omega1 * a * math.sqrt(2 * log_factor)          # 1st-order rate [1/s]
    g2 = d_omega2 * a * a                                  # 2nd-order rate [1/s]
    gamma = g1 + g2
    return {
        "t_phi_us": (1.0 / gamma) * 1e6 if gamma > 0 else math.inf,
        "d_omega_dphi_GHz_per_phi0": round(d1_hz / 1e9, 4),
        # near a flux sweet spot the 1st-order slope ≈ 0 and the 2nd-order term dominates
        "sweet_spot": bool(g1 < g2),
    }


def photon_shot_noise_dephasing(chi_mhz: float, kappa_mhz: float, n_bar: float | None = None,
                                fr_ghz: float = 7.1, temp_k: float = 0.05) -> float:
    """Measurement-induced (residual-photon) dephasing Tφ [µs] in the dispersive
    regime (Clerk & Utami 2007; Krantz 2019 §III-B):
    Γφ = (κ/2)·Re[√((1+i·2χ/κ)² + 8iχ·n̄/κ) − 1], which reduces to the canonical
    weak-drive rate 8χ²n̄/κ. ``chi_mhz`` is the cross-Kerr χ (as returned by
    ``dispersive_shift``); the formula uses the full state-dependent resonator
    splitting 2χ. n̄ from the readout mode's thermal occupation if not given."""
    two_chi = 2 * 2 * math.pi * chi_mhz * 1e6          # full splitting 2χ [rad/s]
    kappa = 2 * math.pi * max(kappa_mhz, 1e-9) * 1e6
    if n_bar is None:
        x = H * fr_ghz * 1e9 / (KB * max(temp_k, 1e-3))
        n_bar = 1.0 / (math.exp(x) - 1.0) if x < 700 else 0.0
    if kappa <= 0 or two_chi == 0:
        return math.inf
    z = (1 + 1j * two_chi / kappa) ** 2 + 4j * two_chi * n_bar / kappa
    gamma = abs((kappa / 2) * ((z ** 0.5).real - 1))
    return (1.0 / gamma) * 1e6 if gamma > 0 else math.inf


# ── GATE FIDELITY (Abad 2022 npj QI; Krantz 2019 §VI) ───────────────────────────
def gate_error_1q(t1_us: float, t2_us: float, t_gate_ns: float = 20.0) -> float:
    """Coherence-limited average 1-qubit gate error ε ≈ (t_gate/3)·(1/T1 + 1/T2)
    (Abad 2022 universal bound). Returns the infidelity (0..1)."""
    tg = max(t_gate_ns, 0.0) * 1e-3
    r = (1.0 / t1_us if t1_us > 0 else 0.0) + (1.0 / t2_us if t2_us > 0 else 0.0)
    return min(max((tg / 3.0) * r, 0.0), 1.0)


def gate_error_2q(t1a_us: float, t2a_us: float, t1b_us: float, t2b_us: float,
                  t_gate_ns: float = 200.0, zz_khz: float = 0.0) -> dict:
    """Coherence-limited 2-qubit gate error: incoherent part (t_g/3)·Σ(1/T1+1/T2)
    over both qubits, plus a coherent residual-ZZ phase error (π·ζ·t_g)²/2 from the
    static ZZ rate ζ (Krantz 2019 §VI). Returns the parts + fidelity."""
    tg = max(t_gate_ns, 0.0) * 1e-3
    rates = sum(1.0 / t for t in (t1a_us, t2a_us, t1b_us, t2b_us) if t and t > 0)
    coherence = (tg / 3.0) * rates
    zz_rad = 2 * math.pi * abs(zz_khz) * 1e3                # rad/s
    zz_err = 0.5 * (zz_rad * (tg * 1e-6)) ** 2
    total = min(coherence + zz_err, 1.0)
    return {
        "coherence_error": coherence,
        "zz_error": zz_err,
        "total_error": total,
        "fidelity_pct": round(100 * (1 - total), 4),
    }


# ── DISPERSIVE READOUT (Gambetta 2007; Krantz 2019 §V-C) ────────────────────────
def readout_snr(chi_mhz: float, kappa_mhz: float, n_bar: float, t_int_ns: float,
                eta: float = 0.5) -> float:
    """Heterodyne dispersive-readout SNR: SNR² = 2η·κ·t·n̄·r²/(1+r²), r = 2χ/κ.
    χ, κ in MHz; n̄ steady-state photons; t_int integration time; η efficiency."""
    chi = 2 * math.pi * chi_mhz * 1e6
    kappa = 2 * math.pi * max(kappa_mhz, 1e-9) * 1e6
    t = max(t_int_ns, 0.0) * 1e-9
    if kappa <= 0:
        return 0.0
    r = 2 * chi / kappa
    snr2 = 2 * eta * kappa * t * max(n_bar, 0.0) * (r * r / (1 + r * r))
    return math.sqrt(max(snr2, 0.0))


def readout_fidelity(snr: float, t1_us: float | None = None, t_int_ns: float | None = None) -> dict:
    """Single-shot assignment fidelity from SNR. Separation error ½·erfc(SNR/2)
    plus T1 decay during integration (Gambetta 2007; Krantz 2019 §V-C)."""
    sep = 0.5 * math.erfc(snr / 2.0) if snr > 0 else 0.5
    decay = (t_int_ns * 1e-3 / (2 * t1_us)) if (t1_us and t_int_ns and t1_us > 0) else 0.0
    decay = min(decay, 0.5)
    return {
        "snr": round(snr, 3),
        "separation_error": sep,
        "t1_decay_error": decay,
        "assignment_fidelity_pct": round(100 * max(1 - sep - decay, 0.0), 4),
    }


# ── QUANTUM ERROR CORRECTION — surface code (Fowler 2012; Google 2023/2024) ──────
def surface_code_logical_error(p_phys: float, distance: int, p_th: float = 0.01,
                               a_prefactor: float = 0.03) -> float:
    """Per-cycle logical error of a distance-d surface code:
    p_L ≈ A·(p/p_th)^⌊(d+1)/2⌋ below threshold (Fowler 2012, 0905.0531). Above
    threshold (p ≥ p_th) error correction does not help, so p_L saturates to A."""
    if p_phys <= 0:
        return 0.0
    if p_phys >= p_th:
        return min(a_prefactor, 1.0)
    exponent = (distance + 1) // 2
    return min(a_prefactor * (p_phys / p_th) ** exponent, 1.0)


def lambda_factor(p_phys: float, p_th: float = 0.01) -> float:
    """Λ error-suppression factor: logical error drops by Λ each time the code
    distance increases by 2 (Google 2023, 2211.09138). Λ = p_th/p."""
    return (p_th / p_phys) if p_phys > 0 else math.inf


def distance_for_target(p_phys: float, target_pL: float, p_th: float = 0.01,
                        a_prefactor: float = 0.03, max_d: int = 101) -> int | None:
    """Smallest odd code distance reaching a target logical error, or None if the
    physical error is at/above threshold (no distance helps)."""
    if p_phys >= p_th:
        return None
    d = 3
    while d <= max_d:
        if surface_code_logical_error(p_phys, d, p_th, a_prefactor) <= target_pL:
            return d
        d += 2
    return max_d


def physical_to_logical(p_phys: float, distance: int | None = None, target_pL: float = 1e-6,
                        p_th: float = 0.01, a_prefactor: float = 0.03) -> dict:
    """Map a physical per-cycle error rate to a logical qubit: pick (or use) a code
    distance, report p_L, Λ, and the physical-qubit cost (rotated surface code:
    2d²−1 data+measure qubits per logical)."""
    chosen = distance if distance else distance_for_target(p_phys, target_pL, p_th, a_prefactor)
    pl = surface_code_logical_error(p_phys, chosen, p_th, a_prefactor) if chosen else None
    return {
        "p_phys": p_phys,
        "threshold": p_th,
        "lambda": lambda_factor(p_phys, p_th),
        "distance": chosen,
        "p_logical": pl,
        "physical_qubits_per_logical": (2 * chosen * chosen - 1) if chosen else None,
        "below_threshold": p_phys < p_th,
    }


# ── TLS SATURATION (Material Matters 2106.05919; Müller 2019) ────────────────────
def tls_tan_delta(tan_d0: float, f_ghz: float, temp_k: float, n_photons: float = 1.0,
                  n_c: float = 1e4, beta: float = 0.4) -> float:
    """Power- and temperature-dependent dielectric loss from two-level systems:
    tanδ(T,⟨n⟩) = tanδ₀·tanh(ħω/2kBT)/(1+⟨n⟩/n_c)^β. Captures the single-photon vs
    high-power Q gap (n_c the TLS critical photon number)."""
    th = math.tanh(H * max(f_ghz, 0.0) * 1e9 / (2 * KB * max(temp_k, 1e-3)))
    sat = (1.0 + max(n_photons, 0.0) / max(n_c, 1e-9)) ** beta
    return tan_d0 * th / sat
