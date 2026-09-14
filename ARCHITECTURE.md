# AuraStream — Complete System Architecture & AI Technical Reference

> **AI AGENT DIRECTIVE:** Read this file to understand the architecture, database schema, background worker queues, API endpoints, WebSocket events, and frontend state management of AuraStream without needing to scan individual codebase files.

---

## 1. Executive Summary & Core Architectural Paradigm

AuraStream is a full-stack Spotify-style music application built with Next.js 15, FastAPI (Python 3.13), Async SQLAlchemy 2.0, PostgreSQL/SQLite, and WebSockets.

### The Independent Per-Track Job Principle

Unlike standard downloaders that process a playlist as a single blocking batch, AuraStream enforces **Independent Per-Track Isolation**:
1. When a user imports a playlist of $N$ tracks (e.g. 500 songs), the system generates $N$ discrete `DownloadJob` records in the database.
2. Every track job is an independent state machine (`PENDING`, `DOWNLOADING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`, `SKIPPED`).
3. Each track job can be paused, resumed, skipped, cancelled, retried, or reordered individually without affecting other queue tasks.
4. Concurrent downloads are managed by an asynchronous background worker pool controlled by `QueueEngine`.

---

## 2. Directory & Module Index

```
spotify/
├── ARCHITECTURE.md              # Master AI & Engineering Architectural Reference
├── README.md                    # Quick Start & High-level overview
├── docker-compose.yml           # Orchestrates PostgreSQL, Redis, Backend, Frontend
├── .env.example                 # Environment configuration template
├── storage/                     # Default local media root
│   ├── downloads/               # Output structure: {artist}/{album}/{track_number} - {title}.mp3
│   └── artwork/                 # Cached album covers
│
├── backend/                     # Python 3.13 FastAPI Backend
│   ├── Dockerfile               # Backend containerization
│   ├── requirements.txt         # FastAPI, SQLAlchemy, httpx, mutagen, yt-dlp, pyotp, etc.
│   └── app/
│       ├── main.py              # Application lifecycle, CORS, static files, WebSocket endpoint, data seeder
│       ├── config.py            # Pydantic BaseSettings (DB URL, Storage paths, Spotify API keys)
│       ├── database.py          # Async SQLAlchemy engine & AsyncSessionLocal provider
│       ├── models.py            # SQLAlchemy ORM models (User, Playlist, Track, PlaylistTrack, DownloadJob, UserSettings)
│       ├── schemas.py           # Pydantic v2 schemas for REST request/response validation
│       ├── storage.py           # Storage abstraction (StorageInterface, LocalStorageProvider, S3StorageProvider)
│       ├── routers/
│       │   ├── auth.py          # Spotify OAuth 2.0 PKCE, profile retrieval, demo login
│       │   ├── playlists.py     # Playlist metadata fetching, URL import, pagination, enqueueing
│       │   ├── downloads.py     # Download queue management, per-job controls, bulk actions, queue settings
│       │   └── tracks.py        # Offline library, HTTP 206 range audio streaming, search, favorite toggle
│       └── services/
│           ├── queue_engine.py  # Async worker pool, priority scheduling, job control state machine
│           ├── audio_service.py # Audio fetching via yt-dlp, Mutagen ID3v2/M4A metadata & cover art tagging
│           ├── spotify_service.py # Pathfinder GraphQL API pagination (500+ tracks), TOTP generator, embed parser
│           └── ws_manager.py    # WebSocket connection manager & JSON event broadcaster
│
└── frontend/                    # Next.js 15 (App Router, React 19, TypeScript)
    ├── Dockerfile               # Multi-stage Next.js Docker build
    ├── package.json             # Lucide React, Tailwind CSS, TypeScript dependencies
    ├── tailwind.config.ts       # Spotify dark palette (#000000, #121212, #181818, #1DB954)
    └── src/
        ├── app/
        │   ├── layout.tsx       # Root layout wrapping Persistent Audio Player & Navigation Sidebar
        │   ├── page.tsx         # Home page (Greeting, live download banner, featured playlists)
        │   ├── playlist/[id]/   # Playlist details view (Hero header, table, Download All, per-track actions)
        │   ├── queue/           # Real-time Download Queue Manager (progress bars, speed, reorder, bulk actions)
        │   ├── offline/         # Offline Library (Instant HTML5 playback, storage stats, track deletion)
        │   ├── search/          # Universal catalog search view
        │   └── settings/        # App configuration (concurrency limit, storage path)
        ├── components/
        │   ├── Header.tsx / MobileHeader.tsx        # Top navigation & Paste Playlist URL trigger
        │   ├── Sidebar.tsx / MobileBottomNav.tsx    # Left sidebar navigation links
        │   ├── Player.tsx / MobilePlayer.tsx        # Persistent bottom HTML5 audio player
        │   └── PastePlaylistModal.tsx               # Modal for importing Spotify playlists or demo mega list
        ├── hooks/
        │   ├── useAudioPlayer.tsx # Global audio player state & HTML5 Audio element binder
        │   ├── useWebSocket.ts   # Auto-reconnecting WebSocket client handling live queue progress
        │   └── useNetworkStatus.ts # Online/Offline network status listener
        ├── lib/
        │   ├── api.ts           # Centralized HTTP & WebSocket API client
        │   └── storage.ts       # Client-side IndexedDB engine (tracks, audioBlobs, playbackPositions)
        └── types/
            └── index.ts         # Shared TypeScript interfaces (Track, Playlist, DownloadJob, QueueSummary)
```

