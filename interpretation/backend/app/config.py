"""Application settings loaded from environment / Secret Manager.

Values come from .env in dev. In Cloud Run, Secret Manager bindings inject
secrets as env vars (see Terraform Cloud Run manifest, Phase 1+).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: str = Field(default="dev")
    log_level: str = Field(default="INFO")

    # GCP
    gcp_project_id: str = Field(default="gmo-interpretation-dev")
    gcp_region: str = Field(default="asia-northeast1")

    # Vertex AI
    vertex_ai_region: str = Field(default="asia-northeast1")
    gemini_model: str = Field(default="gemini-2.5-flash")

    # Speech-to-Text V2
    stt_region: str = Field(default="asia-northeast1")
    stt_language: str = Field(default="ja-JP")
    stt_model: str = Field(default="chirp_3")

    # Text-to-Speech
    tts_region: str = Field(default="global")

    # Postgres / Redis
    database_url: str = Field(default="postgresql+asyncpg://localhost/interpretation")
    redis_url: str = Field(default="redis://localhost:6379/0")

    # Auth
    jwt_secret: str = Field(default="dev-only-change-me")
    jwt_alg: str = Field(default="HS256")
    jwt_ttl_hours: int = Field(default=12)

    # CORS
    cors_allowed_origins: str = Field(default="http://localhost:3000")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.environment.lower() in {"dev", "development", "local"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
