"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Track } from "@/types";
import { api } from "@/lib/api";
import { localMusicStorage } from "@/lib/storage";

interface AudioPlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isShuffle: boolean;
  repeatMode: "off" | "all" | "one";
  playQueue: Track[];
  playTrack: (track: Track, newQueue?: Track[]) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

interface AudioProgressContextType {
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  seek: (timeSeconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);
const AudioProgressContext = createContext<AudioProgressContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [playQueue, setPlayQueue] = useState<Track[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  const currentTrackRef = useRef<Track | null>(null);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = volume;

    const handleTimeUpdate = () => {
      const cur = audio.currentTime;
      setCurrentTime(cur);

      // Periodically save playback position every 5s to IndexedDB
      if (
        currentTrackRef.current &&
        Math.abs(cur - lastSavedPositionRef.current) > 5
      ) {
        lastSavedPositionRef.current = cur;
        localMusicStorage
          .savePlaybackPosition(currentTrackRef.current.id, cur)
          .catch(() => {});
      }
    };
    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration < 7200) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      handleTrackEnded();
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.pause();
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  const playTrack = useCallback(
    async (track: Track, newQueue?: Track[]) => {
      if (!audioRef.current) return;
      // Instant tactile feedback (0ms latency)
      setCurrentTrack(track);
      setIsPlaying(true);
      setCurrentTime(0);

      if (newQueue && newQueue.length > 0) {
        setPlayQueue(newQueue);
      } else {
        setPlayQueue((prev) =>
          prev.some((t) => t.id === track.id) ? prev : [...prev, track]
        );
      }

      // Pre-set duration from Spotify track metadata
      if (track.duration_ms && track.duration_ms > 0) {
        setDuration(Math.floor(track.duration_ms / 1000));
      }

      // Check if audio file is stored in local IndexedDB (100% offline playback)
      try {
        const localBlob = await localMusicStorage.getAudioBlob(track.id);
        if (localBlob) {
          if (currentBlobUrlRef.current) {
            URL.revokeObjectURL(currentBlobUrlRef.current);
          }
          const blobUrl = URL.createObjectURL(localBlob);
          currentBlobUrlRef.current = blobUrl;
          audioRef.current.src = blobUrl;
        } else {
          if (currentBlobUrlRef.current) {
            URL.revokeObjectURL(currentBlobUrlRef.current);
            currentBlobUrlRef.current = null;
          }
          const streamUrl = api.getStreamUrl(track.id);
          audioRef.current.src = streamUrl;

          // If track is marked as offline, fetch and save blob to IndexedDB in background
          if (track.is_offline && typeof window !== "undefined") {
            fetch(streamUrl)
              .then((res) => (res.ok ? res.blob() : null))
              .then((blob) => {
                if (blob) {
                  localMusicStorage.saveTrack(track, blob).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }

        // Restore playback position if available
        const savedPos = await localMusicStorage.getPlaybackPosition(track.id);
        if (
          savedPos > 5 &&
          track.duration_ms &&
          savedPos < track.duration_ms / 1000 - 10
        ) {
          audioRef.current.currentTime = savedPos;
          setCurrentTime(savedPos);
        }

        audioRef.current.play().catch((e) => {
          console.warn("Audio play interrupted:", e);
        });
      } catch (err) {
        console.warn("Playback error:", err);
      }
    },
    []
  );

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.warn);
    }
  }, [isPlaying, currentTrack]);

  const seek = useCallback((timeSeconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timeSeconds;
    setCurrentTime(timeSeconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(1, v));
    setVolumeState(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val > 0) setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const playNext = useCallback(() => {
    if (!playQueue.length || !currentTrack) return;
    const currentIndex = playQueue.findIndex((t) => t.id === currentTrack.id);
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * playQueue.length);
      playTrack(playQueue[randomIndex]);
      return;
    }
    if (currentIndex >= 0 && currentIndex < playQueue.length - 1) {
      playTrack(playQueue[currentIndex + 1]);
    } else if (repeatMode === "all") {
      playTrack(playQueue[0]);
    }
  }, [playQueue, currentTrack, isShuffle, repeatMode, playTrack]);

  const playPrevious = useCallback(() => {
    if (!audioRef.current || !playQueue.length || !currentTrack) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const currentIndex = playQueue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      playTrack(playQueue[currentIndex - 1]);
    } else {
      audioRef.current.currentTime = 0;
    }
  }, [playQueue, currentTrack, playTrack]);

  const handleTrackEnded = useCallback(() => {
    if (repeatMode === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.warn);
    } else {
      playNext();
    }
  }, [repeatMode, playNext]);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);

  const playerValue = React.useMemo(
    () => ({
      currentTrack,
      isPlaying,
      isShuffle,
      repeatMode,
      playQueue,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      toggleShuffle,
      toggleRepeat,
    }),
    [
      currentTrack,
      isPlaying,
      isShuffle,
      repeatMode,
      playQueue,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      toggleShuffle,
      toggleRepeat,
    ]
  );

  const progressValue = React.useMemo(
    () => ({
      currentTime,
      duration,
      volume,
      isMuted,
      seek,
      setVolume,
      toggleMute,
    }),
    [currentTime, duration, volume, isMuted, seek, setVolume, toggleMute]
  );

  return (
    <AudioPlayerContext.Provider value={playerValue}>
      <AudioProgressContext.Provider value={progressValue}>
        {children}
      </AudioProgressContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  }
  return context;
}

export function useAudioProgress() {
  const context = useContext(AudioProgressContext);
  if (!context) {
    throw new Error("useAudioProgress must be used within an AudioPlayerProvider");
  }
  return context;
}
