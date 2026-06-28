"""Pluggable object storage for large artifacts (avatars, GDS, reports).

Backends (config.storage_backend):
  • "none"  — disabled; callers keep blobs inline (data-URLs in the DB). Default.
  • "local" — write to `storage_dir`, serve at /storage/<key> (see routers/storage.py).
  • "s3"    — upload to an S3/R2/MinIO bucket via boto3 (lazily imported only when used).

Content-addressed: the key is sha256(bytes)[:24] + extension, so identical uploads
dedupe and keys are unguessable. Pure stdlib for the local backend; boto3 is only
imported when the s3 backend is selected, so the base install stays dependency-free.
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
from pathlib import Path

from .config import settings

_EXT_BY_CT = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
    "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg",
    "application/octet-stream": ".bin", "text/plain": ".txt", "application/json": ".json",
}
# keys we will serve: 24-hex content hash + a short safe extension (no path traversal)
_KEY_RE = re.compile(r"^[0-9a-f]{24}\.[a-z0-9]{1,6}$")


def enabled() -> bool:
    return settings.storage_backend in ("local", "s3")


def is_valid_key(key: str) -> bool:
    return bool(_KEY_RE.match(key))


def _key_for(data: bytes, content_type: str) -> str:
    ext = _EXT_BY_CT.get((content_type or "").split(";")[0].strip().lower(), ".bin")
    return hashlib.sha256(data).hexdigest()[:24] + ext


def put_bytes(data: bytes, content_type: str = "application/octet-stream") -> str:
    """Store bytes and return a URL. Raises ValueError if storage is off or the blob
    exceeds `storage_max_bytes`."""
    if not enabled():
        raise ValueError("object storage is disabled")
    if len(data) > settings.storage_max_bytes:
        raise ValueError("artifact exceeds storage_max_bytes")
    key = _key_for(data, content_type)
    if settings.storage_backend == "s3":
        return _put_s3(key, data, content_type)
    return _put_local(key, data)


def put_data_url(data_url: str) -> str | None:
    """Offload a `data:<ct>;base64,<payload>` URL to storage; return the new URL, or
    None if it isn't a base64 data URL (caller keeps the original)."""
    m = re.match(r"^data:([^;]+);base64,(.*)$", data_url or "", re.DOTALL)
    if not m:
        return None
    content_type, b64 = m.group(1), m.group(2)
    try:
        data = base64.b64decode(b64)
    except Exception:  # noqa: BLE001
        return None
    return put_bytes(data, content_type)


# ── local backend ───────────────────────────────────────────────────────────
def _storage_dir() -> Path:
    p = Path(settings.storage_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _put_local(key: str, data: bytes) -> str:
    path = _storage_dir() / key
    if not path.exists():                                  # content-addressed → write once
        path.write_bytes(data)
    base = settings.storage_public_base.rstrip("/")
    return f"{base}/storage/{key}" if base else f"/storage/{key}"


def local_path(key: str) -> str | None:
    """Absolute path of a stored object for the serve endpoint, or None if the key is
    invalid or missing (path-traversal-safe: key is validated against `_KEY_RE`)."""
    if not is_valid_key(key):
        return None
    path = _storage_dir() / key
    return str(path) if path.exists() else None


# ── s3 / r2 backend (boto3, lazy) ─────────────────────────────────────────────
def _put_s3(key: str, data: bytes, content_type: str) -> str:
    import boto3  # lazy: only needed when the s3 backend is selected
    client = boto3.client(
        "s3", region_name=settings.s3_region, endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
    )
    client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
    base = (settings.s3_public_base or "").rstrip("/")
    if base:
        return f"{base}/{key}"
    # presigned GET as a fallback when no public base is configured
    return client.generate_presigned_url("get_object",
                                          Params={"Bucket": settings.s3_bucket, "Key": key},
                                          ExpiresIn=7 * 24 * 3600)
