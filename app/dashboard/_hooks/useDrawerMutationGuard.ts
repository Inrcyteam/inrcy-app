"use client";

import { useCallback, useRef, useState } from "react";

export function useDrawerMutationGuard() {
  const [drawerMutationState, setDrawerMutationState] = useState<Record<string, boolean>>({});
  const drawerMutationStateRef = useRef<Record<string, boolean>>({});

  const setDrawerMutationBusy = useCallback((key: string, busy: boolean) => {
    if (busy) {
      drawerMutationStateRef.current = { ...drawerMutationStateRef.current, [key]: true };
      setDrawerMutationState((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      return;
    }

    if (!drawerMutationStateRef.current[key]) return;
    const nextRef = { ...drawerMutationStateRef.current };
    delete nextRef[key];
    drawerMutationStateRef.current = nextRef;
    setDrawerMutationState((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const runDrawerMutation = useCallback(
    async <T,>(key: string, job: () => Promise<T> | T) => {
      if (drawerMutationStateRef.current[key]) return null;
      setDrawerMutationBusy(key, true);
      try {
        return await job();
      } finally {
        setDrawerMutationBusy(key, false);
      }
    },
    [setDrawerMutationBusy]
  );

  const isDrawerMutationPending = useCallback(
    (key: string) => Boolean(drawerMutationState[key]),
    [drawerMutationState]
  );

  return { runDrawerMutation, isDrawerMutationPending };
}
