import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    # App
    APP_NAME: str = "AuraStream - Spotify Offline Player"
    DEBUG: bool = True
    SECRET_KEY: str = "aura-stream-super-secret-key-spotify-offline-2026"
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Spotify API / OAuth
    # The user provided key or fallback
    SPOTIFY_CLIENT_ID: str = "cEYpjA9oz9GiPac4AsH4n"
    SPOTIFY_CLIENT_SECRET: str = ""
    SPOTIFY_REDIRECT_URI: str = "http://localhost:8000/api/auth/spotify/callback"
    SPOTIFY_SCOPES: str = (
        "user-read-private user-read-email playlist-read-private "
        "playlist-read-collaborative user-library-read"
    )

    # Database: Async SQLite default with Postgres support
    DATABASE_URL: str = "sqlite+aiosqlite:///./spotify.db"
    
    # Redis (optional for local, used when configured)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Storage
    STORAGE_PATH: str = str(BASE_DIR / "storage")
    STORAGE_BACKEND: str = "local"  # "local" or "s3"
    
    # S3 (optional)
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_NAME: str = "spotify-offline-audio"
    
    # Download Queue Defaults
    DEFAULT_CONCURRENCY: int = 3
    SIMULATE_DOWNLOAD_RATE: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Ensure local storage directory exists
os.makedirs(settings.STORAGE_PATH, exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_PATH, "downloads"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_PATH, "artwork"), exist_ok=True)
