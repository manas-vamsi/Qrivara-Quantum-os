"""Chat module: Slack-like channels, direct messages and threaded replies.

Access model:
- A user reads/posts in a channel only if they are a `ChannelMember`.
- Public channels (`is_private=False`) in the user's org are discoverable and
  joinable; private channels are invite-only.
- DMs are channels with `kind="dm"` whose two members are the participants.

Delivery is poll-based (the frontend long-polls `?after=`), which keeps the dev
stack simple and reliable; swap in WebSockets later without changing the schema.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, or_, select

from ..db import get_session
from ..models import (
    Channel,
    ChannelMember,
    Connection,
    Message,
    Notification,
    User,
)
from ..security import get_current_user

router = APIRouter(tags=["chat"])

ONLINE_WINDOW = timedelta(minutes=2)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _author(u: User | None) -> dict | None:
    if not u:
        return None
    online = bool(u.last_seen and (_now() - _aware(u.last_seen)) < ONLINE_WINDOW)
    return {"id": u.id, "name": u.name, "handle": u.handle, "online": online}


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; treat them as UTC for comparison.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _membership(channel_id: str, user_id: str, session: Session) -> ChannelMember | None:
    return session.exec(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
        )
    ).first()


def _require_member(channel_id: str, user: User, session: Session) -> tuple[Channel, ChannelMember]:
    channel = session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")
    member = _membership(channel_id, user.id, session)
    if not member:
        # Invisible, not "denied" — mirror the project access model.
        raise HTTPException(404, "Channel not found")
    return channel, member


def _members(channel_id: str, session: Session) -> list[User]:
    rows = session.exec(
        select(ChannelMember).where(ChannelMember.channel_id == channel_id)
    ).all()
    users = []
    for m in rows:
        u = session.get(User, m.user_id)
        if u:
            users.append(u)
    return users


def _unread(channel_id: str, member: ChannelMember, user: User, session: Session) -> int:
    """Top-level messages since the member last read, not authored by them."""
    q = select(func.count()).select_from(Message).where(
        Message.channel_id == channel_id,
        Message.parent_id == None,  # noqa: E711
        Message.user_id != user.id,
    )
    if member.last_read_at:
        q = q.where(Message.created_at > member.last_read_at)
    return int(session.exec(q).one())


def _channel_view(channel: Channel, member: ChannelMember, user: User, session: Session) -> dict:
    members = _members(channel.id, session)
    last = session.exec(
        select(Message).where(Message.channel_id == channel.id)
        .order_by(Message.created_at.desc())
    ).first()
    # DM display name/avatar = the *other* participant.
    name, dm_user = channel.name, None
    if channel.kind == "dm":
        other = next((m for m in members if m.id != user.id), None)
        dm_user = _author(other)
        name = other.name if other else "Direct message"
    return {
        "id": channel.id,
        "kind": channel.kind,
        "name": name,
        "topic": channel.topic,
        "is_private": channel.is_private,
        "member_count": len(members),
        "members": [_author(m) for m in members],
        "dm_user": dm_user,
        "unread": _unread(channel.id, member, user, session),
        "last_message": (
            {"body": last.body, "created_at": last.created_at,
             "author": _author(session.get(User, last.user_id))}
            if last else None
        ),
        "created_at": channel.created_at,
    }


def _message_view(m: Message, session: Session) -> dict:
    reply_count = int(session.exec(
        select(func.count()).select_from(Message).where(Message.parent_id == m.id)
    ).one())
    return {
        "id": m.id, "channel_id": m.channel_id, "body": m.body,
        "parent_id": m.parent_id, "created_at": m.created_at,
        "author": _author(session.get(User, m.user_id)),
        "reply_count": reply_count,
    }


# --------------------------------------------------------------------------- #
# Channels                                                                     #
# --------------------------------------------------------------------------- #

@router.get("/channels")
def list_channels(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Channels and DMs the user belongs to, newest-active first."""
    memberships = session.exec(
        select(ChannelMember).where(ChannelMember.user_id == user.id)
    ).all()
    views = []
    for m in memberships:
        ch = session.get(Channel, m.channel_id)
        if ch:
            views.append(_channel_view(ch, m, user, session))
    # Active channels first (by last message / creation), DMs and channels mixed.
    # Normalize datetimes so naive (SQLite) and aware (Postgres) never mix-compare.
    def _key(v):
        dt = v["last_message"]["created_at"] if v["last_message"] else v["created_at"]
        return _aware(dt)
    views.sort(key=_key, reverse=True)
    return views


