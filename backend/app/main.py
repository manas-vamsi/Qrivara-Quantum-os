"""QRIVARA backend — modular monolith.

Routers are mounted at ROOT (no /api/v1 prefix) to match the frontend client in
`src/lib/api.ts` (e.g. GET /projects/, GET /components/). FastAPI's slash
redirect makes both /projects and /projects/ work.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    ai,
    auth,
    chat,
    codegen,
    collaboration,
    components,
    dashboard,
    designs,
    experiments,
    export,
    materials,
    optimization,
    projects,
    results,
    search,
    simulations,
    social,
    teams,
)
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed: in production the dev impersonation path (X-Dev-User-Id) must
    # never be reachable, so refuse to boot without a configured JWT secret
    # rather than silently downgrading to header-trust auth.
    if settings.environment == "production" and not settings.supabase_jwt_secret:
        raise RuntimeError(
            "Refusing to start in production without `supabase_jwt_secret` — "
            "dev header auth would be exposed."
        )
    init_db()
    seed()
    yield


# Hide interactive docs / OpenAPI schema outside development so the API surface
# isn't publicly exposed in production.
_is_dev = settings.environment != "production"
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    auth, projects, designs, components, materials, simulations,
    codegen, optimization, results, experiments, collaboration, search, export, ai,
    social, chat, teams, dashboard,
):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.version}


@app.get("/", tags=["meta"])
def root():
    return {"name": settings.app_name, "version": settings.version, "docs": "/docs"}
