from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..catalog import (
    COMPONENT_LIBRARY,
    CONDUCTORS,
    DRC_RULES,
    LOSS_INTERFACES,
    PARAMETER_SPECS,
    PROCESS_RECIPES,
    SUBSTRATES,
)
from ..db import get_session
from ..models import CustomComponent, User
from ..schemas import CustomComponentCreate
from ..security import get_current_user

router = APIRouter(prefix="/components", tags=["components"])


@router.get("")
def list_components(session: Session = Depends(get_session)):
    custom = session.exec(select(CustomComponent)).all()
    return {
        "built_in": COMPONENT_LIBRARY,
        "custom": custom,
        "conductors": CONDUCTORS,
        "substrates": SUBSTRATES,
        "loss_interfaces": LOSS_INTERFACES,
        "drc_rules": DRC_RULES,
        "process_recipes": PROCESS_RECIPES,
        "parameter_specs": PARAMETER_SPECS,
    }


@router.post("/custom", status_code=201)
def create_custom(
    body: CustomComponentCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = CustomComponent(**body.model_dump(), created_by=user.id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c
