"use client";

import { useState, useEffect } from "react";

export interface NetworkStatus {
  isOnline: boolean;
  isBackendReachable: boolean;
  isOfflineMode: boolean;
  showBanner: boolean;
  dismissBanner: () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(true);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
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
      if (!navigator.onLine) {
        setIsBackendReachable(false);
        return;
      }
      try {
        const res = await fetch("http://localhost:8000/api/auth/me", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        setIsBackendReachable(res.ok);
      } catch {
        setIsBackendReachable(false);
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const isOfflineMode = !isOnline || !isBackendReachable;

  return {
    isOnline,
    isBackendReachable,
    isOfflineMode,
    showBanner,
    dismissBanner: () => setShowBanner(false),
  };
}
