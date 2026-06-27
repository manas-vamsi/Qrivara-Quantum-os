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


def dispersive_shift(g: float, fq: float, fr: float, anh: float, full: bool = False) -> float:
    """Dispersive (cross-Kerr) shift χ [MHz]. The canonical transmon result is the
    RWA value χ = g²·α/(Δ(Δ+α)) (Koch 2007 §IV-B; Krantz 2019 Eq. 50) — this is the
    default and what experiments report. Setting ``full=True`` adds an *optional*,
    leading-order counter-rotating (Bloch–Siegert-type) estimate ~g²·α/(Σ(Σ+α)),
    Σ = ωq+ωr; it is a small heuristic correction (~2–8% at typical detunings), not
    a rigorously derived term, so it is off by default.
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


def squid_ej(ej_sum: float, flux_ratio: float, asymmetry: float = 0.0) -> float:
    """Effective Josephson energy of an (a)symmetric SQUID at external flux
    Φ/Φ0 = flux_ratio (Koch 2007 eq.2.18 / Krantz 2019):

        EJ(Φ) = EJΣ·√(cos²(πΦ/Φ0) + d²·sin²(πΦ/Φ0)),

    with junction asymmetry d = (EJ2−EJ1)/(EJ1+EJ2) ∈ [0,1]. d=0 → symmetric
    SQUID (EJΣ·|cos|, tunes to zero at Φ=Φ0/2); d>0 lifts the lower sweet spot to
    EJΣ·d so the qubit stays operable. The √-form avoids the tan() singularity."""
    c = math.cos(math.pi * flux_ratio)
    s = math.sin(math.pi * flux_ratio)
    return ej_sum * math.sqrt(max(c * c + asymmetry * asymmetry * s * s, 0.0))


def transmon_freq_vs_flux(ej_sum: float, ec: float, flux_ratio: float,
                          asymmetry: float = 0.0) -> float:
    """f01 [GHz] of a SQUID transmon at external flux Φ/Φ0, from the exact
    charge-basis spectrum at the (a)symmetric-SQUID EJ(Φ) (see ``squid_ej``)."""
    ej_eff = squid_ej(ej_sum, flux_ratio, asymmetry)
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
    regime (Gambetta 2006 PRA 74 042318; Clerk RMP 2010; Krantz 2019 §III-B):
    Γφ = (κ/2)·Re[√((1+i·2χ/κ)² + 8iχ·n̄/κ) − 1]. With χ the per-state (half) shift
    this reduces to the canonical weak-drive rate Γφ → 4χ²·n̄(1+n̄)/κ (κ ≫ χ; ≈
    4χ²n̄/κ for small n̄). ``chi_mhz`` is the dispersive χ from ``dispersive_shift``;
    the resonator |0⟩/|1⟩ frequencies differ by 2χ. n̄ from the readout mode's
    thermal occupation if not given."""
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
    over both qubits, plus a coherent residual-ZZ error ½·θ² (small-error bound)
    from the phase θ = 2π·ζ·t_g the static ZZ rate ζ winds up over the gate
    (Krantz 2019 §VI). Returns the parts + fidelity."""
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


# ── TIME-DOMAIN TWO-QUBIT GATES ──────────────────────────────────────────────────
# Genuine Schrödinger-equation simulation of CZ / iSWAP / cross-resonance gates on
# two capacitively-coupled transmons, each kept as a 3-level (qutrit) Duffing
# oscillator so leakage out of the computational subspace is captured. The effective
# Hamiltonian is built in a common rotating frame at f_ref with the RWA exchange
# coupling g(a1†a2 + a1a2†); since it is Hermitian and time-independent, the exact
# propagator U(t) = W·diag(e^{−iλt})·W† follows from a single eigendecomposition.
# Sources: Strauch 2003 (CZ via |11⟩–|02⟩), DiCarlo 2009, Sheldon 2016 (CR),
# Krantz 2019 §VI, Pedersen 2007 (leakage-aware average gate fidelity).
_COMP_IDX = [0, 1, 3, 4]   # |00>,|01>,|10>,|11> in the 3⊗3 (q1 outer, q2 inner) basis


def _destroy(d: int) -> np.ndarray:
    """Bosonic annihilation operator truncated to d levels."""
    return np.diag(np.sqrt(np.arange(1, d, dtype=float)), 1).astype(complex)


def _two_transmon_h(f1: float, f2: float, anh1_mhz: float, anh2_mhz: float,
                    g_mhz: float, f_ref: float, levels: int = 3,
                    drive_mhz: float = 0.0) -> np.ndarray:
    """Effective two-transmon Hamiltonian [rad/ns] in the frame rotating at f_ref.
    Frequencies GHz, anharmonicities MHz, coupling/drive MHz. Each transmon is a
    Duffing oscillator H_i = Δ_i n_i + (α_i/2) n_i(n_i−1); coupling is the RWA
    exchange g(a1†a2 + a1a2†); an optional resonant drive on qubit 1 (cross-resonance)
    appears as the static term (Ω/2)(a1 + a1†) in this frame."""
    d = levels
    a = _destroy(d)
    ad = a.conj().T
    nop = ad @ a
    eye = np.eye(d, dtype=complex)
    a1, a1d, n1 = np.kron(a, eye), np.kron(ad, eye), np.kron(nop, eye)
    a2, a2d, n2 = np.kron(eye, a), np.kron(eye, ad), np.kron(eye, nop)
    big = np.eye(d * d, dtype=complex)
    tp = 2.0 * math.pi
    d1, d2 = tp * (f1 - f_ref), tp * (f2 - f_ref)
    al1, al2 = tp * anh1_mhz / 1000.0, tp * anh2_mhz / 1000.0
    g = tp * g_mhz / 1000.0
    ham = (d1 * n1 + d2 * n2
           + 0.5 * al1 * (n1 @ (n1 - big)) + 0.5 * al2 * (n2 @ (n2 - big))
           + g * (a1d @ a2 + a1 @ a2d))
    if drive_mhz:
        ham += 0.5 * tp * drive_mhz / 1000.0 * (a1 + a1d)
    return ham


def _avg_gate_fidelity(m4: np.ndarray, v4: np.ndarray, z_grid: int = 16) -> float:
    """Leakage-aware average gate fidelity of the 4×4 computational block m4 against
    the ideal 2-qubit unitary v4 (Pedersen 2007: F = (|Tr E|² + Tr E†E)/(d(d+1)),
    d=4, E = V†·M). Maximised over virtual single-qubit Z corrections (free frame
    updates), so only the genuine 2-qubit error is scored."""
    d = 4
    phis = np.linspace(0.0, 2.0 * math.pi, z_grid, endpoint=False)
    best = 0.0
    for p1 in phis:
        for p2 in phis:
            z = np.diag([1.0, np.exp(1j * p2), np.exp(1j * p1),
                         np.exp(1j * (p1 + p2))])
            e = v4.conj().T @ (z @ m4)
            tr = np.trace(e)
            f = (abs(tr) ** 2 + np.trace(e.conj().T @ e).real) / (d * (d + 1))
            if f > best:
                best = f
    return float(min(max(best, 0.0), 1.0))


def _zx_pi2() -> np.ndarray:
    """Target unitary for cross-resonance: ZX(π/2) = exp(−i(π/4) Z⊗X) — the native
    CR entangler, locally equivalent to CNOT. (Z⊗X)²=I ⇒ = (I − i Z⊗X)/√2."""
    zx = np.array([[0, 1, 0, 0], [1, 0, 0, 0],
                   [0, 0, 0, -1], [0, 0, -1, 0]], dtype=complex)
    return (np.eye(4, dtype=complex) - 1j * zx) / math.sqrt(2.0)


_GATE_TARGETS = {
    "iswap": np.array([[1, 0, 0, 0], [0, 0, 1j, 0],
                       [0, 1j, 0, 0], [0, 0, 0, 1]], dtype=complex),
    "cz": np.diag([1.0, 1.0, 1.0, -1.0]).astype(complex),
}


def simulate_two_qubit_gate(gate: str, f1_ghz: float, f2_ghz: float,
                            anh1_mhz: float = -310.0, anh2_mhz: float = -310.0,
                            g_mhz: float = 12.0, drive_mhz: float = 50.0,
                            t_max_ns: float | None = None, n_steps: int = 160) -> dict:
    """Time-domain simulation of a two-transmon entangling gate. Propagates the EXACT
    unitary U(t) (constant effective Hamiltonian in the RWA rotating frame → exact
    eigendecomposition propagator, not a numerical ODE step) over a window of gate
    durations, projects onto the 4-dim computational subspace, and reports the operating
    point (best gate time) by leakage-aware average gate fidelity. Returns the fidelity,
    leakage, conditional phase (CZ), the achieved 2-qubit unitary at the optimum, and
    population trajectories for the UI. Scope/idealizations (honest): RWA exchange
    coupling, square (unshaped) drive, and instantaneous ideal echo π-pulses — so CR is
    an un-calibrated estimate (DRAG / rotary echo lift it toward 99%); CZ and iSWAP are
    near-exact for the resonant/diabatic mechanisms modeled.

    Gate setup (all physically motivated):
      • iSWAP  — tunable qubits brought on-resonance (f→f̄); resonant exchange swaps
                 |01⟩↔|10⟩ in t≈1/(4g).
      • CZ     — qubit 1 flux-tuned to the |11⟩–|02⟩ resonance (f1=f2+α2); the avoided
                 crossing winds a conditional π phase (Strauch 2003).
      • CR     — fixed-frequency; qubit 1 driven at f2 (static in the f2 frame); the
                 g·Ω cross-resonance term builds ZX(θ) (Sheldon 2016)."""
    gate = (gate or "cz").lower().strip()
    if gate in ("cross_resonance", "cnot", "cx"):
        gate = "cr"
    g_ghz = max(g_mhz / 1000.0, 1e-6)

    # gate-specific frame, operating frequencies, target, default duration, init state.
    # `propagator(t)` returns the full 9×9 unitary at total gate time t [ns].
    if gate == "iswap":
        fbar = 0.5 * (f1_ghz + f2_ghz)
        f1o, f2o, fref = fbar, fbar, fbar
        target, drive = _GATE_TARGETS["iswap"], 0.0
        t_default, init = 1.0 / (4.0 * g_ghz), 1            # |01>
        ham = _two_transmon_h(f1o, f2o, anh1_mhz, anh2_mhz, g_mhz, fref)
        lam, w = np.linalg.eigh(ham)
        wh = w.conj().T
        def propagator(t):
            return (w * np.exp(-1j * lam * t)) @ wh
    elif gate == "cr":
        f1o, f2o, fref = f1_ghz, f2_ghz, f2_ghz
        target, drive = _zx_pi2(), drive_mhz
        # Echoed cross-resonance: CR(+Ω) τ → Xπ(ctrl) → CR(−Ω) τ → Xπ(ctrl), τ=t/2.
        # The echo cancels the IX/ZI/ZZ terms and leaves ZX(θ) (Sheldon 2016).
        hp = _two_transmon_h(f1o, f2o, anh1_mhz, anh2_mhz, g_mhz, fref, drive_mhz=drive)
        hm = _two_transmon_h(f1o, f2o, anh1_mhz, anh2_mhz, g_mhz, fref, drive_mhz=-drive)
        lp, wp = np.linalg.eigh(hp); wph = wp.conj().T
        lm, wm = np.linalg.eigh(hm); wmh = wm.conj().T
        rx = np.array([[0, -1j, 0], [-1j, 0, 0], [0, 0, 1]], dtype=complex)  # π on ctrl {0,1}
        xc = np.kron(rx, np.eye(3, dtype=complex))
        def propagator(t):
            tau = 0.5 * t
            up = (wp * np.exp(-1j * lp * tau)) @ wph
            um = (wm * np.exp(-1j * lm * tau)) @ wmh
            return xc @ um @ xc @ up
        # ZX rate (Magesan/Sheldon) → π/2 time; echo doubles it, so scan a wide window.
        delta = (f1_ghz - f2_ghz) or 1e-3
        alpha = anh1_mhz / 1000.0
        zx_ghz = abs(g_ghz * (drive / 1000.0) / delta
                     * (alpha / ((alpha + delta) or 1e-3)))
        # scan a few ZX periods so the π/2 operating point is inside the window
        t_default = 1.0 / zx_ghz if zx_ghz > 1e-6 else 300.0
        init = 3                                            # |10>
    else:  # cz (default)
        gate = "cz"
        f1o, f2o, fref = f2_ghz + anh2_mhz / 1000.0, f2_ghz, f2_ghz
        target, drive = _GATE_TARGETS["cz"], 0.0
        t_default, init = 1.0 / (math.sqrt(2.0) * g_ghz), 4  # |11>
        ham = _two_transmon_h(f1o, f2o, anh1_mhz, anh2_mhz, g_mhz, fref)
        lam, w = np.linalg.eigh(ham)
        wh = w.conj().T
        def propagator(t):
            return (w * np.exp(-1j * lam * t)) @ wh

    t_max = float(t_max_ns) if t_max_ns else max(min(t_default * 2.0, 2000.0), 2.0)
    n_steps = int(min(max(n_steps, 20), 400))

    best = {"fidelity": -1.0, "t_ns": 0.0, "leakage": 1.0, "phase_deg": 0.0, "m4": None}
    traj = []
    for s in range(n_steps + 1):
        t = t_max * s / n_steps
        u = propagator(t)                                   # full U(t)
        m4 = u[np.ix_(_COMP_IDX, _COMP_IDX)]                # computational block
        leak = 1.0 - float(np.trace(m4.conj().T @ m4).real) / 4.0
        if s > 0:                                           # skip trivial t=0
            fid = _avg_gate_fidelity(m4, target)
            if fid > best["fidelity"]:
                cond = float(np.angle(u[4, 4]) - np.angle(u[1, 1])
                             - np.angle(u[3, 3]) + np.angle(u[0, 0]))
                best.update(fidelity=fid, t_ns=t, leakage=max(leak, 0.0),
                            phase_deg=math.degrees(cond) % 360.0, m4=m4)
        col = np.abs(u[:, init]) ** 2                       # populations from init state
        traj.append({
            "t_ns": round(t, 3),
            "p00": round(float(col[0]), 4), "p01": round(float(col[1]), 4),
            "p10": round(float(col[3]), 4), "p11": round(float(col[4]), 4),
            "leak": round(float(1.0 - col[[0, 1, 3, 4]].sum()), 4),
        })

    m4 = best["m4"] if best["m4"] is not None else np.eye(4, dtype=complex)
    note = {
        "iswap": "Resonant exchange iSWAP; residual error from level shifts during the swap.",
        "cz": "Diabatic CZ at the |11>-|02> resonance (f1=f2+a2); residual from leakage into |02>.",
        "cr": "Un-calibrated echoed cross-resonance (RWA, square pulse, ideal echo). "
              "DRAG + rotary echo + amplitude calibration lift fidelity toward 99% (Sheldon 2016).",
    }[gate]
    return {
        "gate": gate.upper() if gate != "cr" else "Cross-Resonance (ZX90)",
        "note": note,
        "fidelity": round(best["fidelity"], 6),
        "fidelity_pct": round(100.0 * best["fidelity"], 4),
        "leakage": best["leakage"],
        "leakage_pct": round(100.0 * best["leakage"], 4),
        "t_gate_ns": round(best["t_ns"], 3),
        "conditional_phase_deg": round(best["phase_deg"], 2),
        "f1_op_GHz": round(f1o, 4), "f2_op_GHz": round(f2o, 4),
        "g_MHz": round(g_mhz, 3), "drive_MHz": round(drive, 3) if gate == "cr" else None,
        "U_abs": [[round(float(abs(m4[i, j])), 4) for j in range(4)] for i in range(4)],
        "trajectory": traj,
        "init_state": ["00", "01", "10", "11"][_COMP_IDX.index(init)],
    }


# ── FREQUENCY COLLISIONS — fixed-frequency CR lattices ───────────────────────────
# IBM heavy-hex / cross-resonance collision model (Hertzberg et al., npj QI 7, 129
# (2021), arXiv:2009.00781; tolerance bounds per IBM US Patent 12,039,402 Table 2).
# For fixed-frequency transmons each 0->1 frequency is set at fabrication, so certain
# frequency relationships between a CR control, its target, and spectators cause
# >~1% gate error. Junction-resistance spread scatters the frequencies, so the
# manufacturable YIELD = fraction of sampled chips with zero collisions. All
# frequencies/margins in MHz; anharmonicity δ is negative (|δ| ≈ 330 MHz).
# IBM-class tolerance bounds (Hertzberg 2021; US Patent 12,039,402 Table 2), order-of-MHz.
# Exact values drift a few MHz across IBM publications as calibration improved; tunable.
DEFAULT_COLLISION_MARGINS = {
    "m1": 17.0, "m2": 4.0, "m3": 30.0, "m4": 30.0,   # nearest-neighbour (control–target)
    "m5": 17.0, "m6": 25.0, "m7": 8.5,               # spectator (next-nearest-neighbour)
}

# Human-readable names for each collision type (for UI breakdowns).
COLLISION_TYPE_NAMES = {
    1: "Type 1 · 01–01 resonance",
    2: "Type 2 · 01–02/2 (two-photon)",
    3: "Type 3 · 01–12 (target hits control 1→2)",
    4: "Type 4 · slow gate (over-detuned)",
    5: "Type 5 · spectator 01–01",
    6: "Type 6 · spectator 01–12",
    7: "Type 7 · spectator 2-photon",
}


def pair_collision_types(f_i: float, f_j: float, alpha_mhz: float,
                         m: dict | None = None) -> set:
    """Nearest-neighbour (CR control–target) collision types for a connected pair.
    Frequencies in MHz; α<0. Returns the violated types ⊆ {1,2,3,4}."""
    m = m or DEFAULT_COLLISION_MARGINS
    d = abs(alpha_mhz)
    diff = abs(f_i - f_j)
    out = set()
    if diff <= m["m1"]:                       # 01–01 (near-degenerate)
        out.add(1)
    if abs(diff - d / 2.0) <= m["m2"]:        # 01–02/2 (two-photon)
        out.add(2)
    if abs(diff - d) <= m["m3"]:              # 01–12 (target ↔ control 1→2)
        out.add(3)
    if diff >= d + m["m4"]:                   # slow gate (detuning beyond α)
        out.add(4)
    return out


def spectator_collision_types(f_j: float, f_i: float, f_k: float, alpha_mhz: float,
                              m: dict | None = None) -> set:
    """Spectator (next-nearest-neighbour) collision types for a triplet where control
    j is connected to both i and k. Returns the violated types ⊆ {5,6,7}. The
    f_j≥f_i OR f_j≥f_k guard on types 5/7 follows the patent screen (Table 2): a
    collision exists if j can act as control for *either* bond — the conservative
    (yield-safe) reading. Type 6 is intentionally guard-free (depends only on the two
    spectators' relative frequency, not the control's position)."""
    m = m or DEFAULT_COLLISION_MARGINS
    d = abs(alpha_mhz)
    out = set()
    if (f_j >= f_i or f_j >= f_k) and abs(f_i - f_k) <= m["m5"]:                 # 5
        out.add(5)
    if abs(abs(f_i - f_k) - d) <= m["m6"]:                                       # 6
        out.add(6)
    if (f_j >= f_k or f_j >= f_i) and abs(f_j - (f_i + f_k) / 2.0 - d / 2.0) <= m["m7"]:  # 7
        out.add(7)
    return out


def lattice_collision_yield(targets_mhz, edges, triplets, alpha_mhz: float,
                            sigma_mhz: float, n_samples: int = 3000,
                            m: dict | None = None, seed: int = 20240617) -> dict:
    """Monte-Carlo fabrication yield of a fixed-frequency CR lattice. Each qubit's
    0→1 frequency is sampled ~ N(target, σ); a chip is a 'pass' only if NONE of the
    7 collision conditions fire on any edge or spectator triplet. Returns the yield
    %, per-collision-type incidence, and per-node / per-edge collision probability
    (for the heat-map). Vectorised over samples with NumPy."""
    m = m or DEFAULT_COLLISION_MARGINS
    n = len(targets_mhz)
    rng = np.random.default_rng(seed)
    samp = rng.normal(0.0, max(sigma_mhz, 0.0), (n_samples, n)) + np.asarray(targets_mhz, float)
    d = abs(alpha_mhz)
    bad = np.zeros(n_samples, dtype=bool)                 # chip has ≥1 collision
    node_bad = np.zeros((n_samples, n), dtype=bool)       # per-qubit involvement
    edge_prob = []
    type_counts = {t: 0 for t in range(1, 8)}

    for (a, b) in edges:
        diff = np.abs(samp[:, a] - samp[:, b])
        masks = {
            1: diff <= m["m1"],
            2: np.abs(diff - d / 2.0) <= m["m2"],
            3: np.abs(diff - d) <= m["m3"],
            4: diff >= d + m["m4"],
        }
        any_e = masks[1] | masks[2] | masks[3] | masks[4]
        for t, msk in masks.items():
            type_counts[t] += int(msk.sum())
        bad |= any_e
        node_bad[:, a] |= any_e
        node_bad[:, b] |= any_e
        edge_prob.append(float(any_e.mean()))

    for (j, i, k) in triplets:
        fj, fi, fk = samp[:, j], samp[:, i], samp[:, k]
        diff = np.abs(fi - fk)
        guard = (fj >= fi) | (fj >= fk)
        masks = {
            5: guard & (diff <= m["m5"]),
            6: np.abs(diff - d) <= m["m6"],
            7: guard & (np.abs(fj - (fi + fk) / 2.0 - d / 2.0) <= m["m7"]),
        }
        any_t = masks[5] | masks[6] | masks[7]
        for t, msk in masks.items():
            type_counts[t] += int(msk.sum())
        bad |= any_t
        for q in (j, i, k):
            node_bad[:, q] |= any_t

    passed = int((~bad).sum())
    # type_incidence = EXPECTED NUMBER of type-t collisions per chip (a type can fire on
    # several edges/triplets), so it may exceed 1 — it is not P(type). Whole-chip yield
    # ≈ (per-location pass)^(#locations) only under independence; the MC captures the
    # correlations (a qubit's frequency appears in many edges) exactly.
    return {
        "yield_pct": round(100.0 * passed / n_samples, 2),
        "n_samples": n_samples,
        "sigma_MHz": round(sigma_mhz, 2),
        "type_incidence": {t: round(type_counts[t] / n_samples, 4) for t in range(1, 8)},
        "node_collision_prob": [round(float(node_bad[:, q].mean()), 4) for q in range(n)],
        "edge_collision_prob": [round(p, 4) for p in edge_prob],
    }


# ── PACKAGING / BOX MODES (Pozar, Microwave Engineering §6.3; Wenner 2011) ──────
# A superconducting chip sits inside a metal sample holder / package, which is a
# 3-D rectangular cavity. Its electromagnetic eigenmodes (box / package modes) are
# parasitic resonances: when one falls near a qubit or readout frequency it opens a
# radiative loss channel (a Purcell-like T1 limit) and can hybridise with the chip
# modes ("chip-package collision"). The cavity resonance for a rectangular box of
# inner dimensions a×b×d filled with permittivity εr is (TE_mnl / TM_mnl share it):
#
#     f_mnl = (c / 2√εr) · √((m/a)² + (n/b)² + (l/d)²)
#
# Mode existence rules (Pozar Table 6.x): TM_mnl needs m≥1, n≥1, l≥0; TE_mnl needs
# l≥1 and at most one of m,n = 0. The dominant (lowest) mode depends on the box
# aspect ratio. All lengths in metres internally; the API takes mm. This is exact
# analytic physics for an empty rectangular cavity — the standard package screen.

def box_modes(a_mm: float, b_mm: float, d_mm: float, eps_r: float = 1.0,
              max_freq_ghz: float = 25.0, max_modes: int = 24) -> list[dict]:
    """Resonant box (package) modes of a rectangular metallic cavity a×b×d [mm],
    filled with permittivity ``eps_r`` (1.0 = vacuum/He package). Returns the lowest
    modes up to ``max_freq_ghz`` as ``[{mode, family, freq_GHz}]`` sorted by
    frequency. TE and TM that share a frequency are reported once as family 'TE/TM'."""
    a = max(a_mm, 1e-3) * 1e-3
    b = max(b_mm, 1e-3) * 1e-3
    d = max(d_mm, 1e-3) * 1e-3
    pref = C_LIGHT / (2.0 * math.sqrt(max(eps_r, 1e-6)))
    # bound the index search so it covers max_freq for typical mm boxes
    def imax(L):
        return max(1, int(math.ceil(2.0 * max_freq_ghz * 1e9 * L * math.sqrt(eps_r) / C_LIGHT)) + 1)
    mx, ny, lz = imax(a), imax(b), imax(d)
    seen: dict = {}
    for m in range(0, mx + 1):
        for n in range(0, ny + 1):
            for l in range(0, lz + 1):
                if m + n + l == 0:
                    continue
                # TM_mnl: m≥1, n≥1, l≥0 ; TE_mnl: l≥1, at most one of m,n is 0
                is_tm = m >= 1 and n >= 1
                is_te = l >= 1 and not (m == 0 and n == 0)
                if not (is_tm or is_te):
                    continue
                f = pref * math.sqrt((m / a) ** 2 + (n / b) ** 2 + (l / d) ** 2) / 1e9
                if f > max_freq_ghz:
                    continue
                family = "TE/TM" if (is_te and is_tm) else ("TM" if is_tm else "TE")
                key = round(f, 5)
                if key not in seen or len(seen[key]["fam"]) < len(family):
                    seen[key] = {"mode": f"{m}{n}{l}", "fam": family, "f": f}
    modes = sorted(seen.values(), key=lambda x: x["f"])[:max_modes]
    return [{"mode": x["mode"], "family": x["fam"], "freq_GHz": round(x["f"], 4)} for x in modes]


def package_collisions(modes: list[dict], device_freqs: list[dict],
                       margin_mhz: float = 200.0) -> list[dict]:
    """Flag package modes within ``margin_mhz`` of any device frequency (qubit f01 or
    readout resonator). ``device_freqs`` = ``[{label, freq_GHz, kind}]``. Returns one
    entry per (mode, device) clash with the detuning [MHz] — the chip↔package
    frequency collisions a packaging engineer must design away."""
    out = []
    for md in modes:
        for dev in device_freqs:
            det = abs(md["freq_GHz"] - float(dev["freq_GHz"])) * 1000.0
            if det <= margin_mhz:
                out.append({
                    "package_mode": md["mode"], "family": md["family"],
                    "mode_freq_GHz": md["freq_GHz"],
                    "device": dev.get("label", "?"), "device_kind": dev.get("kind", "qubit"),
                    "device_freq_GHz": round(float(dev["freq_GHz"]), 4),
                    "detuning_MHz": round(det, 1),
                })
    out.sort(key=lambda x: x["detuning_MHz"])
    return out


def package_purcell_t1(f_qubit_ghz: float, f_mode_ghz: float, q_package: float,
                       coupling_mhz: float = 50.0) -> float:
    """Order-of-magnitude radiative (Purcell) T1 limit [µs] from a qubit detuned by Δ
    from a lossy package mode of quality factor Q_package: Γ ≈ (g/Δ)²·κ_pkg, with
    κ_pkg = ω_mode/Q_package the mode linewidth and g the qubit↔mode coupling. The
    package analogue of the readout-resonator Purcell limit (Houck 2008) — a
    conservative screen for how close a box mode may sit before it kills T1."""
    if q_package <= 0:
        return math.inf                              # lossless mode → no radiative decay
    # On resonance the perturbative (g/Δ)² Purcell form diverges (T1→0), which is
    # unphysical — there the qubit and mode hybridise. Floor |Δ| at the coupling g
    # so a near-resonant collision reports the SHORT (worst-case) T1 rather than ∞:
    # a zero-detuning box mode is the most dangerous case, not the safest.
    delta_mhz = (f_qubit_ghz - f_mode_ghz) * 1000.0
    delta_mhz = math.copysign(max(abs(delta_mhz), max(coupling_mhz, 1e-6)), delta_mhz or 1.0)
    kappa = (f_mode_ghz * 1e9) / q_package           # mode linewidth [Hz]
    gamma = (coupling_mhz / delta_mhz) ** 2 * kappa  # [1/s]
    return (1.0 / gamma) * 1e6 if gamma > 0 else math.inf


def assign_lattice_frequencies(n: int, adjacency: dict, triplets, alpha_mhz: float,
                               palette_mhz, m: dict | None = None,
                               start: int | None = None) -> list:
    """Greedy collision-aware frequency allocation: visit qubits in BFS order and give
    each the palette frequency that creates the fewest NOMINAL collisions with its
    already-assigned neighbours (types 1–4) and spectators (types 5–7). This is the
    standard fixed-frequency design step (≥3 frequencies needed on heavy-hex). Greedy
    colouring can get stuck, so the caller restarts from several `start` nodes and
    keeps the best (see jobs._frequency_collisions)."""
    m = m or DEFAULT_COLLISION_MARGINS
    assigned: list = [None] * n
    # BFS order from `start` (default: the highest-degree node — constrained core first).
    if start is None:
        start = max(range(n), key=lambda q: len(adjacency.get(q, ()))) if n else 0
    order, seen, queue = [], {start}, [start]
    while queue:
        q = queue.pop(0)
        order.append(q)
        for nb in adjacency.get(q, ()):
            if nb not in seen:
                seen.add(nb); queue.append(nb)
    for q in range(n):                                    # include any disconnected nodes
        if q not in seen:
            order.append(q)
    # precompute which triplets touch each qubit (for spectator nominal scoring)
    trips_of = {q: [] for q in range(n)}
    for (jj, ii, kk) in triplets:
        for q in (jj, ii, kk):
            trips_of[q].append((jj, ii, kk))
    for q in order:
        scored = []
        for f in palette_mhz:
            cost = 0
            for nb in adjacency.get(q, ()):
                if assigned[nb] is not None:
                    cost += len(pair_collision_types(f, assigned[nb], alpha_mhz, m))
            for (jj, ii, kk) in trips_of[q]:
                vals = {jj: assigned[jj], ii: assigned[ii], kk: assigned[kk]}
                vals[q] = f
                if any(v is None for v in vals.values()):
                    continue
                cost += len(spectator_collision_types(vals[jj], vals[ii], vals[kk], alpha_mhz, m))
            scored.append((cost, f))
        best_cost = min(c for c, _ in scored)
        tied = [f for c, f in scored if c == best_cost]
        # tie-break: among equally-good frequencies, maximise the minimum detuning to
        # already-assigned neighbours so colours spread out (avoids clustering, which
        # is what made a naive "first match" allocation fail on heavy-hex).
        nbr_freqs = [assigned[nb] for nb in adjacency.get(q, ()) if assigned[nb] is not None]
        def spread(f):
            return min((abs(f - g) for g in nbr_freqs), default=1e9)
        assigned[q] = max(tied, key=spread)
    return assigned
