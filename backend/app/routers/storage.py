"""Serve locally-stored artifacts (the 'local' object-storage backend).

GET /storage/<key> streams a content-addressed object from `storage_dir`. The key is
validated against a strict pattern (24-hex hash + short extension), so a caller can
never traverse outside the storage directory. Unused when the backend is 's3' (objects
are served by the bucket/CDN) or 'none'.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import storage

router = APIRouter(tags=["storage"])

_MEDIA = {
    ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json",
    ".txt": "text/plain",
}


@router.get("/storage/{key}")
def get_object(key: str):
    path = storage.local_path(key)
    if not path:
        raise HTTPException(404, "Not found")
    ext = "." + key.rsplit(".", 1)[-1]
    return FileResponse(path, media_type=_MEDIA.get(ext, "application/octet-stream"),
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})
