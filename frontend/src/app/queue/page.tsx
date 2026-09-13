"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowDownCircle,
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  FastForward,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  HardDrive,
  Loader2,
  Radio,
} from "lucide-react";
import { api } from "@/lib/api";
import { DownloadJob, QueueSummary } from "@/types";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function QueuePage() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { subscribe } = useWebSocket();
  const { playTrack } = useAudioPlayer();

  const loadQueue = async () => {
    try {
      const [q, s] = await Promise.all([
        api.getQueue(),
        api.getQueueSummary(),
      ]);
      setJobs(q);
      setSummary(s);
    } catch (e) {
      console.warn("Failed loading queue:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();

    // Listen to real-time status and progress events
    const unsubStatus = subscribe("JOB_STATUS_CHANGED", (data: any) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.job_id
            ? {
                ...j,
                status: data.status,
                progress_percent: data.progress_percent ?? j.progress_percent,
                error_message: data.error_message,
              }
            : j
        )
      );
      api.getQueueSummary().then(setSummary).catch(() => {});
    });

    const unsubProgress = subscribe("JOB_PROGRESS", (data: any) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === data.job_id
            ? {
                ...j,
                bytes_downloaded: data.bytes_downloaded,
                total_bytes: data.total_bytes,
                progress_percent: data.progress_percent,
                speed_bytes_per_sec: data.speed_bytes_per_sec,
                eta_seconds: data.eta_seconds,
              }
            : j
        )
      );
    });

    const unsubBulk = subscribe("QUEUE_BULK_ACTION", () => {
      loadQueue();
    });

    const unsubReorder = subscribe("QUEUE_REORDERED", () => {
      loadQueue();
    });

    const unsubEnqueued = subscribe("JOBS_ENQUEUED", () => {
      loadQueue();
    });

    return () => {
      unsubStatus();
      unsubProgress();
      unsubBulk();
      unsubReorder();
      unsubEnqueued();
    };
  }, [subscribe]);

  // Per-job controls
  const handleJobAction = async (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "skip" | "retry" | "remove"
  ) => {
    try {
      await api.controlJob(jobId, action);
      if (action === "remove") {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Reordering
  const moveJob = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= jobs.length) return;

    const newJobs = [...jobs];
    const [moved] = newJobs.splice(index, 1);
    newJobs.splice(newIndex, 0, moved);
    setJobs(newJobs);

    try {
      await api.reorderQueue(newJobs.map((j) => j.id));
    } catch (e) {
      console.warn("Reorder failed:", e);
    }
  };

  // Bulk controls
  const handleBulk = async (
    action: "pause-all" | "resume-all" | "cancel-all" | "clear-completed"
  ) => {
    try {
      await api.bulkControl(action);
      await loadQueue();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const completedCount = jobs.filter((j) => j.status === "COMPLETED").length;
  const activeCount = summary?.downloading_jobs ?? 0;
  const pendingCount = summary?.pending_jobs ?? 0;

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-4 sm:gap-6 max-w-7xl mx-auto pb-24 md:pb-16">
      {/* Header & Metrics (Requirement 12) */}
      <div className="glass-surface-primary rounded-[22px] border border-white/[0.08] p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-glass">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center font-bold shadow-glow-subtle">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Downloads
              </h1>
              <p className="text-xs text-white/50 mt-0.5">
                {activeCount} active • {pendingCount} queued • {completedCount} completed
              </p>
            </div>
          </div>
        </div>

        {/* Summary Metrics */}
        {summary && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.08]">
              <div className="text-white/40 text-[10px] uppercase font-semibold">Active</div>
              <div className="text-accent font-bold text-sm flex items-center gap-1.5 mt-0.5">
                <span>{summary.downloading_jobs} Downloading</span>
                {summary.downloading_jobs > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                )}
              </div>
            </div>

            <div className="bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.08]">
              <div className="text-white/40 text-[10px] uppercase font-semibold">Queued</div>
              <div className="text-white font-bold text-sm mt-0.5">
                {summary.pending_jobs} Pending
              </div>
            </div>

            <div className="bg-white/[0.04] px-4 py-2 rounded-xl border border-white/[0.08]">
              <div className="text-white/40 text-[10px] uppercase font-semibold">Workers</div>
              <div className="text-white/80 font-bold text-sm mt-0.5">
                {summary.concurrency_limit} Concurrent
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleBulk("pause-all")}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/[0.08] transition-all hover:scale-105"
          >
            <Pause className="w-3.5 h-3.5 text-yellow-500" />
            <span>Pause All</span>
          </button>
          <button
            onClick={() => handleBulk("resume-all")}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/[0.08] transition-all hover:scale-105"
          >
            <Play className="w-3.5 h-3.5 text-accent" />
            <span>Resume All</span>
          </button>
          <button
            onClick={() => handleBulk("cancel-all")}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/[0.08] transition-all hover:scale-105"
          >
            <X className="w-3.5 h-3.5 text-red-400" />
            <span>Cancel All</span>
          </button>
          <button
            onClick={() => handleBulk("clear-completed")}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold px-3.5 py-1.5 rounded-full border border-white/[0.08] transition-all hover:scale-105"
          >
            <Trash2 className="w-3.5 h-3.5 text-white/50" />
            <span>Clear Finished</span>
          </button>
        </div>

        <div className="text-xs text-white/40">
          Showing {jobs.length} independent track jobs
        </div>
      </div>

      {/* Jobs List (Clean, non-bulky layout) */}
      {isLoading ? (
        <div className="py-24 text-center text-white/50">
          <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-2" />
          <p className="text-xs">Loading queue state...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass-surface-subtle border border-white/[0.08] rounded-[22px] p-12 text-center flex flex-col items-center justify-center gap-3">
          <ArrowDownCircle className="w-12 h-12 text-white/20" />
          <h3 className="font-bold text-base text-white">No active downloads</h3>
          <p className="text-xs text-white/40 max-w-md leading-relaxed">
            Import or browse any Spotify playlist and click "Download All" or the download button on any individual track to populate the queue.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job, idx) => {
            const track = job.track;
            const isDownloading = job.status === "DOWNLOADING";
            const isPaused = job.status === "PAUSED";
            const isCompleted = job.status === "COMPLETED";
            const isFailed = job.status === "FAILED";
            const isCancelled = job.status === "CANCELLED";

            return (
              <div
                key={job.id}
                className="bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors group"
              >
                {/* Track Artwork & Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Priority Reorder Controls */}
                  <div className="flex flex-col items-center gap-0.5 pr-1">
                    <button
                      onClick={() => moveJob(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 text-white/40 hover:text-white disabled:opacity-15 transition-colors"
                      title="Promote priority"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono text-white/40">
                      {idx + 1}
                    </span>
                    <button
                      onClick={() => moveJob(idx, "down")}
                      disabled={idx === jobs.length - 1}
                      className="p-1 text-white/40 hover:text-white disabled:opacity-15 transition-colors"
                      title="Demote priority"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/[0.04] flex-shrink-0 relative border border-white/[0.08]">
                    <img
                      src={
                        track?.artwork_url ||
                        "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                      }
                      alt={track?.title || "Track"}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="truncate min-w-0 flex-1">
                    <div className="font-bold text-xs text-white truncate">
                      {track?.title || "Unknown Track"}
                    </div>
                    <div className="text-[11px] text-white/50 truncate">
                      {track?.artist_name} • {track?.album_name}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted
                              ? "bg-accent"
                              : isPaused
                              ? "bg-yellow-500"
                              : isFailed
                              ? "bg-red-500"
                              : "bg-accent"
                          }`}
                          style={{ width: `${job.progress_percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-white/80 w-10 text-right">
                        {Math.round(job.progress_percent)}%
                      </span>
                    </div>

                    {/* Download Speed & Size */}
                    <div className="flex items-center gap-2.5 text-[10px] text-white/40 mt-1 font-mono">
                      {isDownloading && (
                        <>
                          <span className="text-accent font-semibold">
                            {formatBytes(job.speed_bytes_per_sec)}/s
                          </span>
                          <span>•</span>
                          <span>ETA {job.eta_seconds}s</span>
                          <span>•</span>
                        </>
                      )}
                      <span>
                        {formatBytes(job.bytes_downloaded)} /{" "}
                        {formatBytes(job.total_bytes || 3 * 1024 * 1024)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Independent Job Controls */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pl-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/[0.06] w-full sm:w-auto justify-end">
                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      isCompleted
                        ? "bg-accent/15 text-accent border border-accent/30"
                        : isDownloading
                        ? "bg-accent text-black font-extrabold"
                        : isPaused
                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        : isFailed
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-white/[0.04] text-white/50 border border-white/[0.06]"
                    }`}
                  >
                    {job.status}
                  </span>

                  {/* Play offline if completed */}
                  {isCompleted && track && (
                    <button
                      onClick={() => playTrack(track)}
                      className="p-1.5 bg-accent/20 hover:bg-accent text-accent hover:text-black rounded-lg transition-all"
                      title="Play Offline Track"
                    >
                      <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                    </button>
                  )}

                  {/* Pause / Resume */}
                  {isDownloading && (
                    <button
                      onClick={() => handleJobAction(job.id, "pause")}
                      className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-yellow-400 rounded-lg transition-colors"
                      title="Pause Job Independently"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isPaused && (
                    <button
                      onClick={() => handleJobAction(job.id, "resume")}
                      className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-accent rounded-lg transition-colors"
                      title="Resume Job Independently"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Skip */}
                  {(isDownloading || isPaused || job.status === "PENDING") && (
                    <button
                      onClick={() => handleJobAction(job.id, "skip")}
                      className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white rounded-lg transition-colors"
                      title="Skip Job Independently"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Cancel */}
                  {(isDownloading || isPaused || job.status === "PENDING") && (
                    <button
                      onClick={() => handleJobAction(job.id, "cancel")}
                      className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-red-400 rounded-lg transition-colors"
                      title="Cancel Job Independently"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Retry */}
                  {(isFailed || isCancelled || job.status === "SKIPPED") && (
                    <button
                      onClick={() => handleJobAction(job.id, "retry")}
                      className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-accent rounded-lg transition-colors"
                      title="Retry Job Independently"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => handleJobAction(job.id, "remove")}
                    className="p-1.5 text-white/40 hover:text-red-400 transition-colors"
                    title="Remove from Queue"
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
