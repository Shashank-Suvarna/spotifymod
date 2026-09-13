export type JobStatus =
  | "PENDING"
  | "DOWNLOADING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "SKIPPED";

export interface Track {
  id: string;
  spotify_id?: string;
  isrc?: string;
  title: string;
  artist_name: string;
  album_name: string;
  duration_ms: number;
  artwork_url?: string;
  preview_url?: string;
  track_number: number;
  is_offline: boolean;
  local_file_path?: string;
  file_size_bytes: number;
  audio_format: string;
  bitrate_kbps: number;
  is_favorite: boolean;
  created_at: string;
  active_job_status?: JobStatus;
  active_job_id?: string;
  download_progress?: number;
}

export interface Playlist {
  id: string;
  spotify_id?: string;
  title: string;
  description: string;
  owner_name: string;
  artwork_url?: string;
  total_tracks: number;
  total_duration_ms: number;
  is_local: boolean;
  created_at: string;
  updated_at: string;
  tracks?: Track[];
}

export interface DownloadJob {
  id: string;
  track_id: string;
  playlist_id?: string;
  status: JobStatus;
  progress_percent: number;
  bytes_downloaded: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
  eta_seconds: number;
  error_message?: string;
  priority: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  track?: Track;
}

export interface QueueSummary {
  total_jobs: number;
  pending_jobs: number;
  downloading_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  paused_jobs: number;
  total_bytes_downloaded: number;
  overall_speed_bytes_sec: number;
  concurrency_limit: number;
}

export interface UserProfile {
  id: string;
  spotify_id?: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  is_spotify_connected: boolean;
}

export interface SearchResult {
  query: string;
  playlists: Playlist[];
  tracks: Track[];
}
