from fastapi import APIRouter, Depends
from sqlmodel import Session

from .. import storage
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
    data = body.model_dump(exclude_none=True)
    # Offload a freshly-uploaded data-URL avatar to object storage (when configured),
    # so large image blobs don't bloat the DB. Falls back to storing the data-URL
    # inline when storage is off or the offload fails.
    av = data.get("avatar_url")
    if av and av.startswith("data:") and storage.enabled():
        try:
            url = storage.put_data_url(av)
            if url:
                data["avatar_url"] = url
        except Exception:  # noqa: BLE001 — never block a profile save on storage
            pass
    for k, v in data.items():
        setattr(user, k, v)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
