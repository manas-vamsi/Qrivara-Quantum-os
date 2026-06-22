from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def uid() -> str:
    return uuid4().hex[:12]


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    role: str = "Quantum Engineer"
    org: str = "QRIVARA"
    avatar_url: str = ""   # uploaded avatar as a data URL (or external URL); "" → initials
    # Social/collaboration profile (added in the collaboration module).
    handle: Optional[str] = Field(default=None, unique=True, index=True)
    headline: str = ""
    bio: str = ""
    institution: str = ""
    discoverable: bool = True
    # Light presence: updated by the heartbeat ping; "online" = recent last_seen.
    last_seen: Optional[datetime] = None
    created_at: datetime = Field(default_factory=now)


class Project(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    name: str
    description: str = ""
    domain: str = "superconducting"
    qubits: int = 1
    status: str = "active"  # active | review | archived | simulating
    progress: int = 0
    folder: Optional[str] = None
    bookmarked: bool = False
    # private (default, invite-only) | org (everyone in owner's org) | link | public
    visibility: str = "private"
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    collaborators: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # Owner. SET NULL on user delete so the project survives an account removal.
    created_by: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Design(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    name: str = "main"
    version: int = 1  # optimistic-concurrency token for the doc
    # The whole canvas: { "nodes": [...], "edges": [...] }
    doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class DesignVersion(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    design_id: str = Field(foreign_key="design.id", index=True, ondelete="CASCADE")
    label: str
    message: str = ""
    author: str = ""
    doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    freq: Optional[float] = None
    fidelity: Optional[float] = None
    tag: Optional[str] = None
    created_at: datetime = Field(default_factory=now)


class SimulationJob(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    design_id: str = Field(foreign_key="design.id", index=True, ondelete="CASCADE")
    type: str  # validation | frequency | capacitance | coupling | hamiltonian | sweep
    solver: str = "palace"  # palace | hfss | q3d | analytic
    status: str = "queued"  # queued | running | done | failed | canceled
    progress: int = 0
    params: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    result: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class OptimizationRun(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    # Nullable: the standalone parameter optimizer is not tied to a saved design.
    # SET NULL on design delete so a standalone run's history is preserved.
    design_id: Optional[str] = Field(
        default=None, foreign_key="design.id", index=True, nullable=True, ondelete="SET NULL"
    )
    method: str = "bayesian"  # bayesian | genetic | gradient
    status: str = "running"
    objectives: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    params: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    best: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    history: list[Any] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)


class CustomComponent(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    kind: str
    name: str
    category: str
    description: str = ""
    color: str = "primary"
    defaults: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_by: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=now)


class Comment(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    target: str = ""
    author: str
    body: str
    resolved: bool = False
    created_at: datetime = Field(default_factory=now)


class Activity(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    actor: str
    action: str
    target: str
    type: str = "design"
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Collaboration module                                                         #
# --------------------------------------------------------------------------- #

class ProjectGrant(SQLModel, table=True):
    """Per-project access grant (ReBAC tuple: project #role @ subject).

    The presence of a grant is what makes a private project *visible* to a
    subject. No grant + not owner + not org/public => the project is invisible.
    At most one grant per (project, subject) — enforced by a unique constraint.
    """
    __table_args__ = (
        UniqueConstraint("project_id", "subject_type", "subject_id", name="uq_grant_subject"),
    )
    id: str = Field(default_factory=uid, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    subject_type: str = "user"        # user | team
    # Polymorphic (user.id or team.id) so no single FK; uniqueness covers integrity.
    subject_id: str = Field(index=True)
    role: str = "viewer"              # owner | editor | commenter | viewer
    granted_by: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=now)


class Connection(SQLModel, table=True):
    """Social connection (friend) edge between two users. One row per pair."""
    id: str = Field(default_factory=uid, primary_key=True)
    requester_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    addressee_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    status: str = "pending"          # pending | accepted | blocked
    created_at: datetime = Field(default_factory=now)
    responded_at: Optional[datetime] = None


class Notification(SQLModel, table=True):
    """Actionable inbox item for a recipient user."""
    id: str = Field(default_factory=uid, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")  # recipient
    type: str                        # project_shared | role_changed | connection_request
                                     # | connection_accepted | comment | mention | sim_done
                                     # | message | channel_invite
    actor_id: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    read: bool = False
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Teams (Phase 4 — enterprise / group-based sharing)                           #
# --------------------------------------------------------------------------- #

class Team(SQLModel, table=True):
    """A named group within an org. A project can be granted to a team, so every
    member inherits access (ReBAC: project #role @ team:<id>)."""
    id: str = Field(default_factory=uid, primary_key=True)
    org: str = ""
    name: str = ""
    description: str = ""
    created_by: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=now)


class TeamMember(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_teammember_user"),
    )
    id: str = Field(default_factory=uid, primary_key=True)
    team_id: str = Field(foreign_key="team.id", index=True, ondelete="CASCADE")
    user_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    role: str = "member"             # member | lead
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Chat (Phase 3 — Slack-like channels, DMs, threads)                           #
# --------------------------------------------------------------------------- #

class Channel(SQLModel, table=True):
    """A conversation space. kind="channel" is a named, joinable room; kind="dm"
    is a 1:1 direct-message space whose members are the two participants."""
    id: str = Field(default_factory=uid, primary_key=True)
    kind: str = "channel"            # channel | dm
    name: str = ""                   # display name (channels); derived for DMs
    topic: str = ""
    is_private: bool = False         # private channel = invite-only
    org: str = ""                    # owning org (public-channel discovery)
    # Deterministic key for DMs ("<minId>|<maxId>"); unique so there is at most
    # one DM channel per pair (NULL for named channels — many NULLs allowed).
    dm_key: Optional[str] = Field(default=None, unique=True, index=True)
    created_by: Optional[str] = Field(default=None, foreign_key="user.id", ondelete="SET NULL")
    created_at: datetime = Field(default_factory=now)


class ChannelMember(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("channel_id", "user_id", name="uq_channelmember_user"),
    )
    id: str = Field(default_factory=uid, primary_key=True)
    channel_id: str = Field(foreign_key="channel.id", index=True, ondelete="CASCADE")
    user_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    last_read_at: Optional[datetime] = None   # drives per-channel unread counts
    created_at: datetime = Field(default_factory=now)


class Message(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    channel_id: str = Field(foreign_key="channel.id", index=True, ondelete="CASCADE")
    user_id: str = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    body: str = ""
    # Thread root message id; None for top-level messages. CASCADE so deleting a
    # root removes its replies.
    parent_id: Optional[str] = Field(
        default=None, foreign_key="message.id", index=True, ondelete="CASCADE"
    )
    created_at: datetime = Field(default_factory=now)
