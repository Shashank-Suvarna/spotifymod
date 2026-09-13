"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  ArrowDownCircle,
  HardDrive,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [activeJobsCount, setActiveJobsCount] = useState<number>(0);
  const { subscribe } = useWebSocket();

  const fetchSummary = async () => {
    try {
      const summary = await api.getQueueSummary();
      setActiveJobsCount(summary.downloading_jobs + summary.pending_jobs);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSummary();
    const unsub = subscribe("JOB_STATUS_CHANGED", fetchSummary);
    return () => unsub();
  }, [subscribe]);

  const navItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Search", href: "/search", icon: Search },
    {
      label: "Downloads",
      href: "/queue",
      icon: ArrowDownCircle,
      badge: activeJobsCount > 0 ? activeJobsCount : undefined,
    },
    { label: "Library", href: "/offline", icon: HardDrive },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-black/90 backdrop-blur-2xl border-t border-white/[0.08] px-2 select-none"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom, 8px), 10px)",
        paddingTop: "8px",
      }}
      aria-label="Mobile Navigation"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center min-h-[44px] py-1 transition-all rounded-xl relative group ${
                isActive
                  ? "text-accent"
                  : "text-white/50 hover:text-white active:scale-95"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? "scale-110 stroke-[2.2]" : "stroke-[1.8]"
                  }`}
                />
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] rounded-full bg-accent text-black font-extrabold text-[9px] flex items-center justify-center px-1 shadow-sm animate-pulse">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium tracking-tight ${
                  isActive ? "font-bold text-accent" : "text-white/50"
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-6 h-[2px] rounded-full bg-accent shadow-[0_0_8px_rgba(30,215,96,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
