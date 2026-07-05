"use client";

import { useEffect } from "react";
import { purgeAllBrowserAccountCaches } from "@/lib/browserAccountCache";
import { ACTIVE_INRCY_ACCOUNT_STORAGE_KEY } from "@/lib/multicompte/constants";

/**
 * Keeps several open iNrCy tabs on the same active establishment.
 * A switch in one tab updates localStorage, which emits a `storage` event
 * in the other tabs. Those tabs purge their own session caches before reload.
 */
export default function ActiveAccountTabSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVE_INRCY_ACCOUNT_STORAGE_KEY) return;

      purgeAllBrowserAccountCaches();
      window.location.reload();
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return null;
}