---

## 3. Database Schema & Data Models

### Entity Relationship Diagram (ERD)

```
+------------------------------------+          +------------------------------------+
|                User                |          |              Playlist              |
+------------------------------------+          +------------------------------------+
| id (PK, String36)                  |          | id (PK, String36)                  |
| spotify_id (String128, Unique)     |          | spotify_id (String128, Unique)     |
| display_name (String255)           |          | title (String255)                  |
| email (String255)                  |          | description (Text)                 |
| avatar_url (String512)             |          | owner_name (String255)             |
| access_token (Text)                |          | artwork_url (String512)            |
| refresh_token (Text)               |          | total_tracks (Integer)             |
| token_expires_at (DateTime)        |          | total_duration_ms (Integer)        |
| is_spotify_connected (Boolean)     |          | is_local (Boolean)                 |
| created_at (DateTime)              |          | created_at, updated_at (DateTime)  |
+------------------------------------+          +------------------------------------+
                                                           ^
                                                           | 1
                                                           |
                                                           | N
                                                +--------------------+
                                                |   PlaylistTrack    |
                                                +--------------------+
                                                | id (PK, String36)  |
                                                | playlist_id (FK)   |
                                                | track_id (FK)      |
                                                | order_index (Int)  |
                                                +--------------------+
                                                           | N
                                                           |
                                                           | 1
                                                           v
+------------------------------------+          +------------------------------------+
|            DownloadJob             |          |               Track                |
+------------------------------------+          +------------------------------------+
| id (PK, String36)                  |          | id (PK, String36)                  |
| track_id (FK -> Track.id)          |--------->| spotify_id (String128, Unique)     |
| playlist_id (FK -> Playlist.id)    |          | isrc (String64)                    |
| status (Enum JobStatus)            |          | title (String255)                  |
| progress_percent (Float)           |          | artist_name (String255)            |
| bytes_downloaded (Integer)         |          | album_name (String255)             |
| total_bytes (Integer)              |          | duration_ms (Integer)              |
| speed_bytes_per_sec (Float)        |          | artwork_url (String512)            |
| eta_seconds (Integer)              |          | preview_url (String512)            |
| error_message (Text)               |          | track_number (Integer)             |
| priority (Integer)                 |          | is_offline (Boolean)               |
| created_at, started_at, completed  |          | local_file_path (String512)        |
+------------------------------------+          | file_size_bytes, bitrate_kbps      |
                                                | is_favorite (Boolean)              |
                                                | created_at (DateTime)              |
                                                +------------------------------------+
```

