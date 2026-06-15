from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..models import User
from ..schemas import ProfileUpdate
from ..security import get_current_user

router = APIRouter(tags=["auth"])


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/auth/profile")
def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