@router.get("/channels/discover")
def discover_channels(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Public channels in the user's org that they haven't joined yet."""
    joined = {
        m.channel_id for m in session.exec(
            select(ChannelMember).where(ChannelMember.user_id == user.id)
        ).all()
    }
    rows = session.exec(
        select(Channel).where(
            Channel.kind == "channel",
            Channel.is_private == False,  # noqa: E712
            or_(Channel.org == user.org, Channel.org == ""),
        )
    ).all()
    out = []
    for ch in rows:
        if ch.id in joined:
            continue
        out.append({
            "id": ch.id, "name": ch.name, "topic": ch.topic,
            "member_count": len(_members(ch.id, session)),
        })
    return out


@router.post("/channels", status_code=201)
def create_channel(
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(422, "Channel name is required")
    channel = Channel(
        kind="channel", name=name, topic=(body.get("topic") or "").strip(),
        is_private=bool(body.get("is_private")), org=user.org, created_by=user.id,
    )
    session.add(channel)
    session.commit()
    session.refresh(channel)

    # Creator + any explicitly invited members.
    member_ids = {user.id, *(body.get("member_ids") or [])}
    for uid_ in member_ids:
        if session.get(User, uid_):
            session.add(ChannelMember(channel_id=channel.id, user_id=uid_))
            if uid_ != user.id:
                session.add(Notification(
                    user_id=uid_, type="channel_invite", actor_id=user.id,
                    payload={"channel_id": channel.id, "channel_name": name,
                             "actor_name": user.name},
                ))
    session.commit()
    member = _membership(channel.id, user.id, session)
    return _channel_view(channel, member, user, session)


@router.post("/channels/{channel_id}/join")
def join_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    channel = session.get(Channel, channel_id)
    if not channel or channel.kind != "channel":
        raise HTTPException(404, "Channel not found")
    # Channels are org-scoped: never joinable across organizations by id.
    if channel.org and channel.org != user.org:
        raise HTTPException(404, "Channel not found")
    if channel.is_private and not _membership(channel_id, user.id, session):
        raise HTTPException(403, "This channel is invite-only")
    if not _membership(channel_id, user.id, session):
        session.add(ChannelMember(channel_id=channel_id, user_id=user.id))
        session.commit()
    member = _membership(channel_id, user.id, session)
    return _channel_view(channel, member, user, session)


@router.post("/channels/{channel_id}/leave", status_code=204)
def leave_channel(
    channel_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = _membership(channel_id, user.id, session)
    if member:
        session.delete(member)
        session.commit()


@router.post("/channels/{channel_id}/read")
def mark_channel_read(
    channel_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _, member = _require_member(channel_id, user, session)
    member.last_read_at = _now()
    session.add(member)
    session.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Direct messages                                                             #
# --------------------------------------------------------------------------- #

@router.post("/dm/{other_id}")
def open_dm(
    other_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Get-or-create the 1:1 DM channel between the caller and `other_id`.

    DMs are allowed within the same org, or across orgs only between *connected*
    users — so you can't cold-message arbitrary strangers in other organizations.
    """
    if other_id == user.id:
        raise HTTPException(409, "Cannot DM yourself")
    other = session.get(User, other_id)
    if not other:
        raise HTTPException(404, "User not found")
    if other.org != user.org:
        conn = session.exec(
            select(Connection).where(
                Connection.status == "accepted",
                or_(
                    (Connection.requester_id == user.id) & (Connection.addressee_id == other_id),
                    (Connection.requester_id == other_id) & (Connection.addressee_id == user.id),
                ),
            )
        ).first()
        if not conn:
            raise HTTPException(404, "User not found")

    # Deterministic key makes get-or-create idempotent under concurrent opens.
    dm_key = "|".join(sorted([user.id, other_id]))
    existing = session.exec(
        select(Channel).where(Channel.kind == "dm", Channel.dm_key == dm_key)
    ).first()
    if existing:
        # Heal membership in case a prior partial create left one side off.
        for uid_ in (user.id, other_id):
            if not _membership(existing.id, uid_, session):
                session.add(ChannelMember(channel_id=existing.id, user_id=uid_))
        session.commit()
        return _channel_view(existing, _membership(existing.id, user.id, session), user, session)

    channel = Channel(kind="dm", org=user.org, dm_key=dm_key, created_by=user.id)
    session.add(channel)
    session.commit()
    session.refresh(channel)
    session.add(ChannelMember(channel_id=channel.id, user_id=user.id))
    session.add(ChannelMember(channel_id=channel.id, user_id=other_id))
    session.commit()
    member = _membership(channel.id, user.id, session)
    return _channel_view(channel, member, user, session)


# --------------------------------------------------------------------------- #
# Messages                                                                     #
# --------------------------------------------------------------------------- #

@router.get("/channels/{channel_id}/messages")
def list_messages(
    channel_id: str,
    parent_id: str | None = Query(default=None),
    after: str | None = Query(default=None),
    limit: int = Query(default=80, le=200),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Top-level messages (parent_id omitted) or a thread's replies (parent_id set).
    `after` (a message id) returns only newer messages for incremental polling."""
    _require_member(channel_id, user, session)
    q = select(Message).where(Message.channel_id == channel_id)
    if parent_id:
        q = q.where(Message.parent_id == parent_id)
    else:
        q = q.where(Message.parent_id == None)  # noqa: E711
    if after:
        anchor = session.get(Message, after)
        if anchor:
            q = q.where(Message.created_at > anchor.created_at)
    rows = session.exec(q.order_by(Message.created_at).limit(limit)).all()
    return [_message_view(m, session) for m in rows]


@router.post("/channels/{channel_id}/messages", status_code=201)
def post_message(
    channel_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    channel, member = _require_member(channel_id, user, session)
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(422, "Message body is required")
    parent_id = body.get("parent_id")
    if parent_id:
        parent = session.get(Message, parent_id)
        if not parent or parent.channel_id != channel_id:
            raise HTTPException(404, "Parent message not found")

    msg = Message(channel_id=channel_id, user_id=user.id, body=text, parent_id=parent_id)
    session.add(msg)
    # Posting marks the channel read for the author.
    member.last_read_at = _now()
    session.add(member)

    # Notify the other DM participant (channels stay quiet to avoid noise).
    if channel.kind == "dm":
        for m in _members(channel_id, session):
            if m.id != user.id:
                session.add(Notification(
                    user_id=m.id, type="message", actor_id=user.id,
                    payload={"channel_id": channel_id, "actor_name": user.name,
                             "preview": text[:80]},
                ))
    session.commit()
    session.refresh(msg)
    return _message_view(msg, session)