### Job Status Enum Machine
- `PENDING`: Job registered in database, waiting for worker slot.
- `DOWNLOADING`: Worker task actively acquiring stream & writing to disk.
- `PAUSED`: User paused download mid-stream; worker slot freed.
- `COMPLETED`: Audio downloaded, ID3 tagged, track marked `is_offline = True`.
- `FAILED`: Failure recorded with `error_message`; ready for one-click retry.
- `CANCELLED`: Cancelled by user action.
- `SKIPPED`: User bypassed current item to let queued items process.

---

## 4. Subsystem Architectures

### A. Queue Engine Subsystem (`backend/app/services/queue_engine.py`)
- Maintains an internal loop running up to `concurrency_limit` concurrent worker tasks.
- `_acquire_next_job()` uses an atomic SQL `SELECT ... WHERE status = 'PENDING' ORDER BY priority ASC, created_at ASC LIMIT 1` query to grab jobs.
- Progress updates are emitted to WebSockets via `progress_callback` throttled to ~250ms intervals.
- Supports per-job actions: `pause_job`, `resume_job`, `cancel_job`, `skip_job`, `retry_job`, `remove_job`, `reorder_jobs`.
- Supports bulk operations: `pause_all`, `resume_all`, `cancel_all`, `clear_completed`.

### B. Audio & Metadata Engine (`backend/app/services/audio_service.py`)
- **Full Song Download (`yt-dlp`)**: Searches full audio stream (`ytsearch1:{artist} {title} audio`) preferring native M4A/AAC (`format: 140/bestaudio`). Does NOT rely on ffmpeg binaries for conversion.
- **HTTP 206 Streaming Proxy (`routers/tracks.py`)**: Streams direct audio using Range headers. If a track is played before downloading, the backend proxies the live audio stream while launching a background task (`bg_download`) to cache it for offline use.
- **ID3 & MP4 Metadata Tagging**: Uses `mutagen` to inject:
  - `TIT2` / `\xa9nam`: Track Title
  - `TPE1` / `\xa9ART`: Artist Name
  - `TALB` / `\xa9alb`: Album Name
  - `TRCK` / `trkn`: Track Number
  - `APIC` / `covr`: High-Res Album Cover Art
- **Synthetic Fallback**: Generates valid MPEG-1 Layer 3 frames via mathematical sine wave generation if external network lookups are unavailable, ensuring zero server crashes.

### C. Spotify API & Pathfinder Pagination (`backend/app/services/spotify_service.py`)
- **Spotify Partner Pathfinder API**: Fetches playlists containing 500+ tracks using Spotify web client tokens and a dynamic TOTP calculation algorithm (`pyotp` secret transformation).
- **Public Embed Parser**: Fallback scraper extracting JSON state from `https://open.spotify.com/embed/playlist/{id}`.
- **Official Spotify Web API**: Authorization Code Flow with PKCE support for authenticated user accounts.
- **500-Track Mock Catalog Generator**: Built-in realistic catalog generator for immediate local offline testing.

### D. WebSocket Protocol (`backend/app/services/ws_manager.py`)
Clients connect to `/ws`. Payload format:
```json
{
  "type": "EVENT_TYPE",
  "data": { ... },
  "timestamp": 1726315200.0
}
```
**Broadcast Event Types:**
1. `JOB_STATUS_CHANGED`: Payload `{ "job_id": "...", "status": "DOWNLOADING"|"COMPLETED"|"PAUSED"|"CANCELLED" }`
2. `JOB_PROGRESS`: Payload `{ "job_id": "...", "progress_percent": 45.2, "speed_bytes_per_sec": 262144.0, "eta_seconds": 12 }`
3. `JOB_REMOVED`: Payload `{ "job_id": "..." }`
4. `QUEUE_REORDERED`: Payload `{ "job_ids": ["id1", "id2", ...] }`
5. `QUEUE_BULK_ACTION`: Payload `{ "action": "PAUSE_ALL"|"RESUME_ALL"|"CANCEL_ALL"|"CLEAR_COMPLETED" }`
6. `PLAYLIST_IMPORTED`: Payload `{ "playlist_id": "...", "title": "...", "track_count": 500 }`
7. `JOBS_ENQUEUED`: Payload `{ "playlist_id": "...", "jobs_count": 500 }`

