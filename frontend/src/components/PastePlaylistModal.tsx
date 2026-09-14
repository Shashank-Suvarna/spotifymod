"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Link as LinkIcon,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ListPlus,
  Flame,
} from "lucide-react";
import { api } from "@/lib/api";
import { Playlist } from "@/types";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PastePlaylistModal({ isOpen, onClose }: ModalProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [importedPlaylist, setImportedPlaylist] = useState<Playlist | null>(null);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async (targetUrl?: string) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setImportedPlaylist(null);

    try {
      const pl = await api.importPlaylist(inputUrl.trim());
      if (pl && pl.tracks && pl.tracks.length > 0) {
        setImportedPlaylist(pl);
        setSuccessMessage(`Found ${pl.total_tracks} tracks in "${pl.title}"`);
      } else {
        throw new Error("Unable to parse tracks for this playlist URL.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to parse Spotify playlist URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnqueueAll = async () => {
    if (!importedPlaylist) return;
    setIsEnqueuing(true);
    setError(null);

    try {
      const res = await api.enqueuePlaylist(importedPlaylist.id);
      setSuccessMessage(
        `Created ${res.enqueued_count} independent track jobs! Check the Download Queue.`
      );
      setTimeout(() => {
        onClose();
        router.push("/queue");
      }, 1200);
    } catch (e: any) {
      setError(e.message || "Failed to enqueue playlist tracks");
    } finally {
      setIsEnqueuing(false);
    }
  };

  const handleGoToPlaylist = () => {
    if (importedPlaylist) {
      onClose();
      router.push(`/playlist/${importedPlaylist.id}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="glass-modal rounded-[24px] border border-white/[0.12] w-full max-w-lg p-6 shadow-2xl relative overflow-hidden">
        {/* Specular highlight at top */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-white/50 hover:text-white p-1 rounded-full hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-glow-subtle">
            <LinkIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Paste Spotify Playlist URL</h2>
            <p className="text-xs text-white/50">
              Creates independent, controllable download jobs for every track in the playlist.
            </p>
          </div>
        </div>

        {/* Input Form */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
              className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-white placeholder-white/40 text-xs px-4 py-3 rounded-xl border border-white/[0.08] focus:border-accent/60 focus:outline-none focus:shadow-[0_0_20px_rgba(30,215,96,0.15)] transition-all"
            />
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/40 text-[11px] font-medium">Quick Presets:</span>
            <button
              onClick={() => {
                setUrl("https://open.spotify.com/playlist/demo_500_track_mega_playlist");
                handleImport("https://open.spotify.com/playlist/demo_500_track_mega_playlist");
              }}
              className="bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25 px-3 py-1 rounded-full transition-all flex items-center gap-1 text-[11px] font-semibold"
            >
              <Flame className="w-3 h-3 fill-accent" />
              <span>500 Track Mega Playlist</span>
            </button>
            <button
              onClick={() => {
                setUrl("https://open.spotify.com/playlist/today_top_hits");
                handleImport("https://open.spotify.com/playlist/today_top_hits");
              }}
              className="bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border border-white/[0.08] px-3 py-1 rounded-full transition-all text-[11px]"
            >
              Top Hits (50)
            </button>
          </div>

          {/* Import Button */}
          <button
            onClick={() => handleImport()}
            disabled={isLoading || !url.trim()}
            className="w-full bg-accent hover:bg-accent-hover text-black font-bold text-xs py-3 rounded-xl transition-all shadow-glow-btn hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Paginating Spotify Metadata...</span>
              </>
            ) : (
              <>
                <ListPlus className="w-4 h-4" />
                <span>Fetch Playlist Tracks</span>
              </>
            )}
          </button>

          {/* Status / Error feedback */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && !error && (
            <div className="bg-accent/10 border border-accent/30 text-accent text-xs p-3 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Preview of Imported Playlist */}
          {importedPlaylist && (
            <div className="bg-white/[0.035] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3 mt-2 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={
                      importedPlaylist.artwork_url ||
                      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop"
                    }
                    alt={importedPlaylist.title}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-white/10"
                  />
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-white truncate">
                      {importedPlaylist.title}
                    </h4>
                    <p className="text-[11px] text-white/50 truncate">
                      {importedPlaylist.total_tracks} tracks found • {importedPlaylist.owner_name}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleGoToPlaylist}
                  className="text-xs text-white hover:text-accent font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] transition-colors"
                >
                  View Table
                </button>
              </div>

              {/* Download Entire Playlist In 1-Click Button */}
              <button
                onClick={handleEnqueueAll}
                disabled={isEnqueuing}
                className="w-full bg-accent hover:bg-accent-hover text-black font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-glow-btn hover:scale-[1.01]"
              >
                {isEnqueuing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enqueuing {importedPlaylist.total_tracks} Independent Jobs...</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" />
                    <span>Download Entire Playlist ({importedPlaylist.total_tracks} Full Songs)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
