import math
from typing import Any, Optional

from fastapi import HTTPException
from pydantic import BaseModel


def reject_nonfinite(obj: Any, _path: str = "params") -> None:
    """Recursively reject NaN/±Inf in a request payload (and numeric strings that
    coerce to them, e.g. "inf", "nan", "1e999"). Non-finite values break JSON
    persistence on Postgres (jsonb rejects them) and Starlette's response renderer
    (allow_nan=False → 500). Raise 422 at the boundary instead. Non-numeric strings
    (e.g. "transmon") pass through untouched."""
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        if isinstance(obj, float) and not math.isfinite(obj):
            raise HTTPException(422, f"{_path} is a non-finite number")
        return
    if isinstance(obj, str):
        try:
            f = float(obj)
        except (TypeError, ValueError):
            return
        if not math.isfinite(f):
            raise HTTPException(422, f"{_path} coerces to a non-finite number")
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            reject_nonfinite(v, f"{_path}.{k}")
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            reject_nonfinite(v, f"{_path}[{i}]")


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
    # Accept either a list of objective names (["frequency", ...]) or a dict;
    # the router normalizes to a dict before persisting.
    objectives: list[str] | dict[str, Any] = {}
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
