from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Activity, Comment, User
from ..schemas import CommentCreate
from ..security import get_current_user

router = APIRouter(tags=["collaboration"])


@router.get("/comments")
def list_comments(session: Session = Depends(get_session)):
    return session.exec(select(Comment).order_by(Comment.created_at.desc())).all()


@router.post("/comments", status_code=201)
def add_comment(
    body: CommentCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = Comment(author=user.name, body=body.body, target=body.target)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@router.post("/comments/{comment_id}/resolve")
def resolve(comment_id: str, session: Session = Depends(get_session)):
    c = session.get(Comment, comment_id)
    if c:
        c.resolved = not c.resolved
        session.add(c)
        session.commit()
    return c


@router.get("/activity")
def activity(session: Session = Depends(get_session)):
    return session.exec(select(Activity).order_by(Activity.created_at.desc())).all()
