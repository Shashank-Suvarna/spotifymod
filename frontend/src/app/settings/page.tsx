"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  Sliders,
  HardDrive,
  Key,
  CheckCircle2,
  LogOut,
  Sparkles,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { UserProfile, QueueSummary } from "@/types";
import { localMusicStorage, StorageEstimateInfo } from "@/lib/storage";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function SettingsPage() {
  const [concurrency, setConcurrency] = useState(3);
  const [audioQuality, setAudioQuality] = useState("320kbps MP3 (HQ)");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const loadData = async () => {
    try {
      const [u, s, st] = await Promise.all([
        api.getUserProfile().catch(() => null),
        api.getQueueSummary().catch(() => null),
        localMusicStorage.estimateStorage().catch(() => null),
      ]);
      if (u) setUser(u);
      if (s) {
        setSummary(s);
        setConcurrency(s.concurrency_limit || 3);
      }
      if (st) setStorageInfo(st);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async () => {
    try {
      await api.updateSettings({
        concurrency_limit: concurrency,
        audio_quality: audioQuality,
      });
      setSaveStatus("Settings updated successfully!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleToggleDemo = async () => {
    if (user?.is_spotify_connected) {
      const u = await api.disconnectSpotify();
      setUser(u);
    } else {
      const u = await api.demoLogin();
      setUser(u);
    }
  };

  const handleClearAllStorage = async () => {
    try {
      await localMusicStorage.clearAllOfflineStorage();
      await api.bulkControl("clear-completed").catch(() => {});
      setIsConfirmingClear(false);
      setSaveStatus("Local offline music cleared successfully.");
      const st = await localMusicStorage.estimateStorage();
      setStorageInfo(st);
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 flex flex-col gap-6 max-w-4xl mx-auto pb-24">
      {/* Title Header */}
      <div className="glass-surface-primary rounded-[22px] border border-white/[0.08] p-5 sm:p-6 flex items-center gap-4 shadow-glass">
        <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shadow-glow-subtle flex-shrink-0">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-white/50 mt-0.5">
            Configure download concurrency, audio quality, storage, and connection profiles.
          </p>
        </div>
      </div>

      {saveStatus && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* 1. Storage Management Section (Requirement 17) */}
      <div className="glass-surface-subtle rounded-[22px] border border-white/[0.08] p-5 sm:p-6 flex flex-col gap-4 shadow-glass">
        <div className="flex items-center gap-2.5 text-xs font-bold text-white border-b border-white/[0.06] pb-3 uppercase tracking-wider">
          <HardDrive className="w-4 h-4 text-accent" />
          <span>Device Storage Management</span>
        </div>

        {/* Storage Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
            <span className="text-[10px] font-semibold uppercase text-white/40 block mb-1">
              Downloaded Music
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatBytes(storageInfo?.usedBytes || 0)}
            </span>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
            <span className="text-[10px] font-semibold uppercase text-white/40 block mb-1">
              Downloaded Tracks
            </span>
            <span className="text-lg font-black text-accent font-mono">
              {storageInfo?.trackCount || 0} songs
            </span>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
            <span className="text-[10px] font-semibold uppercase text-white/40 block mb-1">
              Available Storage
            </span>
            <span className="text-lg font-black text-white/80 font-mono">
              {formatBytes(
                storageInfo?.quotaBytes && storageInfo.quotaBytes > (storageInfo.usedBytes || 0)
                  ? storageInfo.quotaBytes - (storageInfo.usedBytes || 0)
                  : 82 * 1024 * 1024 * 1024
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-white/50">
            Clear all offline audio files and cached metadata from this local device.
          </p>
          <button
            onClick={() => setIsConfirmingClear(true)}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Downloads</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmingClear && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl glass-modal p-6 border border-white/10 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Remove this music from this device?
                </h3>
                <span className="text-xs text-white/50">This action cannot be undone.</span>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              This will permanently delete all downloaded audio files and metadata from this device's offline storage.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIsConfirmingClear(false)}
                className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white/70 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllStorage}
                className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-xs font-bold text-white shadow-lg shadow-red-500/30 transition-all active:scale-95"
              >
                Remove Music
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Download Queue Engine Settings */}
      <div className="glass-surface-subtle rounded-[22px] border border-white/[0.08] p-5 sm:p-6 flex flex-col gap-5 shadow-glass">
        <div className="flex items-center gap-2.5 text-xs font-bold text-white border-b border-white/[0.06] pb-3 uppercase tracking-wider">
          <Sliders className="w-4 h-4 text-accent" />
          <span>Download Queue Engine</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-semibold text-white">
                Max Concurrent Track Downloads
              </div>
              <div className="text-[11px] text-white/40">
                Number of simultaneous independent worker threads downloading tracks.
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-accent bg-accent/10 border border-accent/20 px-3 py-0.5 rounded-full">
              {concurrency} workers
            </span>
          </div>

          <input
            type="range"
            min="1"
            max="10"
            value={concurrency}
            onChange={(e) => setConcurrency(parseInt(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-white/40 font-mono mt-1.5">
            <span>1 (Conservative)</span>
            <span>3 (Balanced - Recommended)</span>
            <span>10 (High Throughput)</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="text-xs font-semibold text-white">Audio Quality Preset</div>
            <div className="text-[11px] text-white/40">
              Bitrate and ID3v2 tagging format for downloaded files.
            </div>
          </div>
          <select
            value={audioQuality}
            onChange={(e) => setAudioQuality(e.target.value)}
            className="bg-white/[0.04] text-white text-xs border border-white/[0.08] rounded-xl px-3 py-1.5 focus:border-accent focus:outline-none cursor-pointer"
          >
            <option value="320kbps MP3 (HQ)" className="bg-[#121212]">320 kbps MP3 (HQ ID3v2.4)</option>
            <option value="256kbps MP3" className="bg-[#121212]">256 kbps MP3 (Standard)</option>
            <option value="128kbps MP3" className="bg-[#121212]">128 kbps MP3 (Compact)</option>
          </select>
        </div>

        <button
          onClick={handleSaveSettings}
          className="self-end bg-accent hover:bg-accent-hover text-black font-bold text-xs px-4 py-2 rounded-full transition-all shadow-glow-btn hover:scale-105 active:scale-95"
        >
          Save Preferences
        </button>
      </div>

      {/* 3. Spotify Credentials & Account */}
      <div className="glass-surface-subtle rounded-[22px] border border-white/[0.08] p-5 sm:p-6 flex flex-col gap-5 shadow-glass">
        <div className="flex items-center gap-2.5 text-xs font-bold text-white border-b border-white/[0.06] pb-3 uppercase tracking-wider">
          <Key className="w-4 h-4 text-accent" />
          <span>Spotify Authentication</span>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block mb-1">
              Active Spotify Client ID
            </label>
            <input
              type="text"
              readOnly
              value="cEYpjA9oz9GiPac4AsH4n"
              className="w-full bg-white/[0.03] text-xs text-white/70 font-mono px-3.5 py-2 rounded-xl border border-white/[0.06] select-all"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <div className="text-xs font-semibold text-white">Account Status</div>
              <div className="text-[11px] text-white/40">
                {user?.is_spotify_connected
                  ? `Connected as ${user.display_name}`
                  : "Using demo / guest profile"}
              </div>
            </div>

            <button
              onClick={handleToggleDemo}
              className={`flex items-center gap-2 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all ${
                user?.is_spotify_connected
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/25"
                  : "bg-accent hover:bg-accent-hover text-black shadow-glow-btn hover:scale-105"
              }`}
            >
              {user?.is_spotify_connected ? (
                <>
                  <LogOut className="w-3 h-3" />
                  <span>Disconnect</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 fill-current" />
                  <span>Connect Demo Profile</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
