from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "QRIVARA API"
    version: str = "0.1.0"
    environment: str = "development"  # set ENVIRONMENT=production to hide API docs
    # SQLite for development. For PostgreSQL, use:
    # postgresql://user:password@localhost:5432/qrivara
    database_url: str = "sqlite:///./qrivara.db"
    # Vite dev + preview origins; add your deployed frontend origin here.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]
    # When set, the API verifies Supabase JWTs (prod). Empty = dev mode (demo user).
    supabase_jwt_secret: str | None = None


settings = Settings()
