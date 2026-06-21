from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import SQLModel, Session, create_engine

from .config import settings

# SQLite for cheap MVP; swap database_url to a Postgres DSN to scale (no code change).
_is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

_engine_kwargs: dict = {"echo": False, "connect_args": connect_args}
if not _is_sqlite:
    # Real connection pool for Postgres. pool_pre_ping discards connections that
    # a cloud DB / PgBouncer dropped while idle (avoids "server closed the
    # connection" errors); pool_recycle refreshes them well before typical idle
    # timeouts. SQLite keeps its lightweight default pool.
    _engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,
        pool_recycle=1800,
    )
engine = create_engine(settings.database_url, **_engine_kwargs)

# Columns added to pre-existing tables after the first release. `create_all` only
# creates missing *tables*, never alters existing ones, so we add these by hand.
# (table, column, DDL type+default) — applied only when the column is absent.
# Lightweight dev migration; production should use Alembic.
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("project", "visibility", "VARCHAR DEFAULT 'private'"),
    ("user", "handle", "VARCHAR"),
    ("user", "headline", "VARCHAR DEFAULT ''"),
    ("user", "bio", "VARCHAR DEFAULT ''"),
    ("user", "institution", "VARCHAR DEFAULT ''"),
    ("user", "discoverable", "BOOLEAN DEFAULT TRUE"),
    ("user", "last_seen", "TIMESTAMP"),
    ("channel", "dm_key", "VARCHAR"),
]


def _ensure_columns() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if table not in existing_tables:
                continue  # create_all already made it with all columns
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column in cols:
                continue
            # Table/column names are internal constants, not user input.
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {ddl}'))


# Uniqueness constraints `create_all` won't retrofit onto pre-existing tables.
# (index name, quoted table, column tuple). Applied idempotently via
# CREATE UNIQUE INDEX IF NOT EXISTS so the DB — not just the app — enforces them.
# NULLs are allowed (and de-duplicated only among non-NULL rows) so partial keys
# like `handle`/`dm_key` stay optional.
_UNIQUE_INDEXES: list[tuple[str, str, str]] = [
    ("uq_user_email", '"user"', "(email)"),
    ("uq_user_handle", '"user"', "(handle)"),
    ("uq_channel_dm_key", "channel", "(dm_key)"),
    ("uq_grant_subject", "projectgrant", "(project_id, subject_type, subject_id)"),
    ("uq_channelmember_user", "channelmember", "(channel_id, user_id)"),
    ("uq_teammember_user", "teammember", "(team_id, user_id)"),
]


def _ensure_constraints() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    for name, table, cols in _UNIQUE_INDEXES:
        raw = table.strip('"')
        if raw not in existing_tables:
            continue
        target = {c.strip() for c in cols.strip("()").split(",")}
        # Skip if uniqueness on these columns is already enforced — e.g. on a
        # fresh DB where create_all built it from the model declarations — so we
        # never create a redundant second index.
        enforced = [set(ix["column_names"]) for ix in inspector.get_indexes(raw) if ix.get("unique")]
        try:
            enforced += [set(uc["column_names"]) for uc in inspector.get_unique_constraints(raw)]
        except Exception:  # noqa: BLE001 — dialect may not support it
            pass
        if target in enforced:
            continue
        # One transaction per index: if a pre-existing duplicate row blocks the
        # unique index, roll back just that one and keep booting (log it) rather
        # than bricking startup on a dirty row.
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table} {cols}")
                )
        except Exception as exc:  # noqa: BLE001 — best-effort dev migration
            print(f"[db] skipped unique index {name} (resolve duplicates): {exc}")


def init_db() -> None:
    # Import models so SQLModel sees the tables before create_all.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _ensure_columns()
    _ensure_constraints()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
