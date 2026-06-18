from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def uid() -> str:
    return uuid4().hex[:12]


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    email: str = Field(index=True)
    name: str
    role: str = "Quantum Engineer"
    org: str = "QRIVARA"
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
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    collaborators: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_by: Optional[str] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Design(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: str = "main"
    version: int = 1  # optimistic-concurrency token for the doc
    # The whole canvas: { "nodes": [...], "edges": [...] }
    doc: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class DesignVersion(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    design_id: str = Field(foreign_key="design.id", index=True)
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
    design_id: str = Field(foreign_key="design.id", index=True)
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
    design_id: Optional[str] = Field(default=None, foreign_key="design.id", index=True, nullable=True)
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
    created_by: Optional[str] = Field(default=None, foreign_key="user.id")
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
