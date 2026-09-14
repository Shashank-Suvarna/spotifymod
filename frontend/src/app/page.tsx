"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Play,
  ArrowDownCircle,
  HardDrive,
  ListMusic,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Playlist, Track, QueueSummary, UserProfile } from "@/types";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { localMusicStorage } from "@/lib/storage";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const [greeting, setGreeting] = useState("Good day");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [queueSummary, setQueueSummary] = useState<QueueSummary | null>(null);
  const { playTrack } = useAudioPlayer();
  const { subscribe } = useWebSocket();

  const loadData = async () => {
    setGreeting(getGreeting());
    try {
      const [u, pls, offTracks, summary] = await Promise.all([
        api.getUserProfile().catch(() => null),
        api.getPlaylists().catch(() => []),
        api.getOfflineTracks().catch(() => []),
        api.getQueueSummary().catch(() => null),
      ]);
      if (u) setUser(u);

      if (pls && pls.length > 0) {
        setPlaylists(pls);
        for (const p of pls) {
          localMusicStorage.savePlaylist(p).catch(() => {});
        }
      } else {
        const localPls = await localMusicStorage.getAllPlaylists();
        setPlaylists(localPls);
      }

      if (offTracks && offTracks.length > 0) {
        setOfflineTracks(offTracks);
        for (const t of offTracks) {
          localMusicStorage.saveTrack(t).catch(() => {});
        }
      } else {
        const localTracks = await localMusicStorage.getAllTracks();
        setOfflineTracks(localTracks);
      }

      if (summary) setQueueSummary(summary);
    } catch (e) {
      console.warn("Server unavailable, loading offline vault:", e);
      const [localPls, localTracks] = await Promise.all([
        localMusicStorage.getAllPlaylists(),
        localMusicStorage.getAllTracks(),
      ]);
      setPlaylists(localPls);
      setOfflineTracks(localTracks);
    }
  };

  useEffect(() => {
    loadData();

    const unsub = subscribe("JOB_STATUS_CHANGED", () => {
      api.getQueueSummary().then(setQueueSummary).catch(() => {});
      api.getOfflineTracks().then(setOfflineTracks).catch(() => {});
    });

    return () => unsub();
  }, [subscribe]);

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-6 sm:gap-8 max-w-7xl mx-auto pb-24 md:pb-16">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {greeting}, {user?.display_name?.split(" ")[0] || "Shashank"}
          </h1>
          <p className="text-white/50 text-xs mt-1">
            Independent per-track download queue engine & offline audio vault.
          </p>
        </div>

        {/* Live Active Downloads Banner */}
        {queueSummary && queueSummary.downloading_jobs + queueSummary.pending_jobs > 0 && (
          <Link
            href="/queue"
            className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-accent/40 px-4 py-2 rounded-full transition-all shadow-glow group"
          >
            <div className="w-7 h-7 rounded-full bg-accent text-black flex items-center justify-center font-bold">
              <ArrowDownCircle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>{queueSummary.downloading_jobs} Active Downloads</span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              </div>
              <div className="text-[10px] text-white/50">
                {queueSummary.pending_jobs} jobs pending in queue
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Quick Access Top Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {playlists.slice(0, 6).map((pl) => (
          <Link
            key={pl.id}
            href={`/playlist/${pl.id}`}
            className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06] transition-all group p-1.5"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.05] flex-shrink-0 relative border border-white/[0.08]">
              {pl.artwork_url ? (
                <img
                  src={pl.artwork_url}
                  alt={pl.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40">
                  <ListMusic className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="flex-1 truncate pr-2">
              <div className="font-bold text-xs text-white truncate">
                {pl.title}
              </div>
              <div className="text-[11px] text-white/50 truncate mt-0.5">
                {pl.total_tracks} tracks
              </div>
            </div>
            <div className="pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-accent text-black flex items-center justify-center shadow-glow-btn hover:scale-105">
                <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Curated Playlists Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Curated Playlists</h2>
            <p className="text-xs text-white/40">
              Browse playlists and download individual songs or full collections.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {playlists.map((pl) => (
            <Link
              key={pl.id}
              href={`/playlist/${pl.id}`}
              className="glass-surface-subtle hover:bg-white/[0.06] p-3.5 rounded-2xl border border-white/[0.06] transition-all flex flex-col group relative shadow-glass hover:scale-[1.02]"
            >
              <div className="aspect-square w-full rounded-xl overflow-hidden bg-white/[0.05] relative mb-3 border border-white/[0.08]">
                {pl.artwork_url ? (
                  <img
                    src={pl.artwork_url}
                    alt={pl.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/40">
                    <ListMusic className="w-10 h-10" />
                  </div>
                )}
                <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all duration-200">
                  <div className="w-9 h-9 rounded-full bg-accent text-black flex items-center justify-center shadow-glow-btn hover:scale-105">
                    <Play className="w-4 h-4 fill-black translate-x-0.5" />
                  </div>
                </div>
              </div>

              <div className="font-bold text-xs text-white truncate mb-1">
                {pl.title}
              </div>
              <div className="text-[11px] text-white/40 line-clamp-2 leading-relaxed">
                {pl.description || `By ${pl.owner_name} • ${pl.total_tracks} tracks`}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Offline Library Preview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-white tracking-tight">Offline Library</h2>
            <span className="text-[10px] bg-white/[0.04] text-white/60 px-2.5 py-0.5 rounded-full border border-white/[0.08]">
              {offlineTracks.length} ready
            </span>
          </div>
          <Link
            href="/offline"
            className="text-xs text-accent hover:underline font-medium"
          >
            View all →
          </Link>
        </div>

        {offlineTracks.length === 0 ? (
          <div className="glass-surface-subtle border border-white/[0.08] rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2.5">
            <HardDrive className="w-8 h-8 text-white/20" />
            <div className="text-xs font-semibold text-white">No tracks downloaded yet</div>
            <p className="text-[11px] text-white/40 max-w-sm">
              Explore playlists and click the download button on any track to store songs offline.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {offlineTracks.slice(0, 6).map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, offlineTracks)}
                className="flex items-center gap-3 bg-white/[0.025] hover:bg-white/[0.05] p-2.5 rounded-2xl border border-white/[0.06] transition-all cursor-pointer group"
              >
                <img
                  src={
                    track.artwork_url ||
                    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&h=100&fit=crop"
                  }
                  alt={track.title}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-white/10"
                />
                <div className="flex-1 truncate min-w-0">
                  <div className="text-xs font-semibold text-white truncate group-hover:text-accent transition-colors">
                    {track.title}
                  </div>
                  <div className="text-[11px] text-white/50 truncate">
                    {track.artist_name}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full border border-accent/25">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Ready</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