---

## 5. Complete REST API Catalog

### Auth Router (`/api/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/spotify/login` | Returns Spotify OAuth 2.0 authorization URL |
| `GET` | `/api/auth/spotify/callback` | OAuth redirect callback; stores access/refresh tokens |
| `GET` | `/api/auth/me` | Returns current user profile |
| `POST` | `/api/auth/demo-login` | Instantly logs in demo user account |
| `POST` | `/api/auth/disconnect` | Disconnects Spotify connection |

### Playlists Router (`/api/playlists`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/playlists` | List all saved playlists |
| `GET` | `/api/playlists/{id}` | Get playlist details with all tracks & download statuses |
| `POST` | `/api/playlists/import` | Import Spotify Playlist URL / URI (paginates all tracks) |
| `POST` | `/api/playlists/{id}/enqueue` | Enqueue N independent download jobs for tracks |
| `DELETE` | `/api/playlists/{id}` | Delete playlist |

### Downloads Queue Router (`/api/downloads`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/downloads/queue` | List all download jobs in priority order |
| `GET` | `/api/downloads/summary` | Real-time queue metrics (active, pending, speed) |
| `POST` | `/api/downloads/track/{track_id}/start` | Enqueue individual track job |
| `POST` | `/api/downloads/{job_id}/action` | Trigger per-job action (`pause`, `resume`, `cancel`, `skip`, `retry`, `remove`) |
| `POST` | `/api/downloads/reorder` | Update priority list of queued jobs |
| `POST` | `/api/downloads/bulk/{action}` | Trigger bulk action (`pause-all`, `resume-all`, `cancel-all`, `clear-completed`) |
| `PUT` | `/api/downloads/settings` | Update queue settings (e.g. concurrency limit) |

### Tracks & Audio Router (`/api/tracks`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tracks/offline` | List all downloaded offline tracks |
| `GET` | `/api/tracks/{track_id}/stream` | Stream audio supporting HTTP 206 Range requests |
| `POST` | `/api/tracks/{track_id}/favorite` | Toggle track favorite state |
| `DELETE` | `/api/tracks/{track_id}/offline` | Remove local offline audio file from disk |
| `GET` | `/api/search` | Search playlists and tracks |

---

## 6. Frontend Client & Storage Architecture

### Browser Storage (`frontend/src/lib/storage.ts`)
Uses IndexedDB (`aura_stream_db` version 1) with object stores:
- `tracks`: Track metadata indexed by `title`, `artist_name`, `is_offline`.
- `playlists`: Playlist objects.
- `audioBlobs`: Binary Audio `Blob` objects for true browser-offline playback when backend server is unreachable.
- `playbackPositions`: Saved track progress position.
- `downloadJobs`: Local mirror of queue job states.

### Key Custom Hooks
1. `useAudioPlayer`: Manages single HTML5 `<audio>` element, queue state, shuffle mode, repeat mode, seekbar position, volume, and automatic next track transition.
2. `useWebSocket`: Opens persistent WebSocket connection to `/ws`, auto-reconnects, and dispatches state updates on `JOB_PROGRESS` and `JOB_STATUS_CHANGED`.
3. `useNetworkStatus`: Monitors browser online/offline status to trigger fallback to IndexedDB cached audio blobs.

---

## 7. Execution Commands Quick Reference

### Running Locally
```bash
# Backend (Port 8000)
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --port 8000

# Frontend (Port 3000)
cd frontend
npm install
npm run dev
```

### Running with Docker Compose
```bash
docker compose up --build
```
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/docs
