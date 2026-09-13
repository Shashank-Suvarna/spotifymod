"use client";

import "./globals.css";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AudioPlayerProvider, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Player } from "@/components/Player";
import { PastePlaylistModal } from "@/components/PastePlaylistModal";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { Wifi, WifiOff } from "lucide-react";

function KeyboardShortcutHandler() {
  const { togglePlay, playNext, playPrevious } = useAudioPlayer();
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting keystrokes when user is typing in form inputs
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        playNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        playPrevious();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, playNext, playPrevious, router]);

  return null;
}

function NetworkStatusToast() {
  const { isOfflineMode, showBanner, dismissBanner } = useNetworkStatus();

  if (!showBanner) return null;

  return (
    <div
      onClick={dismissBanner}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-xl text-xs font-semibold select-none cursor-pointer animate-in slide-in-from-top-4 duration-200 ${
        isOfflineMode
          ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
          : "bg-accent/15 border-accent/40 text-accent"
      }`}
    >
      {isOfflineMode ? (
        <>
          <WifiOff className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span>Offline Mode — Your downloaded music is available</span>
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5 text-accent" />
          <span>Back Online — Connected to Aura Stream server</span>
        </>
      )}
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  // Register PWA Service Worker
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("Aura Stream SW registered"))
        .catch((err) => console.warn("SW registration error:", err));
    }
  }, []);

  return (
    <html lang="en" className="dark">
      <head>
        <title>Aura Stream - Your Music. Offline.</title>
        <meta
          name="description"
          content="Unified Desktop and Mobile Spotify offline music application with independent per-track download queue."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="bg-black text-white h-[100dvh] flex flex-col overflow-hidden antialiased select-none relative font-sans">
        {/* Subtle Ambient Radial Lighting */}
        <div
          className="pointer-events-none fixed -top-20 right-12 w-[550px] h-[450px] bg-accent/[0.038] rounded-full blur-[150px] z-0"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed top-1/3 -left-20 w-[420px] h-[450px] bg-accent/[0.030] rounded-full blur-[140px] z-0"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed -bottom-24 left-1/3 w-[650px] h-[280px] bg-accent/[0.035] rounded-full blur-[150px] z-0"
          aria-hidden="true"
        />

        <AudioPlayerProvider>
          <KeyboardShortcutHandler />
          <NetworkStatusToast />

          {/* Dedicated Mobile Header (Screens < 768px) */}
          <MobileHeader onOpenPasteModal={() => setIsPasteModalOpen(true)} />

          {/* Main App Workspace */}
          <div className="flex flex-1 min-h-0 w-full relative z-10 md:p-3 md:pb-[94px] md:gap-3">
            {/* Desktop Left Sidebar (>= 768px/1024px) */}
            <Sidebar onOpenPasteModal={() => setIsPasteModalOpen(true)} />

            {/* Main Center Panel (Desktop: Floating Obsidian Panel, Mobile: Full Bleed) */}
            <div className="flex-1 flex flex-col min-w-0 md:rounded-[22px] overflow-hidden md:obsidian-panel relative bg-black md:bg-[#090909]">
              {/* Desktop Header (>= 768px) */}
              <Header onOpenPasteModal={() => setIsPasteModalOpen(true)} />

              <main className="flex-1 min-h-0 overflow-hidden relative pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0">
                {children}
              </main>
            </div>
          </div>

          {/* Music Player (Desktop Floating Glass Dock + Mobile Mini/Fullscreen Player) */}
          <Player />

          {/* Dedicated Mobile Bottom Navigation Bar (Screens < 768px) */}
          <MobileBottomNav />

          {/* Paste Playlist URL Modal */}
          <PastePlaylistModal
            isOpen={isPasteModalOpen}
            onClose={() => setIsPasteModalOpen(false)}
          />
        </AudioPlayerProvider>
      </body>
    </html>
  );
}
