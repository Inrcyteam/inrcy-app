"use client";

import { useEffect } from "react";

export default function ImapKickoff() {
  useEffect(() => {
    // 1 fois par session navigateur
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("imap_sync_kickoff")) return;

    sessionStorage.setItem("imap_sync_kickoff", "1");

    fetch("/api/inbox/sync-now", { method: "POST" }).catch(() => {
      // silencieux (pas bloquant UX)
    });
  }, []);

  return null;
}


