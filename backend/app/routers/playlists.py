import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from backend.app.database import get_db
from backend.app.models import Playlist, Track, PlaylistTrack, DownloadJob, JobStatus, User
from backend.app.schemas import (
    PlaylistResponse,
    PlaylistDetailResponse,
    TrackResponse,
    PastePlaylistRequest,
    BulkDownloadRequest
)
from backend.app.services.spotify_service import spotify_service
from backend.app.services.queue_engine import queue_engine
from backend.app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/playlists", tags=["Playlists"])

@router.get("", response_model=List[PlaylistResponse])
async def get_playlists(db: AsyncSession = Depends(get_db)):
    """Returns all imported and saved playlists."""
    stmt = select(Playlist).order_by(Playlist.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
async def get_playlist_details(playlist_id: str, db: AsyncSession = Depends(get_db)):
    """Returns playlist details along with all tracks and their offline / download job status."""
    stmt = (
        select(Playlist)
        .options(
            selectinload(Playlist.tracks_assoc)
            .selectinload(PlaylistTrack.track)
            .selectinload(Track.download_jobs)
        )
        .where(Playlist.id == playlist_id)
    )
    res = await db.execute(stmt)
    playlist = res.scalar_one_or_none()

    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    tracks_output: List[TrackResponse] = []
    for pt in playlist.tracks_assoc:
        if not pt.track:
            continue
        t = pt.track
        # Find active job if any
        active_job = None
        for j in t.download_jobs:
            if j.status in [JobStatus.PENDING, JobStatus.DOWNLOADING, JobStatus.PAUSED]:
                active_job = j
                break

        t_dict = {
            "id": t.id,
            "spotify_id": t.spotify_id,
            "isrc": t.isrc,
            "title": t.title,
            "artist_name": t.artist_name,
            "album_name": t.album_name,
            "duration_ms": t.duration_ms,
            "artwork_url": t.artwork_url,
            "preview_url": t.preview_url,
            "track_number": pt.order_index + 1,
            "is_offline": t.is_offline,
            "local_file_path": t.local_file_path,
            "file_size_bytes": t.file_size_bytes,
            "audio_format": t.audio_format,
            "bitrate_kbps": t.bitrate_kbps,
            "is_favorite": t.is_favorite,
            "created_at": t.created_at,
            "active_job_status": active_job.status.value if active_job else None,
            "active_job_id": active_job.id if active_job else None,
            "download_progress": active_job.progress_percent if active_job else (100.0 if t.is_offline else 0.0)
        }
        tracks_output.append(TrackResponse(**t_dict))

    p_dict = {
        "id": playlist.id,
        "spotify_id": playlist.spotify_id,
        "title": playlist.title,
        "description": playlist.description,
        "owner_name": playlist.owner_name,
        "artwork_url": playlist.artwork_url,
        "total_tracks": len(tracks_output),
        "total_duration_ms": sum(t.duration_ms for t in tracks_output),
        "is_local": playlist.is_local,
        "created_at": playlist.created_at,
        "updated_at": playlist.updated_at,
        "tracks": tracks_output
    }
    return PlaylistDetailResponse(**p_dict)

@router.post("/import", response_model=PlaylistDetailResponse)
async def import_playlist_url(payload: PastePlaylistRequest, db: AsyncSession = Depends(get_db)):
    """
    Pastes Spotify Playlist URL, extracts ID, paginates all tracks from Spotify API,
    and stores metadata into PostgreSQL / SQLite.
    """
    playlist_id_str, entity_type = spotify_service.parse_playlist_id(payload.url_or_id)
    if not playlist_id_str:
        raise HTTPException(status_code=400, detail="Invalid Spotify playlist URL or ID")

    # Fetch user token if available
    user_stmt = select(User).where(User.is_spotify_connected == True).order_by(User.created_at.desc()).limit(1)
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    access_token = user.access_token if user else None

    # Fetch paginated metadata and tracks
    p_info, track_items = await spotify_service.get_playlist_metadata_and_tracks(
        playlist_id=playlist_id_str,
        access_token=access_token
    )

    # Check if playlist already exists
    p_stmt = select(Playlist).where(Playlist.spotify_id == playlist_id_str)
    p_res = await db.execute(p_stmt)
    playlist = p_res.scalar_one_or_none()

    if not playlist:
        playlist = Playlist(
            spotify_id=playlist_id_str,
            title=p_info["title"],
            description=p_info.get("description", ""),
            owner_name=p_info.get("owner_name", "Spotify User"),
            artwork_url=p_info.get("artwork_url"),
            total_tracks=len(track_items),
            total_duration_ms=sum(t.get("duration_ms", 180000) for t in track_items)
        )
        db.add(playlist)
        await db.flush()
    else:
        playlist.title = p_info["title"]
        playlist.description = p_info.get("description", "")
        playlist.artwork_url = p_info.get("artwork_url") or playlist.artwork_url
        playlist.total_tracks = len(track_items)
        playlist.total_duration_ms = sum(t.get("duration_ms", 180000) for t in track_items)

    # Clean existing tracks assoc for this playlist if updating
    await db.execute(delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id))

    # Process and link tracks
    saved_tracks = []
    for idx, t_meta in enumerate(track_items):
        spot_id = t_meta.get("spotify_id")
        t_obj = None
        if spot_id:
            t_res = await db.execute(select(Track).where(Track.spotify_id == spot_id))
            t_obj = t_res.scalar_one_or_none()

        if not t_obj:
            t_obj = Track(
                spotify_id=spot_id,
                isrc=t_meta.get("isrc"),
                title=t_meta["title"],
                artist_name=t_meta["artist_name"],
                album_name=t_meta.get("album_name", "Single"),
                duration_ms=t_meta.get("duration_ms", 180000),
                artwork_url=t_meta.get("artwork_url") or playlist.artwork_url,
                preview_url=t_meta.get("preview_url"),
                track_number=idx + 1
            )
            db.add(t_obj)
            await db.flush()

        # Link in playlist_tracks
        pt = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=t_obj.id,
            order_index=idx
        )
        db.add(pt)
        saved_tracks.append(t_obj)

    await db.commit()
    await db.refresh(playlist)

    # Broadcast event
    await ws_manager.broadcast("PLAYLIST_IMPORTED", {
        "playlist_id": playlist.id,
        "title": playlist.title,
        "track_count": len(saved_tracks)
    })

    return await get_playlist_details(playlist.id, db)

