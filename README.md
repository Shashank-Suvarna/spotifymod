# AuraStream — Spotify-Style Offline Music Engine

A high-performance, full-stack engineering study project inspired by Spotify's design system, featuring an **independent per-track download queue engine**, real-time WebSockets, Spotify OAuth 2.0, storage abstraction, ID3v2 metadata embedding, and a persistent offline music player.

---

## Core Requirement: Independent Per-Track Job Architecture

A critical architectural distinction of AuraStream is that **it NEVER treats an entire playlist as a single monolithic download**. 

If a Spotify playlist contains 500 tracks, the system creates **500 distinct, isolated download jobs** in the database and queue:

```
Playlist ("500 Track Mega Playlist")
├── Track 001 ──> Download Job 001 [DOWNLOADING - 42% - 256 KB/s]
├── Track 002 ──> Download Job 002 [DOWNLOADING - 18% - 256 KB/s]
├── Track 003 ──> Download Job 003 [DOWNLOADING - 88% - 256 KB/s]
├── Track 004 ──> Download Job 004 [PENDING - Priority #4]
├── Track 005 ──> Download Job 005 [PAUSED]
└── Track 500 ──> Download Job 500 [PENDING - Priority #500]
```

### Every Track Job is Independently Controllable:
- **Download:** Start downloading any track individually directly from the playlist table or search results.
- **Pause:** Independently pause an active job mid-stream without impacting other parallel downloads.
- **Resume:** Resume any paused job back to active processing.
- **Skip:** Skip a track to immediately move to the next queued item.
- **Cancel:** Cancel a job without dropping other playlist jobs.
- **Retry:** One-click retry for failed or cancelled jobs.
- **Remove:** Remove individual jobs from the queue.
- **Play:** Directly listen to offline downloaded songs or stream previews via the persistent bottom player.
- **Reorder:** Move jobs up and down to change priority.

---

## Technology Stack

- **Frontend:**
  - [Next.js 15](https://nextjs.org/) (App Router, React 19, TypeScript)
  - [Tailwind CSS](https://tailwindcss.com/) with Spotify Dark Design System (`#000000`, `#121212`, `#181818`, `#242424`, `#FFFFFF`, `#B3B3B3`, `#1DB954`)
  - [Lucide Icons](https://lucide.dev/)
  - Custom HTML5 persistent audio player with seekbar, volume, shuffle, repeat, and queue drawer.
  - Reactive WebSocket client with auto-reconnect.

- **Backend:**
  - [FastAPI](https://fastapi.tiangolo.com/) (Python 3.13)
  - Asynchronous Database ORM with [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (AsyncPG for PostgreSQL + AioSQLite fallback)
  - Native WebSocket server broadcasting progress (`JOB_PROGRESS`), status (`JOB_STATUS_CHANGED`), and queue events.
  - Priority task worker queue engine with configurable concurrency limits.
  - Audio download & streaming layer supporting HTTP 206 Partial Content Range requests for seeking.
  - Complete ID3v2.4 tagging using `mutagen` (injecting Title, Artist, Album, Track Number, and embedding Album Art).

- **Storage Abstraction:**
  - `StorageInterface` with `LocalStorageProvider` (`storage/downloads/{artist}/{album}/{track_number} - {title}.mp3`) and cloud-ready `S3StorageProvider`.

- **Spotify Authentication & API:**
  - Spotify OAuth 2.0 Authorization Code flow with PKCE.
  - Chunked Spotify Web API pagination retrieving 500+ tracks per playlist.
  - Built-in Mock / Demo catalog fallback for instant zero-config testing.

- **Containerization:**
  - Multi-stage `Dockerfile`s for backend and frontend.
  - `docker-compose.yml` orchestrating PostgreSQL, Redis, Backend, and Frontend.

---

## Quick Start (Local Direct Mode)

### 1. Start the Backend
```bash
# From repository root:
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```
*The backend runs on `http://localhost:8000`. It automatically initializes the database, creates tables, and seeds initial Spotify playlists (including a 500-track mega playlist).*

### 2. Start the Frontend
```bash
# In a new terminal from repository root:
cd frontend
npm install
npm run dev
```
*The frontend runs on `http://localhost:3000`.*

---

## Running with Docker Compose

When Docker is installed and running:
```bash
docker compose up --build
```
This boots up:
- **Frontend:** `http://localhost:3000`
- **Backend API:** `http://localhost:8000`
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`

---

## Key Features Walkthrough

1. **Home Page:**
   - Dynamic time-based greeting ("Good afternoon, {username}").
   - Live Active Downloads banner linking to the queue.
   - Featured playlists, recently downloaded offline songs, and quick-play buttons.

2. **Paste Spotify Playlist URL Modal:**
   - Click "Paste Spotify Playlist URL" in the top header.
   - Paste any valid playlist link or use the quick **500 Track Mega Playlist** preset.
   - Paginates all tracks and allows one-click creation of $N$ independent download jobs.

3. **Playlist Details View (`/playlist/[id]`):**
   - Hero header with high-res artwork, owner, and duration.
   - "Download All" button that creates an independent job for each song.
   - Table showing Track, Artist, Album, Duration, Offline Status, Live Progress, and Per-Track Actions (Pause, Resume, Cancel, Retry, Play, Favorite).

4. **Download Queue Manager (`/queue`):**
   - Real-time aggregated statistics (active downloading, pending, overall speed in KB/s).
   - Per-job progress bars with percentage, speed, and ETA.
   - Up/Down priority reordering.
   - Bulk controls: Pause All, Resume All, Cancel All, Clear Finished.

5. **Offline Library (`/offline`):**
   - View only verified, offline downloaded songs.
   - Instant HTML5 audio playback with zero network requests.
   - Filter by artist or search title.
   - Inspect disk space usage and remove tracks from disk.

6. **Persistent Bottom Player:**
   - Album artwork, track title, artist, favorite heart.
   - Scrub bar with seekable progress, current/remaining time.
   - Play/Pause, Shuffle, Previous, Next, Repeat mode toggle.
   - Volume slider with mute and "Offline / 320kbps MP3" audio badge.

---

## Legal & Compliance Note
AuraStream complies with Spotify Developer policies and terms:
- Spotify's official Web API and OAuth 2.0 are used strictly for playlist, track, and artwork metadata.
- Spotify DRM is **never** circumvented, and protected Spotify audio streams are **never** extracted.
- Audio files are served and tagged from authorized open audio / preview stream / synthetic acoustic sources.
