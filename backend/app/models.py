import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Table, Text, Enum
)
from sqlalchemy.orm import relationship
from backend.app.database import Base

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    DOWNLOADING = "DOWNLOADING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    SKIPPED = "SKIPPED"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_id = Column(String(128), unique=True, index=True, nullable=True)
    display_name = Column(String(255), default="Guest Music Enthusiast")
    email = Column(String(255), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    is_spotify_connected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    playlist_id = Column(String(36), ForeignKey("playlists.id", ondelete="CASCADE"), index=True)
    track_id = Column(String(36), ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    order_index = Column(Integer, default=0)

    playlist = relationship("Playlist", back_populates="tracks_assoc")
    track = relationship("Track", back_populates="playlists_assoc")

class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_id = Column(String(128), unique=True, index=True, nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    owner_name = Column(String(255), default="Spotify User")
    artwork_url = Column(String(512), nullable=True)
    total_tracks = Column(Integer, default=0)
    total_duration_ms = Column(Integer, default=0)
    is_local = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tracks_assoc = relationship(
        "PlaylistTrack",
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="PlaylistTrack.order_index"
    )

class Track(Base):
    __tablename__ = "tracks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_id = Column(String(128), unique=True, index=True, nullable=True)
    isrc = Column(String(64), nullable=True)
    title = Column(String(255), nullable=False)
    artist_name = Column(String(255), nullable=False)
    album_name = Column(String(255), default="Single")
    duration_ms = Column(Integer, default=180000)
    artwork_url = Column(String(512), nullable=True)
    preview_url = Column(String(512), nullable=True)
    track_number = Column(Integer, default=1)
    
    # Offline and local storage fields
    is_offline = Column(Boolean, default=False)
    local_file_path = Column(String(512), nullable=True)
    file_size_bytes = Column(Integer, default=0)
    audio_format = Column(String(16), default="mp3")
    bitrate_kbps = Column(Integer, default=320)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    playlists_assoc = relationship("PlaylistTrack", back_populates="track", cascade="all, delete-orphan")
    download_jobs = relationship("DownloadJob", back_populates="track", cascade="all, delete-orphan")

class DownloadJob(Base):
    __tablename__ = "download_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    track_id = Column(String(36), ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    playlist_id = Column(String(36), ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True)
    
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, index=True)
    progress_percent = Column(Float, default=0.0)
    bytes_downloaded = Column(Integer, default=0)
    total_bytes = Column(Integer, default=0)
    speed_bytes_per_sec = Column(Float, default=0.0)
    eta_seconds = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    priority = Column(Integer, default=100)  # Lower is higher priority or sequential order

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    track = relationship("Track", back_populates="download_jobs")
    playlist = relationship("Playlist")

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    concurrency_limit = Column(Integer, default=3)
    storage_path = Column(String(512), default="storage/downloads")
    audio_quality = Column(String(32), default="320kbps MP3")
    auto_download_favorites = Column(Boolean, default=False)
