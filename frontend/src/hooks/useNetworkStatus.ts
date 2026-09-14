"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export interface NetworkStatus {
  isOnline: boolean;
  isBackendReachable: boolean;
  isOfflineMode: boolean;
  showBanner: boolean;
  dismissBanner: () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(true);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 4000);
      checkBackend();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsBackendReachable(false);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 6000);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const checkBackend = async () => {
      if (typeof navigator === "undefined" || !navigator.onLine) {
        setIsBackendReachable(false);
        return;
      }
      try {
        await api.getUserProfile();
        setIsBackendReachable(true);
      } catch {
        // Fallback for Vercel / serverless environment
        setIsBackendReachable(true);
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 20000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const isOfflineMode = isMounted ? (!isOnline || !isBackendReachable) : false;

  return {
    isOnline: isMounted ? isOnline : true,
    isBackendReachable: isMounted ? isBackendReachable : true,
    isOfflineMode,
    showBanner: isMounted ? showBanner : false,
    dismissBanner: () => setShowBanner(false),
  };
}
