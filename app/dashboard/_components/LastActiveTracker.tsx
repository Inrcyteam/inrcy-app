"use client";

import { useEffect } from "react";

const ENDPOINT = "/api/profile/last-active";
const MIN_TOUCH_DELAY_MS = 5 * 60 * 1000;
const HEARTBEAT_DELAY_MS = 10 * 60 * 1000;

let memoryLastTouch = 0;

function touchLastActive(force = false) {
  if (typeof window === "undefined") return;
  if (!force && document.visibilityState === "hidden") return;

  const now = Date.now();

  if (!force && now - memoryLastTouch < MIN_TOUCH_DELAY_MS) return;

  memoryLastTouch = now;

  void fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Silence volontaire : une erreur réseau ne doit pas afficher d'erreur au pro.
  });
}

export default function LastActiveTracker() {
  useEffect(() => {
    touchLastActive();

    const interval = window.setInterval(() => touchLastActive(), HEARTBEAT_DELAY_MS);

    const handleFocus = () => touchLastActive();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        touchLastActive();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
