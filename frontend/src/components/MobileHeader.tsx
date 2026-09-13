"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Link as LinkIcon, Radio, Wifi, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface MobileHeaderProps {
  onOpenPasteModal: () => void;
}

export function MobileHeader({ onOpenPasteModal }: MobileHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isSubPage = pathname !== "/";
  const { isOfflineMode } = useNetworkStatus();

  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-black/85 backdrop-blur-xl border-b border-white/[0.08] select-none"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Left: Back button or App Brand */}
      <div className="flex items-center gap-2">
        {isSubPage ? (
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/[0.06] active:bg-white/[0.12] text-white flex items-center justify-center transition-all border border-white/[0.08] active:scale-95"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <span className="text-sm font-black tracking-tight text-white">
              AURA STREAM
            </span>
          </div>
        )}
      </div>

      {/* Right: Network Status Pill & Import URL */}
      <div className="flex items-center gap-2">
        {/* Subtle Network status pill */}
        <div
          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            isOfflineMode
              ? "bg-amber-500/10 text-amber-300 border-amber-500/25"
              : "bg-accent/10 text-accent border-accent/20"
          }`}
        >
          {isOfflineMode ? (
            <>
              <WifiOff className="w-3 h-3 text-amber-300" />
              <span>Offline</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>Online</span>
            </>
          )}
        </div>

        {/* Import Playlist Modal Button */}
        <button
          onClick={onOpenPasteModal}
          className="w-9 h-9 rounded-full bg-white/[0.06] active:bg-white/[0.15] text-white/80 active:text-white flex items-center justify-center transition-all border border-white/[0.08] active:scale-95"
          title="Paste Spotify URL"
          aria-label="Paste Spotify URL"
        >
          <LinkIcon className="w-4 h-4 text-accent" />
        </button>
      </div>
    </header>
  );
}
