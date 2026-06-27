from fastapi import APIRouter

from .. import physics
from ..catalog import CONDUCTORS, DRC_RULES, LOSS_INTERFACES, SUBSTRATES

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("")
def all_materials():
    return {
        "conductors": CONDUCTORS,
        "substrates": SUBSTRATES,
        "loss_interfaces": LOSS_INTERFACES,
        "drc_rules": DRC_RULES,
    }


@router.get("/predict")
def predict_coherence(substrate: str = "si", conductor: str = "ta", f01_GHz: float = 5.0):
    """Material-choice coherence predictor: combine the chosen substrate's bulk
    dielectric loss and the chosen film's surface (metal–air) loss with the standard
    interface participations → internal Q and dielectric-limited T1 (1/Q = Σ p·tanδ,
    T1 = Q/2πf). A first-order 'which materials give the best T1' estimator — not a
    geometry solve (use the Surface-Participation analysis for that)."""
    sub = next((s for s in SUBSTRATES if s["id"] == substrate), SUBSTRATES[0])
    cond = next((c for c in CONDUCTORS if c["id"] == conductor), CONDUCTORS[0])
    f = max(float(f01_GHz), 0.1)
    surf_tand = cond.get("surface_tanD") or 1.5e-3
    # interface participations (standard planar-transmon values) with material tanδ's:
    # MA uses the film's surface loss; SA/MS use reference oxide losses; bulk uses the substrate.
    interfaces = [
        {"name": "MA (metal–air)", "p": 6e-5, "tanD": surf_tand},
        {"name": "SA (substrate–air)", "p": 9e-5, "tanD": 2.2e-3},
        {"name": "MS (metal–substrate)", "p": 3e-5, "tanD": 2.6e-3},
        {"name": "bulk substrate", "p": 0.9, "tanD": float(sub.get("tanD", 2e-7))},
    ]
    lb = physics.loss_budget([{"p": i["p"], "tanD": i["tanD"]} for i in interfaces], f)
    contrib = [
        {**i, "inv_q": round(i["p"] * i["tanD"], 12),
         "T1_us": round(physics.t1_from_q(1.0 / (i["p"] * i["tanD"]), f), 1) if i["p"] * i["tanD"] > 0 else None}
        for i in interfaces
    ]
    contrib.sort(key=lambda c: -(c["inv_q"]))
    return {
        "substrate": sub["name"], "conductor": cond["name"], "f01_GHz": round(f, 3),
        "Q_internal": round(lb["Q"]) if lb["Q"] != float("inf") else None,
        "T1_dielectric_us": round(lb["t1Us"], 1) if lb["t1Us"] != float("inf") else None,
        "dominant_channel": contrib[0]["name"],
        "channels": contrib,
        "film_best_t1_us": cond.get("best_t1_us"),
        "substrate_best_t1_us": sub.get("best_t1_us"),
        "method": "interface-participation loss budget (1/Q = Σ p·tanδ) with material loss tangents",
    }


@router.get("/conductors")
def conductors():
    return CONDUCTORS


@router.get("/substrates")
def substrates():
    return SUBSTRATES


@router.get("/loss-interfaces")
def loss_interfaces():
    return LOSS_INTERFACES


@router.get("/drc")
def drc():
    return DRC_RULES
