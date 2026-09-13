"use client";

import React from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
  CheckCircle2,
  Radio,
  Maximize2,
} from "lucide-react";
import { useAudioPlayer, useAudioProgress } from "@/hooks/useAudioPlayer";
import { api } from "@/lib/api";
import { MobilePlayer } from "./MobilePlayer";

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function Player() {
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

  const handleFavoriteToggle = async () => {
    if (!currentTrack) return;
    try {
      await api.toggleFavorite(currentTrack.id);
      currentTrack.is_favorite = !currentTrack.is_favorite;
    } catch (e) {
      console.warn(e);
    }
  };

  const effectiveDuration =
    currentTrack?.duration_ms && currentTrack.duration_ms > 0
      ? Math.floor(currentTrack.duration_ms / 1000)
      : duration && isFinite(duration) && duration < 7200
      ? duration
      : 0;

  const clampedCurrentTime =
    effectiveDuration > 0 ? Math.min(Math.max(0, currentTime), effectiveDuration) : Math.max(0, currentTime);

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (clampedCurrentTime / effectiveDuration) * 100) : 0;

  return (
    <>
      {/* Mobile-dedicated Player (Mini-dock + Fullscreen Sheet) */}
      <MobilePlayer />

      {/* Desktop Floating Glass Music Player */}
      <footer className="hidden md:flex fixed bottom-[12px] left-[14px] right-[14px] h-[76px] rounded-[22px] liquid-glass px-5 items-center justify-between z-50 select-none">
      {/* 1. Track Info (Left) */}
      <div className="flex items-center gap-3 min-w-0 w-1/4 pr-2">
        {currentTrack ? (
          <>
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.05] flex-shrink-0 relative border border-white/[0.08] shadow-md group">
              {currentTrack.artwork_url ? (
                <img
                  src={currentTrack.artwork_url}
                  alt={currentTrack.title}
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    isPlaying ? "scale-105" : "scale-100"
                  }`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40">
                  <Radio className="w-5 h-5 text-accent" />
                </div>
              )}
            </div>

            <div className="truncate flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white truncate hover:underline cursor-pointer">
                  {currentTrack.title}
                </span>
                <button
                  onClick={handleFavoriteToggle}
                  className={`p-0.5 rounded-full transition-colors flex-shrink-0 ${
                    currentTrack.is_favorite
                      ? "text-accent"
                      : "text-white/40 hover:text-white"
                  }`}
                  title={currentTrack.is_favorite ? "Favorited" : "Favorite"}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      currentTrack.is_favorite ? "fill-accent text-accent" : ""
                    }`}
                  />
                </button>
              </div>
              <div className="text-[11px] text-white/50 truncate hover:underline cursor-pointer">
                {currentTrack.artist_name}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-white/40 text-xs">
            <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <Radio className="w-5 h-5 text-white/30" />
            </div>
            <div>
              <div className="font-medium text-white/80">No Track Playing</div>
              <div className="text-[11px] text-white/40">Select a song to start</div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Controls & Scrub Bar (Center) */}
      <div className="flex flex-col items-center justify-center gap-1.5 max-w-xl w-full mx-auto px-4">
        {/* Buttons Row */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={`p-1 transition-colors ${
              isShuffle ? "text-accent" : "text-white/50 hover:text-white"
            }`}
            title={isShuffle ? "Shuffle On" : "Shuffle Off"}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={playPrevious}
            disabled={!currentTrack}
            className="text-white/70 hover:text-white disabled:opacity-25 transition-colors p-1"
            title="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          {/* Large Circular Play/Pause Button with Emerald Glow (Requirement 13) */}
          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 shadow-[0_0_22px_rgba(30,215,96,0.35)]"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black translate-x-0.5" />
            )}
          </button>

          <button
            onClick={playNext}
            disabled={!currentTrack}
            className="text-white/70 hover:text-white disabled:opacity-25 transition-colors p-1"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-1 transition-colors ${
              repeatMode !== "off" ? "text-accent" : "text-white/50 hover:text-white"
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Scrub Bar */}
        <div className="w-full flex items-center gap-2.5 text-[10px] text-white/50 font-mono group">
          <span className="w-8 text-right">{formatTime(clampedCurrentTime)}</span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min="0"
              max={effectiveDuration || 100}
              value={clampedCurrentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer group-hover:h-1.5 transition-all"
              style={{
                background: `linear-gradient(to right, #1ED760 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`,
              }}
            />
          </div>
          <span className="w-8 text-left">{formatTime(effectiveDuration)}</span>
        </div>
      </div>

      {/* 3. Extra Controls & Volume (Right) */}
      <div className="flex items-center justify-end gap-3 w-1/4 pl-2">
        <Link
          href="/queue"
          className="text-white/50 hover:text-white transition-colors p-1"
          title="Download Queue"
        >
          <ListMusic className="w-4 h-4" />
        </Link>

        {/* Volume Controls */}
        <div className="flex items-center gap-1.5 group">
          <button
            onClick={toggleMute}
            className="text-white/50 hover:text-white transition-colors p-1"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer group-hover:h-1.5 transition-all"
            style={{
              background: `linear-gradient(to right, #1ED760 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>

        {/* Fullscreen Button */}
        <button
          className="text-white/50 hover:text-white transition-colors p-1 hidden sm:block"
          title="Fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Audio Quality Pill (Requirement 13) */}
        <span className="text-[10px] text-white/50 font-mono bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
          320k MP3
        </span>
      </div>
    </footer>
    </>
  );
}
