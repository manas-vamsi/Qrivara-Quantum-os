from fastapi import Depends, HTTPException
from sqlmodel import Session, select

from .db import get_session
from .models import User


def get_current_user(session: Session = Depends(get_session)) -> User:
    """DEV MODE: returns the seeded demo user so the API is usable immediately.

    PRODUCTION: read the `Authorization: Bearer <jwt>` header, verify it against
    `settings.supabase_jwt_secret` (Supabase Auth), then look up/provision the
    user by the token's `sub`/email. Swap this one function — nothing else changes.
    """
    user = session.exec(select(User)).first()
    if not user:
        raise HTTPException(status_code=401, detail="No user found — seed the database.")
    return user
