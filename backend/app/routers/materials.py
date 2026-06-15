from fastapi import APIRouter

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
