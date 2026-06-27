"""QRIVARA cryogenic signal-chain model — dilution-refrigerator drive lines.

A superconducting qubit is driven through a chain of attenuators distributed across
the fridge's temperature stages (50 K → 4 K → still → cold plate → mixing chamber).
Those attenuators do two jobs: they set the signal level at the device, and — because
each attenuator is a thermal load at its stage temperature — they thermalise the line
so warm Johnson noise doesn't reach the qubit. This module computes, for a chosen
attenuation plan and drive power:

  • the residual thermal-photon number n̄ at the device (the figure of merit — want ≪1),
  • the heat dissipated at each stage vs that stage's cooling budget (a pass/fail), and
  • the total line attenuation and the signal power delivered to the qubit.

Physics (Krinner et al., EPJ Quantum Technology 6, 2 (2019); Pozar):
  • An attenuator of (power) loss L at physical temperature T emits thermal noise with
    occupation n̄(T)·(1 − 1/L); noise from a warmer stage is suppressed by every colder
    attenuator below it. n̄(T) = 1/(exp(hf/kT) − 1).
  • Heat at a stage = (power entering it) · (1 − 1/L_stage).

Pure-Python, no dependencies.
"""
from __future__ import annotations

import math

H = 6.62607015e-34
KB = 1.380649e-23


def _nbar(f_hz: float, t_k: float) -> float:
    """Bose occupation of a mode at frequency f and temperature T."""
    if t_k <= 0 or f_hz <= 0:
        return 0.0
    x = H * f_hz / (KB * t_k)
    if x > 700:
        return 0.0
    return 1.0 / (math.expm1(x))


# Representative Bluefors-class drive line (warmest → coldest). Cooling powers are
# order-of-magnitude budgets at each plate; all editable via params.
DEFAULT_STAGES = [
    {"name": "50 K", "temp_K": 50.0, "attenuation_dB": 0.0, "cooling_W": 1.0},
    {"name": "4 K", "temp_K": 4.0, "attenuation_dB": 20.0, "cooling_W": 1.5},
    {"name": "Still (~0.9 K)", "temp_K": 0.9, "attenuation_dB": 10.0, "cooling_W": 30e-3},
    {"name": "Cold plate (~0.1 K)", "temp_K": 0.1, "attenuation_dB": 0.0, "cooling_W": 500e-6},
    {"name": "Mixing chamber (~10 mK)", "temp_K": 0.01, "attenuation_dB": 20.0, "cooling_W": 20e-6},
]


def _dbm_to_w(dbm: float) -> float:
    return 10 ** (dbm / 10.0) * 1e-3


def analyze_drive_line(stages: list[dict], f_ghz: float, input_power_dbm: float) -> dict:
    """Thermal + power analysis of a drive line. `stages` warmest→coldest, each
    {name, temp_K, attenuation_dB, cooling_W}. Returns per-stage rows, device photon
    number, total attenuation and delivered signal power."""
    f_hz = max(f_ghz, 1e-3) * 1e9
    p_in_w = _dbm_to_w(input_power_dbm)

    total_atten_db = sum(float(s.get("attenuation_dB", 0.0)) for s in stages)
    rows = []
    p_here = p_in_w                                   # power entering the current stage [W]
    n_device = 0.0
    n = len(stages)
    for i, s in enumerate(stages):
        a_db = float(s.get("attenuation_dB", 0.0))
        t_k = float(s.get("temp_K", 0.0))
        l = 10 ** (a_db / 10.0)                       # linear power loss (≥1)
        emissivity = 1.0 - 1.0 / l if l > 1 else 0.0   # fraction of n̄(T) this attenuator emits
        # attenuation of everything BELOW this stage (colder) — suppresses its noise
        atten_below_db = sum(float(stages[j].get("attenuation_dB", 0.0)) for j in range(i + 1, n))
        suppress = 10 ** (-atten_below_db / 10.0)
        n_contrib = _nbar(f_hz, t_k) * emissivity * suppress
        n_device += n_contrib

        heat_w = p_here * (1.0 - 1.0 / l) if l > 1 else 0.0
        cooling_w = float(s.get("cooling_W", 0.0))
        rows.append({
            "name": s.get("name", f"stage{i}"),
            "temp_K": t_k,
            "attenuation_dB": round(a_db, 1),
            "heat_W": heat_w,
            "cooling_W": cooling_w,
            "headroom": (cooling_w / heat_w) if heat_w > 0 else None,
            "over_budget": bool(heat_w > cooling_w > 0),
            "noise_photons": round(n_contrib, 6),
        })
        p_here = p_here / l                            # power continues to the next stage

    p_device_w = p_here
    p_device_dbm = 10.0 * math.log10(p_device_w / 1e-3) if p_device_w > 0 else -200.0
    worst = max((r for r in rows if r["heat_W"] > 0), key=lambda r: (r["heat_W"] / r["cooling_W"]) if r["cooling_W"] else 0, default=None)

    recs = []
    if n_device > 0.05:
        recs.append(f"Residual thermal photons n-bar={n_device:.3f} is high (>0.05) — add attenuation at the coldest stage (MXC) to thermalise the line.")
    else:
        recs.append(f"Thermal noise is well-controlled (n-bar={n_device:.4f}, much less than 1).")
    over = [r for r in rows if r["over_budget"]]
    if over:
        recs.append("Heat load exceeds the cooling budget at: " + ", ".join(r["name"] for r in over)
                    + " — reduce drive power or move attenuation to a colder/higher-capacity stage.")
    else:
        recs.append("All stages are within their cooling budget at this drive power.")

    return {
        "f_GHz": round(f_ghz, 4),
        "input_power_dBm": round(input_power_dbm, 2),
        "total_attenuation_dB": round(total_atten_db, 1),
        "signal_at_device_dBm": round(p_device_dbm, 2),
        "device_photons_nbar": round(n_device, 6),
        "device_temp_K": round(stages[-1].get("temp_K", 0.01), 4) if stages else 0.0,
        "stages": rows,
        "worst_stage": worst["name"] if worst else None,
        "recommendations": recs,
        "method": "attenuator-cascade thermal/heat model (Krinner 2019; Pozar)",
    }
