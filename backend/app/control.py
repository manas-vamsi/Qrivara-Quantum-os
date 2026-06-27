"""QRIVARA control-electronics model — the room-temperature drive chain.

A single-qubit gate is only as good as the waveform that generates it. This module
models the AWG/DAC → IQ-mixer → low-pass-filter chain and quantifies the error each
stage adds to an ideal Gaussian (optionally DRAG-shaped) π/2 pulse:

  • DAC quantization + sample rate     → quantization SNR, samples-per-pulse adequacy
  • IQ amplitude/phase imbalance        → image-sideband leakage (image-rejection ratio)
  • finite anharmonicity + pulse speed  → leakage to |2> (DRAG suppresses it)
  • everything                           → an estimated coherent gate-error contribution

Sources: Motzoi 2009 (DRAG), Krantz 2019 §VI (control errors), standard IQ-imbalance
image-rejection. Pure NumPy.
"""
from __future__ import annotations

import math

import numpy as np


def _image_rejection_db(amp_imbalance: float, phase_deg: float) -> float:
    """Image-rejection ratio [dB] of an IQ mixer with fractional amplitude imbalance
    ε and phase error θ. IRR = |1 − g·e^{iθ}|² / |1 + g·e^{iθ}|², g = 1+ε. A perfectly
    balanced mixer (ε=0, θ=0) rejects the image infinitely; real mixers reach ~30–40 dB."""
    g = 1.0 + amp_imbalance
    th = math.radians(phase_deg)
    num = abs(1.0 - g * complex(math.cos(th), math.sin(th))) ** 2
    den = abs(1.0 + g * complex(math.cos(th), math.sin(th))) ** 2
    if num <= 0:
        return 120.0
    return min(120.0, -10.0 * math.log10(num / den))


def analyze_drive_chain(sample_rate_GSps: float = 2.4, dac_bits: int = 14,
                        sigma_ns: float = 10.0, anharmonicity_MHz: float = -310.0,
                        drag: bool = True, iq_amp_imbalance: float = 0.02,
                        iq_phase_deg: float = 1.0, filter_bw_MHz: float = 500.0) -> dict:
    """Model the control chain for a Gaussian (DRAG) single-qubit pulse and return the
    distortion/error budget plus a sampled I/Q waveform for plotting."""
    sigma = max(sigma_ns, 0.1)
    total_ns = 4.0 * sigma                                  # ±2σ Gaussian window
    fs = max(sample_rate_GSps, 0.05)                        # GSa/s = samples per ns
    n_samp = max(int(round(total_ns * fs)), 2)
    bits = int(max(2, min(dac_bits, 20)))

    # 1) DAC quantization SNR (ideal): SNR = 6.02 N + 1.76 dB
    quant_snr_db = 6.02 * bits + 1.76
    # samples per pulse — too few → the envelope is poorly reproduced
    samples_per_pulse = n_samp
    nyquist_ok = fs * 1e9 > 2.0 * (filter_bw_MHz * 1e6)

    # 2) IQ image rejection
    irr_db = _image_rejection_db(iq_amp_imbalance, iq_phase_deg)
    # leaked image power fraction → a coherent error
    image_frac = 10 ** (-irr_db / 10.0)

    # 3) DRAG leakage to |2>: a Gaussian pulse has spectral weight at the anharmonicity
    # Δ = |α|. Relative |2> drive ∝ Gaussian spectrum at Δ: exp(-(2π Δ σ)²/2). DRAG
    # cancels the leading term, leaving a strongly-suppressed residual (~×0.02 here).
    alpha_ghz = abs(anharmonicity_MHz) / 1000.0
    x = 2.0 * math.pi * alpha_ghz * sigma                   # dimensionless (GHz·ns)
    leak_nodrag = math.exp(-0.5 * x * x)
    leak = leak_nodrag * (0.02 if drag else 1.0)
    leak_frac = min(leak, 1.0)

    # 4) quantization-noise error contribution (fractional, per pulse)
    quant_frac = 10 ** (-quant_snr_db / 10.0)

    # combined coherent gate-error estimate (these add to leading order)
    gate_err = image_frac + leak_frac + quant_frac
    gate_err = min(gate_err, 1.0)

    # sampled waveform (Gaussian envelope + DRAG quadrature), normalized to 1
    t = np.linspace(0.0, total_ns, n_samp)
    t0 = total_ns / 2.0
    env = np.exp(-0.5 * ((t - t0) / sigma) ** 2)
    env = env - env.min()
    env = env / (env.max() or 1.0)
    # DRAG quadrature Q = -(1/α)·dI/dt (Motzoi 2009), scaled for display
    di = np.gradient(env, t)
    q = -(di / (2.0 * math.pi * alpha_ghz)) if (drag and alpha_ghz > 0) else np.zeros_like(env)
    qmax = np.max(np.abs(q)) or 1.0
    # quantize I to the DAC resolution to visualize the staircase
    levels = 2 ** bits
    i_quant = np.round(env * (levels - 1)) / (levels - 1)
    waveform = [
        {"t_ns": round(float(t[k]), 3), "I": round(float(i_quant[k]), 4),
         "Q": round(float(q[k] / qmax * 0.5), 4)}
        for k in range(n_samp)
    ]

    recs = []
    if samples_per_pulse < 8:
        recs.append(f"Only {samples_per_pulse} samples across the pulse — raise the AWG sample rate or widen the pulse so the envelope is well reproduced.")
    if irr_db < 30:
        recs.append(f"Image rejection is {irr_db:.0f} dB (<30 dB) — calibrate the IQ mixer (amplitude & phase) to suppress the image sideband.")
    if leak_frac > 1e-3 and not drag:
        recs.append("Leakage to |2> is significant — enable DRAG (derivative quadrature) or lengthen the pulse.")
    if not recs:
        recs.append("Control chain is healthy: well-sampled, good image rejection, leakage suppressed.")

    return {
        "sample_rate_GSps": round(fs, 3),
        "dac_bits": bits,
        "sigma_ns": round(sigma, 2),
        "pulse_length_ns": round(total_ns, 2),
        "drag": bool(drag),
        "quantization_snr_dB": round(quant_snr_db, 1),
        "samples_per_pulse": samples_per_pulse,
        "nyquist_ok": bool(nyquist_ok),
        "image_rejection_dB": round(irr_db, 1),
        "leakage_to_2_pct": round(leak_frac * 100.0, 4),
        "leakage_no_drag_pct": round(min(leak_nodrag, 1.0) * 100.0, 4),
        "error_image": image_frac,
        "error_leakage": leak_frac,
        "error_quantization": quant_frac,
        "gate_error_contribution": gate_err,
        "control_fidelity_pct": round(100.0 * (1.0 - gate_err), 4),
        "waveform": waveform,
        "recommendations": recs,
        "method": "AWG/DAC → IQ-mixer → filter control-chain model (Motzoi 2009 DRAG; Krantz 2019 §VI)",
    }
