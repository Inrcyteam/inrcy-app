"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type NavigationAction = () => void | Promise<void>;

export type DashboardExitGuardRegistration = {
  id: string;
  shouldBlock: () => boolean;
  confirmExit: () => Promise<boolean>;
};

type StoredGuard = DashboardExitGuardRegistration & {
  sequence: number;
  token: symbol;
};

type DashboardUnsavedNavigationContextValue = {
  registerGuard: (guard: DashboardExitGuardRegistration) => () => void;
  requestNavigation: (action: NavigationAction) => Promise<boolean>;
  hasBlockingGuard: () => boolean;
};

const DashboardUnsavedNavigationContext =
  createContext<DashboardUnsavedNavigationContextValue | null>(null);

const FALLBACK_CONTEXT: DashboardUnsavedNavigationContextValue = {
  registerGuard: () => () => {},
  requestNavigation: async (action) => {
    await action();
    return true;
  },
  hasBlockingGuard: () => false,
};

function isPlainPrimaryClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function useDashboardUnsavedNavigation() {
  return useContext(DashboardUnsavedNavigationContext) ?? FALLBACK_CONTEXT;
}

export default function DashboardUnsavedNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const guardsRef = useRef<Map<string, StoredGuard>>(new Map());
  const sequenceRef = useRef(0);
  const navigationPendingRef = useRef(false);

  const registerGuard = useCallback(
    (guard: DashboardExitGuardRegistration) => {
      const token = Symbol(guard.id);
      const previous = guardsRef.current.get(guard.id);
      const stored: StoredGuard = {
        ...guard,
        sequence: previous?.sequence ?? ++sequenceRef.current,
        token,
      };
      guardsRef.current.set(guard.id, stored);

      return () => {
        const current = guardsRef.current.get(guard.id);
        if (current?.token === token) {
          guardsRef.current.delete(guard.id);
        }
      };
    },
    [],
  );

  const hasBlockingGuard = useCallback(() => {
    for (const guard of guardsRef.current.values()) {
      try {
        if (guard.shouldBlock()) return true;
      } catch {
        // Un guard défaillant ne doit jamais bloquer toute l'application.
      }
    }
    return false;
  }, []);

  const requestNavigation = useCallback(async (action: NavigationAction) => {
    if (navigationPendingRef.current) return false;
    navigationPendingRef.current = true;

    try {
      const activeGuards = Array.from(guardsRef.current.values()).sort(
        (a, b) => b.sequence - a.sequence,
      );
      const blockingGuards: StoredGuard[] = [];
      const passiveGuards: StoredGuard[] = [];

      for (const guard of activeGuards) {
        try {
          (guard.shouldBlock() ? blockingGuards : passiveGuards).push(guard);
        } catch {
          passiveGuards.push(guard);
        }
      }

      // On demande d'abord toutes les confirmations réellement nécessaires.
      // Les surfaces sans changement ne sont fermées qu'après validation, afin
      // qu'un clic annulé ne ferme jamais un autre outil ouvert.
      for (const guard of [...blockingGuards, ...passiveGuards]) {
        let allowed = false;
        try {
          allowed = await guard.confirmExit();
        } catch (error) {
          console.error("Erreur guard navigation iNrCy:", error);
          return false;
        }
        if (!allowed) return false;
      }

      await action();
      return true;
    } finally {
      navigationPendingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onDocumentClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || !isPlainPrimaryClick(event)) return;
      if (!hasBlockingGuard()) return;

      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.dataset.inrcyUnguardedNavigation === "true") return;
      if (anchor.target && anchor.target !== "_self") return;

      let targetUrl: URL;
      try {
        targetUrl = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (targetUrl.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();

      void requestNavigation(() => {
        if (targetUrl.origin === window.location.origin) {
          router.push(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
          return;
        }
        window.location.assign(targetUrl.href);
      });
    };

    document.addEventListener("click", onDocumentClickCapture, true);
    return () => {
      document.removeEventListener("click", onDocumentClickCapture, true);
    };
  }, [hasBlockingGuard, requestNavigation, router]);

  const contextValue = useMemo<DashboardUnsavedNavigationContextValue>(
    () => ({ registerGuard, requestNavigation, hasBlockingGuard }),
    [hasBlockingGuard, registerGuard, requestNavigation],
  );

  return (
    <DashboardUnsavedNavigationContext.Provider value={contextValue}>
      {children}
    </DashboardUnsavedNavigationContext.Provider>
  );
}
