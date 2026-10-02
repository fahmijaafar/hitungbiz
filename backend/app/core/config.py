import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",") if i.strip()]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    PROJECT_NAME: str
    SENTRY_DSN: HttpUrl | None = None

    # Security Hardening Configuration (Phase 1)
    SECURITY_HEADERS_ENABLED: bool = True
    SECURE_HSTS_ENABLED: bool = False
    SECURE_HSTS_SECONDS: int = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS: bool = True
    SECURE_HSTS_PRELOAD: bool = False
    MAX_REQUEST_BODY_SIZE: int = 50 * 1024 * 1024  # 50 MB limit
    REMOVE_SERVER_HEADER: bool = True
    CSP_HEADER_OVERRIDE: str | None = None
    X_FRAME_OPTIONS: str = "DENY"
    X_CONTENT_TYPE_OPTIONS: str = "nosniff"
    REFERRER_POLICY: str = "strict-origin-when-cross-origin"
    PERMISSIONS_POLICY: str = "camera=(), microphone=(), geolocation=(), payment=()"
    CROSS_ORIGIN_OPENER_POLICY: str = "same-origin"
    CROSS_ORIGIN_RESOURCE_POLICY: str = "cross-origin"

    # Application Security Configuration (Phase 2)
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_TIER1_IP_PER_MIN: int = 10
    RATE_LIMIT_TIER2_USER_PER_MIN: int = 120
    RATE_LIMIT_TIER3_UPLOAD_PER_HR: int = 20
    RATE_LIMIT_TIER4_AI_PER_HR: int = 30
    MAX_CONCURRENT_AI_REQUESTS: int = 2

    # Upload Profile Limits
    MAX_LOGO_SIZE: int = 5 * 1024 * 1024  # 5 MB
    MAX_OCR_SIZE: int = 15 * 1024 * 1024  # 15 MB
    MAX_CSV_SIZE: int = 10 * 1024 * 1024  # 10 MB
    MAX_CSV_ROWS: int = 10000
    MAX_CSV_COLS: int = 100
    MAX_PDF_PAGES: int = 10

    # Per-Company Daily Upload Limits
    DAILY_LOGO_UPLOADS_PER_COMPANY: int = 10
    DAILY_CSV_IMPORTS_PER_COMPANY: int = 30
    DAILY_OCR_UPLOADS_PER_COMPANY: int = 300
    DAILY_AI_REQUESTS_PER_COMPANY: int = 300

    # AI Security & Limits (Phase 8)
    MAX_AI_PROMPT_LENGTH: int = 10000
    AI_MAX_CONTEXT_LENGTH: int = 50000
    AI_MAX_RESPONSE_SIZE: int = 5 * 1024 * 1024  # 5 MB
    AI_TIMEOUT_SECONDS: int = 60
    AI_ENABLE_PROMPT_INJECTION_DETECTION: bool = True
    AI_ENABLE_OUTPUT_VALIDATION: bool = True
    AI_LOG_VERBOSE: bool = False
    AI_LOG_PROMPTS_ENABLED: bool = False
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: EmailStr | None = None
    EMAILS_FROM_NAME: str | None = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    UPLOAD_DIR: str = "uploads"

    # DeepSeek AI (financial summary). Leave DEEPSEEK_API_KEY empty to disable.
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ai_summary_enabled(self) -> bool:
        return bool(self.DEEPSEEK_API_KEY)

    # CHIP Collect Payment Gateway
    CHIP_API_URL: str = "https://gate.chip-in.asia/api/v1"
    CHIP_SECRET_KEY: str = ""
    CHIP_BRAND_ID: str = ""
    CHIP_WEBHOOK_URL: str = ""
    CHIP_WEBHOOK_PUBLIC_KEY: str = ""
    APP_PUBLIC_URL: str = "http://localhost:5173"

    # Subscription Recurring Renewal & Retry Configuration
    SUBSCRIPTION_RENEWAL_MAX_ATTEMPTS: int = 3
    SUBSCRIPTION_RENEWAL_GRACE_PERIOD_DAYS: int = 3
    SUBSCRIPTION_RENEWAL_BATCH_SIZE: int = 50

    EMAIL_TEST_USER: EmailStr = "test@example.com"
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )

        return self


settings = Settings()  # type: ignore
