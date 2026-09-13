import {
  Playlist,
  Track,
  DownloadJob,
  QueueSummary,
  UserProfile,
  SearchResult,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errData.detail || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStreamUrl: (trackId: string) => `${API_BASE}/api/tracks/${trackId}/stream`,
  getWsUrl: () => {
    return API_BASE.replace(/^http/, "ws") + "/ws";
  },

  // Playlists
  getPlaylists: () => fetchJson<Playlist[]>("/api/playlists"),
  getPlaylist: (id: string) => fetchJson<Playlist>(`/api/playlists/${id}`),
  importPlaylist: (urlOrId: string) =>
    fetchJson<Playlist>("/api/playlists/import", {
      method: "POST",
      body: JSON.stringify({ url_or_id: urlOrId }),
    }),
  enqueuePlaylist: (playlistId: string, trackIds?: string[]) =>
    fetchJson<{ status: string; enqueued_count: number; message: string }>(
      `/api/playlists/${playlistId}/enqueue`,
      {
        method: "POST",
        body: JSON.stringify({ track_ids: trackIds, playlist_id: playlistId }),
      }
    ),
  deletePlaylist: (id: string) =>
    fetchJson<{ status: string }>(`/api/playlists/${id}`, { method: "DELETE" }),

  // Downloads & Queue
  getQueue: () => fetchJson<DownloadJob[]>("/api/downloads/queue"),
  getQueueSummary: () => fetchJson<QueueSummary>("/api/downloads/summary"),
  startTrackDownload: (trackId: string) =>
    fetchJson<{ status: string; job_id: string }>(
      `/api/downloads/track/${trackId}/start`,
      { method: "POST" }
    ),
  controlJob: (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "skip" | "retry" | "remove"
  ) =>
    fetchJson<{ status: string }>(`/api/downloads/${jobId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  reorderQueue: (jobIds: string[]) =>
    fetchJson<{ status: string; count: number }>("/api/downloads/reorder", {
      method: "POST",
      body: JSON.stringify({ job_ids: jobIds }),
    }),
  bulkControl: (
    action: "pause-all" | "resume-all" | "cancel-all" | "clear-completed"
  ) =>
    fetchJson<{ status: string }>(`/api/downloads/bulk/${action}`, {
      method: "POST",
    }),
  updateSettings: (settings: { concurrency_limit?: number; audio_quality?: string }) =>
    fetchJson<{ status: string; concurrency: number }>("/api/downloads/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Tracks & Library
  getOfflineTracks: (query?: string, artist?: string) => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (artist) params.set("artist", artist);
    return fetchJson<Track[]>(`/api/tracks/offline?${params.toString()}`);
  },
  toggleFavorite: (trackId: string) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `/api/tracks/${trackId}/favorite`,
      { method: "POST" }
    ),
  deleteOfflineTrack: (trackId: string) =>
    fetchJson<{ status: string }>(`/api/tracks/${trackId}/offline`, {
      method: "DELETE",
    }),
  search: (q: string) =>
    fetchJson<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`),

  // Auth
  getUserProfile: () => fetchJson<UserProfile>("/api/auth/me"),
  demoLogin: () =>
    fetchJson<UserProfile>("/api/auth/demo-login", { method: "POST" }),
  disconnectSpotify: () =>
    fetchJson<UserProfile>("/api/auth/disconnect", { method: "POST" }),
  getSpotifyLoginUrl: () =>
    fetchJson<{ auth_url: string }>("/api/auth/spotify/login"),
};
