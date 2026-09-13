import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from backend.app.config import settings
from backend.app.database import init_db, AsyncSessionLocal
from backend.app.models import Playlist, Track, PlaylistTrack, User
from backend.app.services.queue_engine import queue_engine
from backend.app.services.ws_manager import ws_manager
from backend.app.services.spotify_service import spotify_service
from backend.app.routers import auth, playlists, downloads, tracks
from sqlalchemy import select

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AuraStream")

async def seed_initial_data():
    """Seeds rich demonstration playlists if database is empty."""
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Playlist).limit(1))
        existing = res.scalar_one_or_none()
        if not existing:
            logger.info("Seeding initial Spotify-style playlists...")
            # 1. Seed Global Top Hits
            p_info, t_items = spotify_service._generate_mock_playlist("today_top_hits")
            p1 = Playlist(
                spotify_id="today_top_hits",
                title="Today's Top Hits",
                description="The hottest tracks right now. Download each track independently.",
                owner_name="Spotify Editorial",
                artwork_url="https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
                total_tracks=len(t_items[:20]),
                total_duration_ms=sum(t["duration_ms"] for t in t_items[:20])
            )
            session.add(p1)
            await session.flush()

            for idx, t_meta in enumerate(t_items[:20]):
                t_obj = Track(
                    spotify_id=t_meta["spotify_id"],
                    isrc=t_meta["isrc"],
                    title=t_meta["title"],
                    artist_name=t_meta["artist_name"],
                    album_name=t_meta["album_name"],
                    duration_ms=t_meta["duration_ms"],
                    artwork_url=t_meta["artwork_url"],
                    track_number=idx + 1
                )
                session.add(t_obj)
                await session.flush()
                pt = PlaylistTrack(playlist_id=p1.id, track_id=t_obj.id, order_index=idx)
                session.add(pt)

            # 2. Seed 500-Track Mega Playlist
            p500_info, t500_items = spotify_service._generate_mock_playlist("demo_500_track_mega_playlist")
            p2 = Playlist(
                spotify_id="demo_500_track_mega_playlist",
                title="500 Track Mega Playlist (Stress Test)",
                description="Massive 500-track playlist designed to verify 500 independent download jobs.",
                owner_name="Spotify Mega Library",
                artwork_url="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop",
                total_tracks=len(t500_items),
                total_duration_ms=sum(t["duration_ms"] for t in t500_items)
            )
            session.add(p2)
            await session.flush()

            for idx, t_meta in enumerate(t500_items):
                t_obj = Track(
                    spotify_id=t_meta["spotify_id"],
                    isrc=t_meta["isrc"],
                    title=t_meta["title"],
                    artist_name=t_meta["artist_name"],
                    album_name=t_meta["album_name"],
                    duration_ms=t_meta["duration_ms"],
                    artwork_url=t_meta["artwork_url"],
                    track_number=idx + 1
                )
                session.add(t_obj)
                await session.flush()
                pt = PlaylistTrack(playlist_id=p2.id, track_id=t_obj.id, order_index=idx)
                session.add(pt)

            # Seed default user
            u = User(
                display_name="Spotify Explorer",
                is_spotify_connected=False
            )
            session.add(u)

            await session.commit()
            logger.info("Successfully seeded demo playlists (including 500-track mega playlist)!")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    await init_db()
    await seed_initial_data()
    logger.info("Starting QueueEngine...")
    await queue_engine.start()
    yield
    # Shutdown
    logger.info("Stopping QueueEngine...")
    await queue_engine.stop()

app = FastAPI(
    title=settings.APP_NAME,
    description="Full-stack Spotify Offline Music Application with Independent Track Queue",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(playlists.router)
app.include_router(downloads.router)
app.include_router(tracks.router)

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep receiving client heartbeats or messages
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        ws_manager.disconnect(websocket)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "concurrency": queue_engine.concurrency_limit,
        "workers_active": len(queue_engine.running_jobs),
        "storage": settings.STORAGE_PATH
    }
