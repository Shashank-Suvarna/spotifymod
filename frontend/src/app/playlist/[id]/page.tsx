"use client";

import React, { useEffect, useState, useRef, useMemo, use } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Shuffle,
  Download,
  CheckCircle2,
  Heart,
  Loader2,
  ChevronDown,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  XCircle,
  RotateCcw,
  CloudDownload,
  ListPlus,
  Radio,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { Playlist, Track, JobStatus } from "@/types";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useWebSocket } from "@/hooks/useWebSocket";

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function formatTotalDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
}

const ROW_HEIGHT = 64; // 64px standard row height
const OVERSCAN = 20; // 20-row buffer for buttery smooth 120fps scrolling

export default function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const playlistId = resolvedParams.id;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"tracks" | "about" | "similar">("tracks");

  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioPlayer();
  const { subscribe } = useWebSocket();

  // Scroll and Virtualization State with 120 FPS RAF synchronization
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const [tableOffsetTop, setTableOffsetTop] = useState(400);
  const lastScrollTopRef = useRef(0);
  const scrollRafId = useRef<number | null>(null);

  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target as Node)
      ) {
        setIsDownloadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadPlaylist = async () => {
    try {
      setIsLoading(true);
      const data = await api.getPlaylist(playlistId);
      setPlaylist(data);
      setTracks(data.tracks || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylist();

    // WebSocket updates throttled to avoid re-render storms
    let pendingProgressUpdates = new Map<string, number>();
    let progressTimer: NodeJS.Timeout | null = null;

    const flushProgress = () => {
      if (pendingProgressUpdates.size === 0) return;
      const updates = new Map(pendingProgressUpdates);
      pendingProgressUpdates.clear();

      setTracks((prev) =>
        prev.map((t) => {
          if (t.active_job_id && updates.has(t.active_job_id)) {
            return {
              ...t,
              download_progress: updates.get(t.active_job_id)!,
            };
          }
          return t;
        })
      );
    };

    const unsubProgress = subscribe("JOB_PROGRESS", (data: any) => {
      if (data.job_id && data.progress_percent !== undefined) {
        pendingProgressUpdates.set(data.job_id, data.progress_percent);
        if (!progressTimer) {
          progressTimer = setTimeout(() => {
            progressTimer = null;
            flushProgress();
          }, 150);
        }
      }
    });

    const unsubStatus = subscribe("JOB_STATUS_CHANGED", (data: any) => {
      setTracks((prev) =>
        prev.map((t) => {
          if (t.active_job_id === data.job_id || t.id === data.track_id) {
            return {
              ...t,
              active_job_status: data.status,
              is_offline: data.is_offline ?? t.is_offline,
              download_progress: data.progress_percent ?? t.download_progress,
            };
          }
          return t;
        })
      );
    });

    const unsubEnqueued = subscribe("JOBS_ENQUEUED", (data: any) => {
      if (data.playlist_id === playlistId) {
        loadPlaylist();
      }
    });

    return () => {
      unsubProgress();
      unsubStatus();
      unsubEnqueued();
      if (progressTimer) clearTimeout(progressTimer);
    };
  }, [playlistId, subscribe]);

  // Handle Container Resize, Table Offset, and Virtualization
  useEffect(() => {
    const updateMeasurements = () => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight);
      }
      if (tableRef.current) {
        setTableOffsetTop(tableRef.current.offsetTop);
      }
    };

    updateMeasurements();

    const container = scrollContainerRef.current;
    if (!container) return;

    const onNativeScroll = () => {
      lastScrollTopRef.current = container.scrollTop;
      if (scrollRafId.current === null) {
        scrollRafId.current = requestAnimationFrame(() => {
          setScrollTop(lastScrollTopRef.current);
          scrollRafId.current = null;
        });
      }
    };

    container.addEventListener("scroll", onNativeScroll, { passive: true });
    window.addEventListener("resize", updateMeasurements, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateMeasurements();
      });
      resizeObserver.observe(container);
    }

    return () => {
      if (scrollRafId.current !== null) {
        cancelAnimationFrame(scrollRafId.current);
        scrollRafId.current = null;
      }
      container.removeEventListener("scroll", onNativeScroll);
      window.removeEventListener("resize", updateMeasurements);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isLoading, playlist]);

  // Direct onScroll handler ensuring zero missed events
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    lastScrollTopRef.current = e.currentTarget.scrollTop;
    if (scrollRafId.current === null) {
      scrollRafId.current = requestAnimationFrame(() => {
        setScrollTop(lastScrollTopRef.current);
        scrollRafId.current = null;
      });
    }
  };

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    if (!filterQuery.trim()) return tracks;
    const q = filterQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist_name.toLowerCase().includes(q) ||
        t.album_name.toLowerCase().includes(q)
    );
  }, [tracks, filterQuery]);

  // Virtualization window calculations with exact table offset
  const totalCount = filteredTracks.length;
  const totalHeight = totalCount * ROW_HEIGHT;
  const effectiveScrollTop = Math.max(0, scrollTop - tableOffsetTop);
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / ROW_HEIGHT) - OVERSCAN
  );
  const endIndex = Math.min(
    totalCount,
    Math.ceil((effectiveScrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleTracks = filteredTracks.slice(startIndex, endIndex);

  // Bulk Enqueue (Requirement 8: creates 587 independent jobs)
  const handleDownloadAll = async () => {
    if (!playlist) return;
    setIsEnqueuing(true);
    setIsDownloadMenuOpen(false);
    try {
      const res = await api.enqueuePlaylist(playlist.id);
      setActionNotice(
        `Created ${res.enqueued_count} independent jobs! Each track is downloading independently.`
      );
      await loadPlaylist();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsEnqueuing(false);
    }
  };

  // Download Selected Tracks
  const handleDownloadSelected = async () => {
    if (selectedTrackIds.size === 0) {
      alert("No tracks selected. Check the boxes next to songs first.");
      return;
    }
    setIsEnqueuing(true);
    setIsDownloadMenuOpen(false);
    try {
      let count = 0;
      for (const trackId of selectedTrackIds) {
        await api.startTrackDownload(trackId);
        count++;
      }
      setActionNotice(`Queued ${count} selected tracks independently.`);
      setSelectedTrackIds(new Set());
      await loadPlaylist();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsEnqueuing(false);
    }
  };

  // Download Remaining (Not yet offline)
  const handleDownloadRemaining = async () => {
    const remaining = tracks.filter((t) => !t.is_offline);
    if (remaining.length === 0) {
      setActionNotice("All tracks are already downloaded offline!");
      setTimeout(() => setActionNotice(null), 3000);
      setIsDownloadMenuOpen(false);
      return;
    }
    setIsEnqueuing(true);
    setIsDownloadMenuOpen(false);
    try {
      let count = 0;
      for (const track of remaining) {
        await api.startTrackDownload(track.id);
        count++;
      }
      setActionNotice(`Queued ${count} remaining tracks independently.`);
      await loadPlaylist();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsEnqueuing(false);
    }
  };

  // Individual Track Download
  const handleDownloadSingleTrack = async (track: Track) => {
    try {
      const res = await api.startTrackDownload(track.id);
      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? {
                ...t,
                active_job_status: "PENDING",
                active_job_id: res.job_id,
                download_progress: 0,
              }
            : t
        )
      );
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Individual Job Action (Pause, Resume, Cancel, Retry)
  const handleJobAction = async (
    track: Track,
    action: "pause" | "resume" | "cancel" | "retry"
  ) => {
    if (!track.active_job_id) return;
    try {
      await api.controlJob(track.active_job_id, action);
      const newStatus: JobStatus =
        action === "pause"
          ? "PAUSED"
          : action === "resume"
          ? "DOWNLOADING"
          : action === "cancel"
          ? "CANCELLED"
          : "PENDING";

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, active_job_status: newStatus } : t
        )
      );
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

  // Select all / Deselect all
  const toggleSelectAll = () => {
    if (selectedTrackIds.size === filteredTracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(filteredTracks.map((t) => t.id)));
    }
  };

  const toggleSelectTrack = (trackId: string) => {
    const next = new Set(selectedTrackIds);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    setSelectedTrackIds(next);
  };

  if (isLoading && !playlist) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-white/50">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-xs">Loading playlist...</p>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="text-center py-24 text-white/50 text-sm">
        Playlist not found or could not be loaded.
      </div>
    );
  }

  const isCurrentPlaylistPlaying =
    isPlaying && currentTrack && tracks.some((t) => t.id === currentTrack.id);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-4 sm:gap-5 relative hardware-scroller"
    >
      {/* Mobile-dedicated Playlist Hero (Screens < 768px) */}
      <div className="flex md:hidden flex-col items-center text-center p-4 pt-2 gap-3.5 relative rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent border border-white/[0.08]">
        {/* Large Centered Artwork */}
        <div className="w-44 h-44 rounded-2xl overflow-hidden bg-white/[0.04] shadow-2xl border border-white/[0.12] relative">
          <img
            src={
              playlist.artwork_url ||
              "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop"
            }
            alt={playlist.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Playlist Label & Title */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">
            PLAYLIST • SPOTIFY
          </div>
          <h1 className="text-xl font-black text-white tracking-tight leading-tight">
            {playlist.title}
          </h1>
          <p className="text-xs text-white/50 mt-1">
            {playlist.owner_name || "Shashank Suvarna"} • {tracks.length} tracks • {formatTotalDuration(playlist.total_duration_ms)}
          </p>
        </div>

        {/* Mobile Action Controls: [▶ Play] [⇄ Shuffle] [↓ Download] */}
        <div className="flex items-center gap-2.5 w-full max-w-xs justify-center pt-1">
          <button
            onClick={() => {
              if (tracks.length > 0) {
                if (isCurrentPlaylistPlaying) {
                  togglePlay();
                } else {
                  playTrack(tracks[0], tracks);
                }
              }
            }}
            className="flex-1 min-h-[44px] bg-accent hover:bg-accent-hover text-black font-extrabold text-sm rounded-full flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(30,215,96,0.35)] active:scale-95 transition-all"
          >
            {isCurrentPlaylistPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-black" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-black translate-x-0.5" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (tracks.length > 0) {
                const randomIdx = Math.floor(Math.random() * tracks.length);
                playTrack(tracks[randomIdx], tracks);
              }
            }}
            className="w-11 h-11 rounded-full bg-white/[0.08] active:bg-white/[0.15] border border-white/[0.10] text-white flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
            disabled={isEnqueuing || tracks.length === 0}
            className="min-h-[44px] px-3.5 rounded-full bg-white/[0.08] active:bg-white/[0.15] border border-white/[0.10] text-white flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
            aria-label="Download options"
          >
            <Download className="w-4 h-4 text-accent" />
            <ChevronDown className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
      </div>

      {/* 1. Immersive Liquid Glass Hero (Desktop: Responsive 280-320px height, unclipped) */}
      <div className="hidden md:flex relative rounded-[22px] overflow-hidden liquid-glass p-6 md:p-7 min-h-[290px] md:h-[310px] items-center flex-shrink-0">
        {/* Heavily blurred, darkened background artwork layer */}
        {playlist.artwork_url && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div
              className="absolute -inset-10 bg-cover bg-center filter blur-[60px] opacity-25 scale-110 saturate-150"
              style={{
                backgroundImage: `url(${playlist.artwork_url})`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/85" />
          </div>
        )}

        {/* Hero Content: [Large artwork] [Playlist information + actions] */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-6 md:gap-8 w-full">
          {/* Large Artwork */}
          <div className="w-48 h-48 sm:w-52 sm:h-52 md:w-60 md:h-60 rounded-[18px] overflow-hidden bg-white/[0.04] flex-shrink-0 relative shadow-2xl border border-white/[0.12] group">
            <img
              src={
                playlist.artwork_url ||
                "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop"
              }
              alt={playlist.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Spotify corner badge */}
            <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center text-accent border border-white/10 shadow-md">
              <Radio className="w-4 h-4" />
            </div>
          </div>

          {/* Playlist Information + Actions */}
          <div className="flex flex-col text-center sm:text-left min-w-0 flex-1 justify-end">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[2px] text-white/50">
                PLAYLIST
              </span>
              <span className="text-white/20">•</span>
              <span className="text-[11px] font-bold uppercase tracking-[2px] text-accent/90">
                SPOTIFY PLAYLIST
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-2 truncate">
              {playlist.title}
            </h1>
            <p className="text-xs md:text-sm text-white/60 mb-3 max-w-2xl line-clamp-2 leading-relaxed">
              {playlist.description ||
                "Curated playlist available for offline playback."}
            </p>

            {/* Metadata: Shashank Suvarna • 587 tracks • 41 hr 54 min */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs md:text-[13px] text-white/65 font-medium mb-5">
              <div className="w-5 h-5 rounded-full overflow-hidden border border-white/15 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60&h=60&fit=crop"
                  alt={playlist.owner_name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-white font-semibold">{playlist.owner_name}</span>
              <span>•</span>
              <span>{tracks.length} tracks</span>
              <span>•</span>
              <span>{formatTotalDuration(playlist.total_duration_ms)}</span>
            </div>

            {/* Hero Actions: [Play] [Shuffle] [Download ▾] [...] */}
            <div className="flex items-center justify-center sm:justify-start gap-3">
              {/* Play Button */}
              <button
                onClick={() => {
                  if (isCurrentPlaylistPlaying) {
                    togglePlay();
                  } else if (tracks.length > 0) {
                    playTrack(tracks[0], tracks);
                  }
                }}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-black font-bold text-xs md:text-sm px-6 py-2.5 rounded-full transition-all shadow-glow-btn hover:scale-105 active:scale-95"
              >
                {isCurrentPlaylistPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-black text-black" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black text-black translate-x-0.5" />
                    <span>Play</span>
                  </>
                )}
              </button>

              {/* Shuffle Button */}
              <button
                onClick={() => {
                  if (tracks.length > 0) {
                    const randomIdx = Math.floor(Math.random() * tracks.length);
                    playTrack(tracks[randomIdx], tracks);
                  }
                }}
                className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] text-white/80 hover:text-white flex items-center justify-center transition-all hover:scale-105"
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Compact [ Download ▾ ] Dropdown */}
              <div className="relative" ref={downloadMenuRef}>
                <button
                  onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                  disabled={isEnqueuing || tracks.length === 0}
                  className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-white text-xs md:text-sm font-semibold px-4 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
                >
                  {isEnqueuing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      <span>Enqueuing...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 text-accent" />
                      <span>Download</span>
                      <ChevronDown className="w-3.5 h-3.5 text-white/60 ml-0.5" />
                    </>
                  )}
                </button>

                {/* Dropdown Menu */}
                {isDownloadMenuOpen && (
                  <div className="absolute left-0 mt-2 w-56 rounded-2xl glass-modal py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      onClick={handleDownloadAll}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-white hover:bg-white/[0.08] flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <CloudDownload className="w-4 h-4 text-accent" />
                        <span>Download All ({tracks.length})</span>
                      </div>
                      <span className="text-[10px] text-white/40">Full</span>
                    </button>

                    {selectedTrackIds.size > 0 && (
                      <button
                        onClick={handleDownloadSelected}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-white hover:bg-white/[0.08] flex items-center gap-2.5 transition-colors"
                      >
                        <Check className="w-4 h-4 text-accent" />
                        <span>Download Selected ({selectedTrackIds.size})</span>
                      </button>
                    )}

                    <button
                      onClick={handleDownloadRemaining}
                      className="w-full px-4 py-2.5 text-left text-xs font-medium text-white hover:bg-white/[0.08] flex items-center gap-2.5 transition-colors"
                    >
                      <Download className="w-4 h-4 text-white/60" />
                      <span>Download Remaining</span>
                    </button>

                    <div className="my-1 border-t border-white/[0.06]" />

                    <Link
                      href="/queue"
                      className="w-full px-4 py-2 text-left text-xs font-medium text-white/60 hover:text-white hover:bg-white/[0.08] flex items-center gap-2.5 transition-colors"
                    >
                      <ListPlus className="w-4 h-4" />
                      <span>Manage Queue</span>
                    </Link>
                  </div>
                )}
              </div>

              {/* More Button (...) */}
              <button
                className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] text-white/70 hover:text-white flex items-center justify-center transition-all"
                title="More Options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      {actionNotice && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2.5 animate-in fade-in flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 2. Tabs & In-Playlist Search (Tight vertical rhythm) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-b border-white/[0.06] pb-3 flex-shrink-0">
        <div className="flex items-center gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("tracks")}
            className={`pb-1 relative transition-colors ${
              activeTab === "tracks"
                ? "text-white"
                : "text-white/50 hover:text-white"
            }`}
          >
            <span>Tracks</span>
            {activeTab === "tracks" && (
              <div className="absolute -bottom-3 left-0 right-0 h-0.5 bg-accent rounded-full shadow-[0_0_8px_rgba(30,215,96,0.6)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("about")}
            className={`pb-1 relative transition-colors ${
              activeTab === "about"
                ? "text-white"
                : "text-white/50 hover:text-white"
            }`}
          >
            <span>About</span>
          </button>
          <button
            onClick={() => setActiveTab("similar")}
            className={`pb-1 relative transition-colors ${
              activeTab === "similar"
                ? "text-white"
                : "text-white/50 hover:text-white"
            }`}
          >
            <span>Similar Playlists</span>
          </button>
        </div>

        {/* In-Playlist Search & Filter Control */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search in playlist..."
              className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 pl-8 pr-3 py-1.5 rounded-full border border-white/[0.08] focus:border-accent/50 focus:outline-none transition-all"
            />
          </div>
          <button
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
            title="Filter & Sort"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Strict Shared Grid Track Table (Requirement 2 & 10) */}
      <div className="flex flex-col min-w-0 pb-16">
        {/* Table Header with Strict Shared Grid (Desktop Only) */}
        <div className="hidden md:grid track-table-grid py-2.5 text-[11px] font-semibold text-white/40 uppercase tracking-wider border-b border-white/[0.06] select-none">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={
                selectedTrackIds.size === filteredTracks.length &&
                filteredTracks.length > 0
              }
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-accent cursor-pointer"
            />
          </div>
          <div className="text-center font-mono">#</div>
          <div>TITLE</div>
          <div className="hidden md:block">ARTIST</div>
          <div className="hidden lg:block">ALBUM</div>
          <div className="text-right pr-2">DURATION</div>
          <div>STATUS</div>
          <div className="text-right pr-1">ACTIONS</div>
        </div>

        {/* Virtualized Track Rows Container (Height matches 587 * ROW_HEIGHT) */}
        <div
          ref={tableRef}
          className="relative w-full"
          style={{ height: `${totalHeight}px` }}
        >
          {visibleTracks.map((track, relativeIndex) => {
            const index = startIndex + relativeIndex;
            const isThisTrackPlaying =
              currentTrack?.id === track.id && isPlaying;
            const isThisTrackActive = currentTrack?.id === track.id;
            const isJobActive =
              track.active_job_status === "DOWNLOADING" ||
              track.active_job_status === "PENDING";
            const isJobPaused = track.active_job_status === "PAUSED";
            const isChecked = selectedTrackIds.has(track.id);

            return (
              <div
                key={track.id}
                className={`absolute top-0 left-0 right-0 h-[64px] text-xs transition-colors duration-150 border-b border-white/[0.035] ${
                  isThisTrackActive
                    ? "bg-accent/[0.08] text-white"
                    : "hover:bg-white/[0.045] text-white/80"
                }`}
                style={{
                  transform: `translate3d(0, ${index * ROW_HEIGHT}px, 0)`,
                  contain: "content",
                  willChange: "transform",
                }}
              >
                {/* 1. DESKTOP 8-COLUMN ROW (Screens >= 768px) */}
                <div className="hidden md:grid h-full track-table-grid items-center group">
                  {/* 1. CHECKBOX */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelectTrack(track.id)}
                      className="w-3.5 h-3.5 rounded bg-white/10 border-white/20 accent-accent cursor-pointer"
                    />
                  </div>

                  {/* 2. # (Track Number / Animated Equalizer / Play button) */}
                  <div className="flex items-center justify-center relative">
                    {isThisTrackPlaying ? (
                      <div className="flex items-end gap-[2px] h-3.5">
                        <span className="w-[2.5px] bg-accent rounded-full animate-eq-1" />
                        <span className="w-[2.5px] bg-accent rounded-full animate-eq-2" />
                        <span className="w-[2.5px] bg-accent rounded-full animate-eq-3" />
                        <span className="w-[2.5px] bg-accent rounded-full animate-eq-4" />
                      </div>
                    ) : (
                      <>
                        <span className="group-hover:hidden font-mono text-white/40 text-[11px]">
                          {track.track_number || index + 1}
                        </span>
                        <button
                          onClick={() => {
                            if (isThisTrackActive) {
                              togglePlay();
                            } else {
                              playTrack(track, tracks);
                            }
                          }}
                          className="hidden group-hover:flex w-6 h-6 rounded-full bg-accent text-black items-center justify-center transition-transform hover:scale-110 shadow-sm"
                          title="Play"
                        >
                          <Play className="w-3 h-3 fill-black translate-x-0.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* 3. TITLE (Artwork + Title) */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.04] flex-shrink-0 relative border border-white/[0.08]">
                      <img
                        src={
                          track.artwork_url ||
                          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                        }
                        alt={track.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </div>
                    <div className="truncate min-w-0">
                      <div
                        onClick={() => playTrack(track, tracks)}
                        className={`font-semibold text-xs md:text-[13px] truncate cursor-pointer hover:underline ${
                          isThisTrackActive ? "text-accent" : "text-white"
                        }`}
                      >
                        {track.title}
                      </div>
                      <div className="text-[11px] text-white/50 truncate md:hidden">
                        {track.artist_name}
                      </div>
                    </div>
                  </div>

                  {/* 4. ARTIST */}
                  <div className="hidden md:block truncate text-white/65 hover:text-white cursor-pointer transition-colors text-xs md:text-[13px]">
                    {track.artist_name}
                  </div>

                  {/* 5. ALBUM */}
                  <div className="hidden lg:block truncate text-white/45 text-xs">
                    {track.album_name}
                  </div>

                  {/* 6. DURATION */}
                  <div className="text-right pr-2 font-mono text-white/50 text-xs">
                    {formatDuration(track.duration_ms)}
                  </div>

                  {/* 7. STATUS (Dedicated column) */}
                  <div className="truncate">
                    {track.is_offline ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent bg-accent/10 border border-accent/25 px-2.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>Offline</span>
                      </span>
                    ) : isJobActive ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent bg-accent/10 border border-accent/25 px-2.5 py-0.5 rounded-full">
                        <span className="text-accent animate-spin">◌</span>
                        <span>Downloading {Math.round(track.download_progress || 0)}%</span>
                      </span>
                    ) : isJobPaused ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                        <span>Ⅱ</span>
                        <span>Paused</span>
                      </span>
                    ) : track.active_job_status === "FAILED" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full">
                        <span>!</span>
                        <span>Failed</span>
                      </span>
                    ) : track.active_job_status === "CANCELLED" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/40 bg-white/[0.03] border border-white/[0.06] px-2.5 py-0.5 rounded-full">
                        <span>↷</span>
                        <span>Skipped</span>
                      </span>
                    ) : track.active_job_status === "PENDING" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/60 bg-white/[0.05] border border-white/[0.08] px-2.5 py-0.5 rounded-full">
                        <span>◷</span>
                        <span>Queued</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-white/20">—</span>
                    )}
                  </div>

                  {/* 8. ACTIONS */}
                  <div className="flex items-center justify-end gap-1.5 pr-1">
                    <button
                      onClick={() => handleFavoriteToggle(track)}
                      className={`p-1 rounded-full transition-colors ${
                        track.is_favorite
                          ? "text-accent"
                          : "text-white/40 hover:text-white opacity-0 group-hover:opacity-100"
                      }`}
                      title={track.is_favorite ? "Favorited" : "Favorite"}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          track.is_favorite ? "fill-accent text-accent" : ""
                        }`}
                      />
                    </button>

                    {!track.is_offline && !isJobActive && !isJobPaused && (
                      <button
                        onClick={() => handleDownloadSingleTrack(track)}
                        className="p-1 text-white/40 hover:text-accent opacity-0 group-hover:opacity-100 transition-colors"
                        title="Download Track"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isJobActive && (
                      <>
                        <button
                          onClick={() => handleJobAction(track, "pause")}
                          className="p-1 text-white/50 hover:text-amber-300 transition-colors"
                          title="Pause Download"
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleJobAction(track, "cancel")}
                          className="p-1 text-white/50 hover:text-rose-400 transition-colors"
                          title="Cancel Download"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    {isJobPaused && (
                      <>
                        <button
                          onClick={() => handleJobAction(track, "resume")}
                          className="p-1 text-white/50 hover:text-accent transition-colors"
                          title="Resume Download"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleJobAction(track, "cancel")}
                          className="p-1 text-white/50 hover:text-rose-400 transition-colors"
                          title="Cancel Download"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    {track.active_job_status === "FAILED" && (
                      <button
                        onClick={() => handleJobAction(track, "retry")}
                        className="p-1 text-white/50 hover:text-accent transition-colors"
                        title="Retry Download"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      className="p-1 text-white/30 hover:text-white opacity-0 group-hover:opacity-100 transition-colors"
                      title="More"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. DEDICATED MOBILE COMPACT ROW (Screens < 768px) */}
                <div
                  onClick={() => {
                    if (isThisTrackActive) {
                      togglePlay();
                    } else {
                      playTrack(track, tracks);
                    }
                  }}
                  className="flex md:hidden items-center justify-between px-3 h-full gap-2.5 w-full cursor-pointer active:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.04] flex-shrink-0 relative border border-white/[0.08]">
                      <img
                        src={
                          track.artwork_url ||
                          "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                        }
                        alt={track.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isThisTrackPlaying && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <div className="flex items-end gap-[1.5px] h-3">
                            <span className="w-[2px] bg-accent rounded-full animate-eq-1" />
                            <span className="w-[2px] bg-accent rounded-full animate-eq-2" />
                            <span className="w-[2px] bg-accent rounded-full animate-eq-3" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="truncate min-w-0">
                      <div
                        className={`font-semibold text-xs truncate ${
                          isThisTrackActive ? "text-accent" : "text-white"
                        }`}
                      >
                        {track.title}
                      </div>
                      <div className="text-[10px] text-white/50 truncate">
                        {track.artist_name}
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono text-white/40">
                      {formatDuration(track.duration_ms)}
                    </span>

                    {track.is_offline ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>Offline</span>
                      </span>
                    ) : isJobActive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">
                        <span className="text-accent animate-spin">◌</span>
                        <span>{Math.round(track.download_progress || 0)}%</span>
                      </span>
                    ) : isJobPaused ? (
                      <span className="text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        Paused
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDownloadSingleTrack(track)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 active:text-accent border border-white/[0.08] active:bg-white/[0.08]"
                        title="Download track"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleFavoriteToggle(track)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 active:text-accent"
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          track.is_favorite ? "fill-accent text-accent" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
