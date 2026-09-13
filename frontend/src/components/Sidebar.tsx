"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  ArrowDownCircle,
  HardDrive,
  ListMusic,
  Heart,
  Settings,
  Plus,
  Radio,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { Playlist, UserProfile } from "@/types";
import { useWebSocket } from "@/hooks/useWebSocket";

interface SidebarProps {
  onOpenPasteModal: () => void;
}

export function Sidebar({ onOpenPasteModal }: SidebarProps) {
  const pathname = usePathname();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeDownloadCount, setActiveDownloadCount] = useState(0);
  const { subscribe } = useWebSocket();

  const loadData = async () => {
    try {
      const [pls, u, summary] = await Promise.all([
        api.getPlaylists(),
        api.getUserProfile(),
        api.getQueueSummary(),
      ]);
      setPlaylists(pls);
      setUser(u);
      setActiveDownloadCount(summary.downloading_jobs + summary.pending_jobs);
    } catch (e) {
      console.warn("Failed loading sidebar data:", e);
    }
  };

  useEffect(() => {
    loadData();

    const unsubStatus = subscribe("JOB_STATUS_CHANGED", () => {
      api.getQueueSummary().then((s) => {
        setActiveDownloadCount(s.downloading_jobs + s.pending_jobs);
      }).catch(() => {});
    });

    const unsubImport = subscribe("PLAYLIST_IMPORTED", () => {
      api.getPlaylists().then(setPlaylists).catch(() => {});
    });

    const unsubBulk = subscribe("JOBS_ENQUEUED", () => {
      api.getQueueSummary().then((s) => {
        setActiveDownloadCount(s.downloading_jobs + s.pending_jobs);
      }).catch(() => {});
    });

    return () => {
      unsubStatus();
      unsubImport();
      unsubBulk();
    };
  }, [subscribe]);

  const navItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Search", href: "/search", icon: Search },
    {
      label: "Download Queue",
      href: "/queue",
      icon: ArrowDownCircle,
      badge: activeDownloadCount > 0 ? activeDownloadCount : null,
    },
    { label: "Offline Library", href: "/offline", icon: HardDrive },
    { label: "Your Playlists", href: "/#playlists", icon: ListMusic },
    { label: "Liked Songs", href: "/offline", icon: Heart },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex w-64 flex-shrink-0 flex-col h-full rounded-[22px] liquid-glass p-3.5 gap-3 select-none overflow-hidden relative">
      {/* Brand Header */}
      <div className="px-2 pt-1 pb-1 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shadow-[0_0_20px_rgba(30,215,96,0.25)] group-hover:scale-105 transition-transform">
            <Radio className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white">
                Aura Stream
              </span>
              <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-white/[0.08] text-white/70 border border-white/[0.06]">
                BETA
              </span>
            </div>
            <span className="text-[11px] text-white/40 block font-normal">
              Your Music. Offline.
            </span>
          </div>
        </Link>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : item.href.startsWith("/#")
              ? false
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group ${
                isActive
                  ? "bg-accent/[0.12] text-white font-semibold"
                  : "text-white/65 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {/* Thin green left accent indicator for active nav item only */}
              {isActive && (
                <div className="absolute left-1.5 top-2.5 bottom-2.5 w-1 bg-accent rounded-full shadow-[0_0_8px_rgba(30,215,96,0.7)]" />
              )}
              <div className="flex items-center gap-3 ml-1">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? "text-accent" : "text-white/60 group-hover:text-white"
                  }`}
                />
                <span className={isActive ? "text-white font-semibold" : "text-white/80"}>
                  {item.label}
                </span>
              </div>
              {Boolean(item.badge) && (
                <span className="bg-white/[0.08] text-white/80 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/[0.06]">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Playlists Section */}
      <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[11px] font-semibold text-white/50 tracking-wider">
            Your Playlists
          </span>
          <button
            onClick={onOpenPasteModal}
            title="Import Spotify Playlist"
            className="w-5 h-5 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable Playlists List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
          {playlists.map((pl) => {
            const isPlActive = pathname === `/playlist/${pl.id}`;
            return (
              <Link
                key={pl.id}
                href={`/playlist/${pl.id}`}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-xl text-xs transition-all group ${
                  isPlActive
                    ? "bg-accent/[0.08] text-white border border-accent/25"
                    : "text-white/60 hover:text-white hover:bg-white/[0.035]"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex-shrink-0 overflow-hidden relative border border-white/[0.08]">
                  {pl.artwork_url ? (
                    <img
                      src={pl.artwork_url}
                      alt={pl.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40">
                      <ListMusic className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
                <div className="truncate flex-1">
                  <div
                    className={`font-medium truncate ${
                      isPlActive ? "text-white font-semibold" : "text-white/80"
                    }`}
                  >
                    {pl.title}
                  </div>
                  <div className="text-[10px] text-white/40 truncate">
                    {pl.total_tracks} tracks
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {playlists.length > 4 && (
          <div className="pt-1 px-2">
            <span className="text-[11px] text-white/40 hover:text-white/70 flex items-center gap-1 cursor-pointer transition-colors">
              Show more <ChevronDown className="w-3 h-3" />
            </span>
          </div>
        )}
      </div>

      {/* User Profile Card (Mockup Bottom) */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              src={
                user?.avatar_url ||
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
              }
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover border border-white/10"
            />
          </div>
          <div className="truncate flex-1">
            <div className="font-semibold text-xs text-white truncate">
              {user?.display_name || "Shashank Suvarna"}
            </div>
            <div className="text-[10px] text-accent flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>Spotify Connected</span>
            </div>
          </div>
        </div>
        <Link
          href="/settings"
          className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </aside>
  );
}
