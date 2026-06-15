from typing import Any, Optional

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    domain: str = "superconducting"
    qubits: int = 1
    tags: list[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    qubits: Optional[int] = None
    progress: Optional[int] = None
    folder: Optional[str] = None
    bookmarked: Optional[bool] = None
    tags: Optional[list[str]] = None


class DesignCreate(BaseModel):
    project_id: str
    name: str = "main"
    doc: dict[str, Any] = {}


class DocUpdate(BaseModel):
    doc: dict[str, Any]
    version: Optional[int] = None  # optimistic concurrency token


class SnapshotCreate(BaseModel):
    label: str
    message: str = ""


class SimulationCreate(BaseModel):
    type: str  # validation | frequency | capacitance | coupling | hamiltonian | sweep
    solver: str = "palace"
    params: dict[str, Any] = {}


class OptimizationCreate(BaseModel):
    method: str = "bayesian"
    objectives: dict[str, Any] = {}
    params: dict[str, Any] = {}


class InverseDesignRequest(BaseModel):
    target_frequency: float = 5.2
    target_anharmonicity: float = -300


class ParamSpec(BaseModel):
    name: str  # "c_sigma_fF" | "ic_nA"
    mean: float
    sigma: float  # absolute 1σ
    tolerance: Optional[float] = None


class YieldRequest(BaseModel):
    parameters: list[ParamSpec] = []
    samples: int = 10000
    spec_lo_GHz: float = 5.05
    spec_hi_GHz: float = 5.21


class CodegenRequest(BaseModel):
    doc: dict[str, Any]


class CommentCreate(BaseModel):
    target: str = ""
    body: str


class CustomComponentCreate(BaseModel):
    kind: str
    name: str
    category: str
    description: str = ""
    color: str = "primary"
    defaults: dict[str, Any] = {}


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    org: Optional[str] = None
