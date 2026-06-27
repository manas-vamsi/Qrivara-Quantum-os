"""QRIVARA calibration / experiment emulator.

Emulates the standard single-qubit characterization experiments a lab runs to bring
up a device — qubit spectroscopy, Rabi, T1, Ramsey (T2*) and Hahn echo (T2E) — by
generating the curve you would *measure* for this design (true physics + realistic
shot noise) and then applying the textbook fit to recover the calibrated parameter.
It closes the design→measure→calibrate→digital-twin loop in software: you can see
the experiments and fits a chip would give before you ever cool it down.

Fits use scipy.optimize.curve_fit. Sources: Krantz 2019 §III (coherence experiments),
Ithier 2005 (Ramsey/echo). Reproducible (seeded noise).
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import curve_fit


def _downsample(x: np.ndarray, y: np.ndarray, n: int = 70) -> list[dict]:
    step = max(1, len(x) // n)
    return [{"x": round(float(x[i]), 5), "y": round(float(y[i]), 5)} for i in range(0, len(x), step)]


def spectroscopy(f01_ghz: float, linewidth_mhz: float, rng) -> dict:
    """Two-tone qubit spectroscopy: a Lorentzian dip/peak at f01. Fit → f01."""
    span = max(linewidth_mhz * 8.0, 20.0) / 1000.0
    f = np.linspace(f01_ghz - span, f01_ghz + span, 201)
    hwhm = max(linewidth_mhz, 0.5) / 1000.0
    y = 1.0 / (1.0 + ((f - f01_ghz) / hwhm) ** 2)
    y = y + rng.normal(0, 0.03, f.shape)

    def lor(x, f0, w, a, c):
        return a / (1.0 + ((x - f0) / w) ** 2) + c
    try:
        popt, _ = curve_fit(lor, f, y, p0=[f01_ghz, hwhm, 1.0, 0.0], maxfev=8000)
        f_fit, w_fit = float(popt[0]), abs(float(popt[1]))
    except Exception:  # noqa: BLE001
        f_fit, w_fit = float(f[np.argmax(y)]), hwhm
    return {"experiment": "Spectroscopy", "curve": _downsample(f, y),
            "x_label": "drive freq (GHz)", "y_label": "response",
            "fit": {"f01_GHz": round(f_fit, 5), "linewidth_MHz": round(w_fit * 1000, 2)},
            "calibrated": {"param": "f01_GHz", "value": round(f_fit, 5)}}


def rabi(amp_pi: float, decay: float, rng) -> dict:
    """Power-Rabi: population vs drive amplitude. Fit → π-pulse amplitude."""
    amp = np.linspace(0, 2.2 * amp_pi, 161)
    y = 0.5 * (1.0 - np.cos(np.pi * amp / amp_pi)) * np.exp(-amp * decay)
    y = y + rng.normal(0, 0.02, amp.shape)

    def model(x, ap, d):
        return 0.5 * (1.0 - np.cos(np.pi * x / ap)) * np.exp(-x * d)
    try:
        popt, _ = curve_fit(model, amp, y, p0=[amp_pi, decay], maxfev=8000)
        ap_fit = abs(float(popt[0]))
    except Exception:  # noqa: BLE001
        ap_fit = amp_pi
    return {"experiment": "Rabi", "curve": _downsample(amp, y),
            "x_label": "drive amplitude (a.u.)", "y_label": "P(|1⟩)",
            "fit": {"amp_pi": round(ap_fit, 4)},
            "calibrated": {"param": "pi_pulse_amplitude", "value": round(ap_fit, 4)}}


def t1_decay(t1_us: float, rng) -> dict:
    """Inversion-recovery T1: exponential decay. Fit → T1."""
    t = np.linspace(0, 3.5 * t1_us, 161)
    y = np.exp(-t / t1_us) + rng.normal(0, 0.02, t.shape)

    def model(x, t1, a, c):
        return a * np.exp(-x / t1) + c
    try:
        popt, _ = curve_fit(model, t, y, p0=[t1_us, 1.0, 0.0], maxfev=8000)
        t1_fit = abs(float(popt[0]))
    except Exception:  # noqa: BLE001
        t1_fit = t1_us
    return {"experiment": "T1", "curve": _downsample(t, y),
            "x_label": "delay (µs)", "y_label": "P(|1⟩)",
            "fit": {"T1_us": round(t1_fit, 2)},
            "calibrated": {"param": "T1_us", "value": round(t1_fit, 2)}}


def ramsey(detuning_mhz: float, t2star_us: float, rng) -> dict:
    """Ramsey fringes: detuning oscillation under a decaying envelope. Fit → detuning, T2*."""
    t = np.linspace(0, 3.0 * t2star_us, 241)
    w = 2 * math.pi * detuning_mhz                       # rad/µs (MHz·µs = rad·... → 2π·MHz·µs)
    y = 0.5 + 0.5 * np.cos(w * t) * np.exp(-t / t2star_us) + rng.normal(0, 0.02, t.shape)

    def model(x, det, t2, ph):
        return 0.5 + 0.5 * np.cos(2 * math.pi * det * x + ph) * np.exp(-x / t2)
    try:
        popt, _ = curve_fit(model, t, y, p0=[detuning_mhz, t2star_us, 0.0], maxfev=12000)
        det_fit, t2_fit = abs(float(popt[0])), abs(float(popt[1]))
    except Exception:  # noqa: BLE001
        det_fit, t2_fit = detuning_mhz, t2star_us
    return {"experiment": "Ramsey", "curve": _downsample(t, y),
            "x_label": "delay (µs)", "y_label": "P(|1⟩)",
            "fit": {"detuning_MHz": round(det_fit, 4), "T2_star_us": round(t2_fit, 2)},
            "calibrated": {"param": "T2_star_us", "value": round(t2_fit, 2)}}


def echo(t2e_us: float, rng) -> dict:
    """Hahn echo: refocuses low-frequency noise → pure decay. Fit → T2E."""
    t = np.linspace(0, 3.0 * t2e_us, 161)
    y = 0.5 + 0.5 * np.exp(-t / t2e_us) + rng.normal(0, 0.02, t.shape)

    def model(x, t2, a, c):
        return c + a * np.exp(-x / t2)
    try:
        popt, _ = curve_fit(model, t, y, p0=[t2e_us, 0.5, 0.5], maxfev=8000)
        t2_fit = abs(float(popt[0]))
    except Exception:  # noqa: BLE001
        t2_fit = t2e_us
    return {"experiment": "Echo", "curve": _downsample(t, y),
            "x_label": "total delay (µs)", "y_label": "P(|1⟩)",
            "fit": {"T2_echo_us": round(t2_fit, 2)},
            "calibrated": {"param": "T2_echo_us", "value": round(t2_fit, 2)}}


def run_calibration(f01_ghz: float = 5.0, t1_us: float = 80.0, t2_us: float = 90.0,
                    anharmonicity_mhz: float = -310.0, detuning_mhz: float = 0.5,
                    seed: int = 20240617) -> dict:
    """Run the full single-qubit calibration sequence for a device and return each
    experiment's curve + fit, plus a calibration table (target vs measured) — the
    'digital-twin update' a real bring-up would produce."""
    rng = np.random.default_rng(seed)
    t2star = min(t2_us, 2.0 * t1_us)                      # T2* ≤ 2 T1 bound
    amp_pi_true = 0.5                                     # arbitrary AWG units
    exps = [
        spectroscopy(f01_ghz, abs(anharmonicity_mhz) * 0.01 + 0.5, rng),
        rabi(amp_pi_true, 0.05, rng),
        t1_decay(t1_us, rng),
        ramsey(detuning_mhz, t2star, rng),
        echo(t2_us, rng),
    ]
    # calibration table: target (design) vs measured (fit)
    targets = {"f01_GHz": f01_ghz, "pi_pulse_amplitude": amp_pi_true,
               "T1_us": t1_us, "T2_star_us": t2star, "T2_echo_us": t2_us}
    table = []
    for e in exps:
        c = e["calibrated"]
        tgt = targets.get(c["param"])
        err_pct = round(abs(c["value"] - tgt) / tgt * 100, 2) if tgt else None
        table.append({"experiment": e["experiment"], "param": c["param"],
                      "target": round(tgt, 4) if tgt is not None else None,
                      "measured": c["value"], "error_pct": err_pct})
    return {
        "experiments": exps,
        "calibration_table": table,
        "digital_twin": {row["param"]: row["measured"] for row in table},
        "seed": seed,
        "method": "calibration experiment emulator (Rabi/Ramsey/T1/echo/spectroscopy) with curve_fit recovery",
    }
