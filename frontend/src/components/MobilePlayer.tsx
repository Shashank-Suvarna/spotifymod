"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ChevronDown,
  Volume2,
  VolumeX,
  ListMusic,
} from "lucide-react";
import { useAudioPlayer, useAudioProgress } from "@/hooks/useAudioPlayer";
import { api } from "@/lib/api";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function MobilePlayer() {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    currentTrack,
    isPlaying,
    isShuffle,
    repeatMode,
    togglePlay,
    playNext,
    playPrevious,
    toggleShuffle,
    toggleRepeat,
  } = useAudioPlayer();

  const {
    currentTime,
    duration,
    volume,
    isMuted,
    seek,
    setVolume,
    toggleMute,
  } = useAudioProgress();

  if (!currentTrack) return null;

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.toggleFavorite(currentTrack.id);
      currentTrack.is_favorite = !currentTrack.is_favorite;
    } catch (err) {
      console.warn(err);
    }
  };
  const effectiveDuration =
    currentTrack?.duration_ms && currentTrack.duration_ms > 0
      ? Math.floor(currentTrack.duration_ms / 1000)
      : duration && isFinite(duration) && duration < 7200
      ? duration
      : 0;

  const clampedCurrentTime =
    effectiveDuration > 0
      ? Math.min(Math.max(0, currentTime), effectiveDuration)
      : Math.max(0, currentTime);

  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, (clampedCurrentTime / effectiveDuration) * 100)
      : 0;

  return (
    <>
      {/* 1. MINI PLAYER: Floating Docked above bottom navigation */}
      <div
        className="fixed left-2 right-2 z-[45] md:hidden select-none transition-transform duration-200"
        style={{
          bottom: "calc(58px + env(safe-area-inset-bottom, 8px))",
        }}
      >
        <div
          onClick={() => setIsExpanded(true)}
          className="h-14 rounded-2xl bg-[#141414]/95 backdrop-blur-2xl border border-white/[0.12] shadow-2xl flex items-center justify-between px-3 gap-3 cursor-pointer active:scale-[0.99] transition-transform"
        >
          {/* Progress thin bar along top of mini player */}
          <div className="absolute top-0 left-3 right-3 h-[2px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Left: Thumbnail Artwork + Track Title & Artist */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/[0.04] flex-shrink-0 border border-white/[0.10] shadow-sm">
              <img
                src={
                  currentTrack.artwork_url ||
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=80&h=80&fit=crop"
                }
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate">
                {currentTrack.title}
              </div>
              <div className="text-[10px] text-white/50 truncate">
                {currentTrack.artist_name}
              </div>
            </div>
          </div>

          {/* Right: Like + Play/Pause + Next */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleFavoriteToggle}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 active:text-accent transition-colors"
              aria-label="Like"
            >
              <Heart
                className={`w-4 h-4 ${
                  currentTrack.is_favorite ? "fill-accent text-accent" : ""
                }`}
              />
            </button>

            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center transition-transform active:scale-95 shadow-md"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-black" />
              ) : (
                <Play className="w-4 h-4 fill-black translate-x-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 active:text-white transition-colors"
              aria-label="Next track"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. FULL-SCREEN PLAYER SHEET */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 md:hidden flex flex-col justify-between bg-black/95 backdrop-blur-3xl text-white select-none animate-in slide-in-from-bottom duration-300"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 16px), 20px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 16px), 24px)",
            paddingLeft: "24px",
            paddingRight: "24px",
          }}
        >
          {/* Top Bar: Dismiss Chevron & Header Label */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(false)}
              className="w-11 h-11 rounded-full bg-white/[0.06] active:bg-white/[0.12] flex items-center justify-center text-white/70 active:text-white transition-all border border-white/[0.08]"
              aria-label="Close full player"
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            <div className="text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 block">
                PLAYING FROM OFFLINE VAULT
              </span>
              <span className="text-xs font-semibold text-white/80 truncate max-w-[200px] block">
                {currentTrack.album_name || "Aura Stream"}
              </span>
            </div>

            <div className="w-11 h-11" />
          </div>

          {/* Center: Large Artwork with Dynamic Ambient Glow */}
          <div className="relative my-auto flex items-center justify-center py-4">
            {/* Artwork ambient backlight */}
            <div
              className="absolute w-64 h-64 rounded-3xl bg-cover bg-center filter blur-3xl opacity-30 scale-105"
              style={{
                backgroundImage: `url(${
                  currentTrack.artwork_url ||
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop"
                })`,
              }}
            />
            {/* Main Rounded Artwork */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/[0.12]">
              <img
                src={
                  currentTrack.artwork_url ||
                  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop"
                }
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Track Info: Title & Artist & Favorite */}
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0 flex-1 pr-3">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                {currentTrack.title}
              </h2>
              <p className="text-sm font-medium text-white/60 truncate mt-0.5">
                {currentTrack.artist_name}
              </p>
            </div>
            <button
              onClick={handleFavoriteToggle}
              className="w-11 h-11 rounded-full bg-white/[0.06] active:bg-white/[0.15] flex items-center justify-center transition-all border border-white/[0.08]"
              aria-label="Like track"
            >
              <Heart
                className={`w-5 h-5 ${
                  currentTrack.is_favorite ? "fill-accent text-accent" : "text-white/60"
                }`}
              />
            </button>
          </div>

          {/* Interactive Scrub Bar & Timestamps */}
          <div className="mb-4">
            <div className="relative flex items-center group py-2">
              <input
                type="range"
                min="0"
                max={effectiveDuration || 100}
                value={clampedCurrentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/15 rounded-full appearance-none cursor-pointer accent-accent"
              />
            </div>
            <div className="flex justify-between text-xs text-white/40 font-mono mt-1">
              <span>{formatTime(clampedCurrentTime)}</span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          {/* Primary Controls: Shuffle, Prev, Play/Pause, Next, Repeat */}
          <div className="flex items-center justify-between mb-6 px-2">
            <button
              onClick={toggleShuffle}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                isShuffle ? "text-accent" : "text-white/40 active:text-white"
              }`}
              aria-label="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={playPrevious}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 active:text-white active:scale-95 transition-all"
              aria-label="Previous"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-accent text-black flex items-center justify-center shadow-[0_0_35px_rgba(30,215,96,0.4)] active:scale-95 transition-transform"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-black" />
              ) : (
                <Play className="w-8 h-8 fill-black translate-x-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 active:text-white active:scale-95 transition-all"
              aria-label="Next"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                repeatMode !== "off" ? "text-accent" : "text-white/40 active:text-white"
              }`}
              aria-label="Repeat"
            >
              {repeatMode === "one" ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Bottom Row: Audio Quality Badge & Volume */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] text-xs text-white/50">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[11px] text-white/70">
                {currentTrack.bitrate_kbps ? `${currentTrack.bitrate_kbps}kbps MP3` : "320kbps MP3"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-white/50 hover:text-white"
                aria-label="Mute/Unmute"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20 h-1 bg-white/20 rounded-full appearance-none accent-accent cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
