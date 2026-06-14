from collections.abc import Iterator

from sqlmodel import SQLModel, Session, create_engine

from .config import settings

# SQLite for cheap MVP; swap database_url to a Postgres DSN to scale (no code change).
connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
    # Import models so SQLModel sees the tables before create_all.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
