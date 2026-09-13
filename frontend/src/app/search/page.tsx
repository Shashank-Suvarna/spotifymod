"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Play,
  Download,
  ListMusic,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Playlist, Track } from "@/types";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { localMusicStorage } from "@/lib/storage";

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { playTrack } = useAudioPlayer();

  const handleSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setIsLoading(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineRes = await localMusicStorage.searchOffline(searchTerm.trim());
      setPlaylists(offlineRes.playlists);
      setTracks(offlineRes.tracks);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.search(searchTerm.trim());
      setPlaylists(res.playlists || []);
      setTracks(res.tracks || []);
    } catch (e) {
      console.warn("Online search failed, checking offline vault:", e);
      const offlineRes = await localMusicStorage.searchOffline(searchTerm.trim());
      setPlaylists(offlineRes.playlists);
      setTracks(offlineRes.tracks);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleDownloadSingle = async (track: Track) => {
    try {
      await api.startTrackDownload(track.id);
      alert(`Queued "${track.title}" for download!`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-4 flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Search Input Hero */}
      <div className="glass-surface-primary rounded-[22px] border border-white/[0.08] p-6 shadow-glass">
        <h1 className="text-2xl font-black text-white tracking-tight mb-3">
          Explore Music & Playlists
        </h1>
        <form onSubmit={onSubmit} className="relative max-w-lg">
          <Search className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists, songs, or playlists..."
            className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 pl-11 pr-4 py-3 rounded-full border border-white/[0.08] focus:border-accent/60 focus:outline-none focus:shadow-[0_0_20px_rgba(30,215,96,0.15)] transition-all"
          />
        </form>
      </div>

      {isLoading && (
        <div className="py-24 text-center text-white/50">
          <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-2" />
          <p className="text-xs">Searching catalog...</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && (playlists.length > 0 || tracks.length > 0) && (
        <div className="flex flex-col gap-8">
          {/* Playlists */}
          {playlists.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-white mb-3">Playlists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {playlists.map((pl) => (
                  <Link
                    key={pl.id}
                    href={`/playlist/${pl.id}`}
                    className="glass-surface-subtle hover:bg-white/[0.06] p-3 rounded-2xl border border-white/[0.06] transition-all flex flex-col group shadow-glass hover:scale-[1.02]"
                  >
                    <div className="aspect-square w-full rounded-xl overflow-hidden bg-white/[0.05] relative mb-3 border border-white/[0.08]">
                      <img
                        src={
                          pl.artwork_url ||
                          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop"
                        }
                        alt={pl.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="font-bold text-xs text-white truncate mb-1">
                      {pl.title}
                    </div>
                    <div className="text-[11px] text-white/40 truncate">
                      {pl.total_tracks} tracks • {pl.owner_name}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tracks */}
          {tracks.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-white mb-3">Songs</h2>
              <div className="rounded-2xl border border-white/[0.06] divide-y divide-white/[0.04] overflow-hidden">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-3 hover:bg-white/[0.04] transition-colors group text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={
                          track.artwork_url ||
                          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                        }
                        alt={track.title}
                        className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/10"
                      />
                      <div className="truncate min-w-0">
                        <div
                          onClick={() => playTrack(track, tracks)}
                          className="font-semibold text-xs text-white truncate cursor-pointer hover:underline"
                        >
                          {track.title}
                        </div>
                        <div className="text-[11px] text-white/50 truncate">
                          {track.artist_name} • {track.album_name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-white/40 text-[11px]">
                        {formatDuration(track.duration_ms)}
                      </span>
                      <button
                        onClick={() => playTrack(track, tracks)}
                        className="p-1.5 text-white/50 hover:text-white rounded-full transition-colors"
                        title="Play Song"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <button
                        onClick={() => handleDownloadSingle(track)}
                        className="p-1.5 text-white/50 hover:text-accent rounded-full transition-colors"
                        title="Download to Offline Library"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-white/40 text-xs">
          Loading Search...
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
