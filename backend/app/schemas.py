from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime
from backend.app.models import JobStatus

class TrackBase(BaseModel):
    title: str
    artist_name: str
    album_name: str = "Single"
    duration_ms: int = 180000
    artwork_url: Optional[str] = None
    preview_url: Optional[str] = None
    track_number: int = 1
    spotify_id: Optional[str] = None
    isrc: Optional[str] = None

class TrackResponse(TrackBase):
    id: str
    is_offline: bool = False
    local_file_path: Optional[str] = None
    file_size_bytes: int = 0
    audio_format: str = "mp3"
    bitrate_kbps: int = 320
    is_favorite: bool = False
    created_at: datetime
    active_job_status: Optional[str] = None
    active_job_id: Optional[str] = None
    download_progress: Optional[float] = None

    class Config:
        from_attributes = True

class PlaylistBase(BaseModel):
    title: str
    description: Optional[str] = ""
    owner_name: str = "Spotify User"
    artwork_url: Optional[str] = None
    spotify_id: Optional[str] = None

class PlaylistResponse(PlaylistBase):
    id: str
    total_tracks: int = 0
    total_duration_ms: int = 0
    is_local: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PlaylistDetailResponse(PlaylistResponse):
    tracks: List[TrackResponse] = []

class DownloadJobResponse(BaseModel):
    id: str
    track_id: str
    playlist_id: Optional[str] = None
    status: JobStatus
    progress_percent: float = 0.0
    bytes_downloaded: int = 0
    total_bytes: int = 0
    speed_bytes_per_sec: float = 0.0
    eta_seconds: int = 0
    error_message: Optional[str] = None
    priority: int = 100
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    track: Optional[TrackResponse] = None

    class Config:
        from_attributes = True

class QueueSummaryResponse(BaseModel):
    total_jobs: int
    pending_jobs: int
    downloading_jobs: int
    completed_jobs: int
    failed_jobs: int
    paused_jobs: int
    total_bytes_downloaded: int
    overall_speed_bytes_sec: float
    concurrency_limit: int

class JobControlRequest(BaseModel):
    action: str  # "pause", "resume", "cancel", "retry", "remove"

class JobReorderRequest(BaseModel):
    job_ids: List[str]

class BulkDownloadRequest(BaseModel):
    track_ids: Optional[List[str]] = None  # None = download all in playlist
    playlist_id: Optional[str] = None

class PastePlaylistRequest(BaseModel):
    url_or_id: str

class UserProfileResponse(BaseModel):
    id: str
    spotify_id: Optional[str] = None
    display_name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_spotify_connected: bool = False

    class Config:
        from_attributes = True

class SettingsUpdate(BaseModel):
    concurrency_limit: Optional[int] = Field(default=3, ge=1, le=10)
    audio_quality: Optional[str] = "320kbps MP3"
    auto_download_favorites: Optional[bool] = False
    spotify_client_id: Optional[str] = None
    spotify_client_secret: Optional[str] = None

class SearchResultResponse(BaseModel):
    query: str
    playlists: List[PlaylistResponse] = []
    tracks: List[TrackResponse] = []
