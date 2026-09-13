"use client";

import React, { useEffect, useState } from "react";
import {
  HardDrive,
  Play,
  Pause,
  Trash2,
  Heart,
  Search,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { api } from "@/lib/api";
import { Track } from "@/types";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { localMusicStorage } from "@/lib/storage";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function OfflinePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [artistFilter, setArtistFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioPlayer();

  const loadOfflineTracks = async () => {
    try {
      const data = await api.getOfflineTracks();
      setTracks(data);
      // Synchronize metadata into local IndexedDB
      for (const t of data) {
        localMusicStorage.saveTrack(t).catch(() => {});
      }
    } catch (e) {
      console.warn("Failed loading offline tracks from server, falling back to local storage:", e);
      const localTracks = await localMusicStorage.getAllTracks();
      setTracks(localTracks);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOfflineTracks();
  }, []);

  const handleDeleteOffline = async (trackId: string) => {
    if (!confirm("Are you sure you want to delete this track from offline storage?")) {
      return;
    }
    try {
      await api.deleteOfflineTrack(trackId).catch(() => {});
      await localMusicStorage.deleteTrack(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleFavoriteToggle = async (track: Track) => {
    try {
      await api.toggleFavorite(track.id);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, is_favorite: !t.is_favorite } : t
        )
      );
    } catch (e) {
      console.warn(e);
    }
  };

  const artists = Array.from(new Set(tracks.map((t) => t.artist_name)));

  const filteredTracks = tracks.filter((t) => {
    const matchesQuery =
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.artist_name.toLowerCase().includes(query.toLowerCase()) ||
      t.album_name.toLowerCase().includes(query.toLowerCase());
    const matchesArtist =
      artistFilter === "all" || t.artist_name === artistFilter;
    return matchesQuery && matchesArtist;
  });

  const totalBytes = tracks.reduce(
    (acc, t) => acc + (t.file_size_bytes || 3 * 1024 * 1024),
    0
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-4 flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="glass-surface-primary rounded-[22px] border border-white/[0.08] p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-glass">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shadow-glow-subtle">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Offline Library
            </h1>
            <p className="text-xs text-white/50 mt-0.5">
              Downloaded audio files with embedded ID3v2 tags. 100% playable offline.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs">
          <div className="bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.08]">
            <div className="text-white/40 text-[10px] uppercase font-semibold">Offline Songs</div>
            <div className="text-accent font-bold text-sm mt-0.5">
              {tracks.length} tracks
            </div>
          </div>

          <div className="bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.08]">
            <div className="text-white/40 text-[10px] uppercase font-semibold">Storage Used</div>
            <div className="text-white font-bold text-sm mt-0.5">
              {formatBytes(totalBytes)}
            </div>
          </div>

          {tracks.length > 0 && (
            <button
              onClick={() => playTrack(tracks[0], tracks)}
              className="bg-accent hover:bg-accent-hover text-black font-bold px-4 py-2 rounded-full transition-all shadow-glow-btn flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Play All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search offline tracks..."
            className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 pl-9 pr-4 py-2 rounded-full border border-white/[0.08] focus:border-accent/50 focus:outline-none transition-all"
          />
        </div>

        {/* Artist Filter Dropdown */}
        {artists.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-white/50 self-end sm:self-center">
            <Filter className="w-3 h-3 text-white/40" />
            <span>Artist:</span>
            <select
              value={artistFilter}
              onChange={(e) => setArtistFilter(e.target.value)}
              className="bg-white/[0.04] text-white text-xs border border-white/[0.08] rounded-full px-3 py-1.5 focus:border-accent focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#121212]">All Artists ({tracks.length})</option>
              {artists.map((art) => (
                <option key={art} value={art} className="bg-[#121212]">
                  {art}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Offline Tracks Grid */}
      {filteredTracks.length === 0 ? (
        <div className="glass-surface-subtle border border-white/[0.08] rounded-[22px] p-12 text-center flex flex-col items-center justify-center gap-3">
          <HardDrive className="w-12 h-12 text-white/20" />
          <h3 className="font-bold text-base text-white">Your offline library is empty</h3>
          <p className="text-xs text-white/40 max-w-sm leading-relaxed">
            {tracks.length === 0
              ? "Download tracks from your playlists to start building your offline collection."
              : "No tracks match your search filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filteredTracks.map((track) => {
            const isPlayingThis = currentTrack?.id === track.id && isPlaying;
            return (
              <div
                key={track.id}
                className={`bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors group ${
                  currentTrack?.id === track.id ? "border-accent/30 bg-accent/[0.06]" : ""
                }`}
              >
                {/* Artwork & Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-white/[0.04] flex-shrink-0 border border-white/[0.08]">
                    <img
                      src={
                        track.artwork_url ||
                        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                      }
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => {
                        if (isPlayingThis) togglePlay();
                        else playTrack(track, tracks);
                      }}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {isPlayingThis ? (
                        <Pause className="w-4 h-4 fill-white text-white" />
                      ) : (
                        <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
                      )}
                    </button>
                  </div>

                  <div className="truncate flex-1 min-w-0">
                    <div
                      onClick={() => playTrack(track, tracks)}
                      className={`font-semibold text-xs truncate cursor-pointer hover:underline ${
                        currentTrack?.id === track.id
                          ? "text-accent"
                          : "text-white"
                      }`}
                    >
                      {track.title}
                    </div>
                    <div className="text-[11px] text-white/50 truncate">
                      {track.artist_name}
                    </div>
                    <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5 font-mono">
                      <span className="text-accent font-semibold">320k</span>
                      <span>•</span>
                      <span>{formatDuration(track.duration_ms)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleFavoriteToggle(track)}
                    className={`p-1.5 rounded-full transition-colors ${
                      track.is_favorite
                        ? "text-accent"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        track.is_favorite ? "fill-accent text-accent" : ""
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => handleDeleteOffline(track.id)}
                    className="p-1.5 text-white/40 hover:text-red-400 rounded-full transition-colors"
                    title="Remove from Offline Storage"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
