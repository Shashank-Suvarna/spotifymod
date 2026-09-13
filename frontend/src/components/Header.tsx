"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Search,
  Bell,
  Radio,
} from "lucide-react";
import { api } from "@/lib/api";
import { UserProfile } from "@/types";

interface HeaderProps {
  onOpenPasteModal: () => void;
}

export function Header({ onOpenPasteModal }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadUser = async () => {
    try {
      const u = await api.getUserProfile();
      setUser(u);
    } catch (e) {
      console.warn(e);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleConnectSpotify = async () => {
    try {
      const res = await api.getSpotifyLoginUrl();
      if (res.auth_url) {
        window.location.href = res.auth_url;
      }
    } catch (e) {
      await api.demoLogin();
      loadUser();
    }
  };

  return (
    <header className="hidden md:flex h-14 px-5 items-center justify-between sticky top-0 z-30 select-none bg-black/40 backdrop-blur-md border-b border-white/[0.06] flex-shrink-0">
      {/* Left Group: Back / Forward / Search (Requirement 7) */}
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/[0.06]"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.forward()}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/[0.06]"
            title="Go forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Global Floating Translucent Capsule Search (Wider, Requirement 7) */}
        <form onSubmit={handleSearchSubmit} className="relative w-72 sm:w-80 md:w-96 max-w-md">
          <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search songs, artists, playlists..."
            className="w-full bg-white/[0.045] hover:bg-white/[0.07] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 pl-9 pr-4 py-2 rounded-full border border-white/[0.08] focus:border-accent/60 focus:outline-none focus:shadow-[0_0_20px_rgba(30,215,96,0.15)] transition-all"
          />
        </form>
      </div>

      {/* Right Group: Paste URL / Connect Spotify / Notifications / Profile (Requirement 7) */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {/* Paste Spotify Playlist URL Capsule Button */}
        <button
          onClick={onOpenPasteModal}
          className="flex items-center gap-2 bg-white/[0.045] hover:bg-white/[0.08] text-white/85 hover:text-white text-xs font-medium px-3.5 py-1.5 rounded-full border border-white/[0.08] transition-all group"
        >
          <LinkIcon className="w-3.5 h-3.5 text-accent group-hover:rotate-45 transition-transform" />
          <span className="hidden sm:inline">Paste Spotify URL</span>
          <span className="sm:hidden">Import</span>
        </button>

        {/* Connect Spotify Button (Requirement 7: dark glass + green border/highlight, NOT solid green) */}
        {user?.is_spotify_connected ? (
          <div className="flex items-center gap-1.5 bg-[#121212]/80 border border-accent/40 text-accent text-xs font-semibold px-3 py-1.5 rounded-full shadow-[0_0_12px_rgba(30,215,96,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>Connected</span>
          </div>
        ) : (
          <button
            onClick={handleConnectSpotify}
            className="flex items-center gap-2 bg-white/[0.045] hover:bg-white/[0.08] border border-white/[0.10] text-white text-xs font-medium px-3.5 py-1.5 rounded-full transition-all hover:border-accent/50"
          >
            <Radio className="w-3.5 h-3.5 text-accent" />
            <span>Connect Spotify</span>
          </button>
        )}

        {/* Notifications Bell */}
        <button
          className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white flex items-center justify-center transition-colors border border-white/[0.06]"
          title="Notifications"
        >
          <Bell className="w-3.5 h-3.5" />
        </button>

        {/* User Profile Avatar */}
        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/15 flex-shrink-0 cursor-pointer hover:border-accent/50 transition-colors">
          <img
            src={
              user?.avatar_url ||
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
            }
            alt="Profile"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </header>
  );
}
