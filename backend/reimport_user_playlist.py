import asyncio
import logging
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from backend.app.database import AsyncSessionLocal
from backend.app.models import Playlist, Track, PlaylistTrack, DownloadJob
from backend.app.services.spotify_service import spotify_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def reimport():
    playlist_id_str = "3NeVNY4FhQhYaPl54jfIJx"
    print(f"Fetching complete catalog for {playlist_id_str} via Spotify Pathfinder...")
    
    p_info, track_items = await spotify_service.get_playlist_metadata_and_tracks(
        playlist_id=playlist_id_str
    )
    
    print(f"Retrieved {len(track_items)} tracks for playlist")
    
    async with AsyncSessionLocal() as db:
        # Check if playlist exists
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
            playlist.owner_name = p_info.get("owner_name", playlist.owner_name)
            playlist.artwork_url = p_info.get("artwork_url") or playlist.artwork_url
            playlist.total_tracks = len(track_items)
            playlist.total_duration_ms = sum(t.get("duration_ms", 180000) for t in track_items)

        # Delete previous playlist_tracks links for this playlist
        await db.execute(delete(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id))
        
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

            pt = PlaylistTrack(
                playlist_id=playlist.id,
                track_id=t_obj.id,
                order_index=idx
            )
            db.add(pt)
            saved_tracks.append(t_obj)

        await db.commit()
        await db.refresh(playlist)
        print(f"Successfully committed all {len(saved_tracks)} tracks for playlist {playlist.id} in DB!")

if __name__ == '__main__':
    asyncio.run(reimport())