@router.post("/{playlist_id}/enqueue")
async def enqueue_playlist_tracks(
    playlist_id: str,
    payload: Optional[BulkDownloadRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    CORE REQUIREMENT:
    Creates N independent download jobs for N tracks in the playlist.
    Each track gets its own independent DownloadJob record.
    """
    stmt = (
        select(Playlist)
        .options(
            selectinload(Playlist.tracks_assoc)
            .selectinload(PlaylistTrack.track)
        )
        .where(Playlist.id == playlist_id)
    )
    res = await db.execute(stmt)
    playlist = res.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    selected_track_ids = set(payload.track_ids) if payload and payload.track_ids else None
    
    created_jobs = []
    for idx, pt in enumerate(playlist.tracks_assoc):
        if not pt.track:
            continue
        track = pt.track
        if selected_track_ids and track.id not in selected_track_ids:
            continue

        # Check if active job already exists
        job_stmt = select(DownloadJob).where(
            DownloadJob.track_id == track.id,
            DownloadJob.status.in_([JobStatus.PENDING, JobStatus.DOWNLOADING])
        )
        job_res = await db.execute(job_stmt)
        existing_job = job_res.scalar_one_or_none()
        if existing_job:
            continue

        # Create INDEPENDENT job for this specific track
        job = DownloadJob(
            track_id=track.id,
            playlist_id=playlist.id,
            status=JobStatus.PENDING,
            priority=idx + 1
        )
        db.add(job)
        created_jobs.append(job)

    await db.commit()
    
    # Notify queue engine to wake up worker threads
    queue_engine.notify_new_job()

    await ws_manager.broadcast("JOBS_ENQUEUED", {
        "playlist_id": playlist.id,
        "jobs_count": len(created_jobs)
    })

    return {
        "status": "success",
        "playlist_id": playlist.id,
        "enqueued_count": len(created_jobs),
        "message": f"Created {len(created_jobs)} independent track download jobs."
    }

@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: str, db: AsyncSession = Depends(get_db)):
    """Deletes a playlist."""
    stmt = select(Playlist).where(Playlist.id == playlist_id)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.delete(p)
    await db.commit()
    return {"status": "deleted", "id": playlist_id}
