"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  scheduleDelayedReveal,
  type DelayedRevealHandle,
  type DelayedRevealScheduler,
} from "@/lib/delayedPendingReveal";

/**
 * A sub-200 ms delay is technically measurable but still feels immediate to a
 * human, especially while Next.js compiles a route in development. 650 ms is
 * long enough to keep normal navigations visually clean while still reassuring
 * the user when a navigation is genuinely slow.
 */
export const DEFAULT_PENDING_DELAY_MS = 650;
export const DEFAULT_PENDING_MIN_VISIBLE_MS = 250;
export const DEFAULT_PENDING_TIMEOUT_MS = 8_000;

type TimerRef = { current: number | null };

function clearWindowTimer(timerRef: TimerRef) {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}

type DelayedPendingActionOptions = {
  delayMs?: number;
  minVisibleMs?: number;
  timeoutMs?: number;
};

const browserRevealScheduler: DelayedRevealScheduler = {
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (id) => window.clearTimeout(id),
  now: () => performance.now(),
};

/**
 * Shared pending-state controller for navigations and modal openings.
 *
 * - Repeated clicks are blocked immediately in JavaScript, without changing
 *   the visible button state.
 * - The loading label is shown only when the action is still pending after the
 *   slow-action threshold.
 * - The reveal itself happens on a later browser frame. This prevents a route
 *   that has just finished compiling from flashing "Chargement…" for one frame.
 * - Once shown, the label remains visible briefly enough to be readable.
 * - A safety timeout always releases a stuck action.
 */
export function useDelayedPendingAction<Key extends string = string>({
  delayMs = DEFAULT_PENDING_DELAY_MS,
  minVisibleMs = DEFAULT_PENDING_MIN_VISIBLE_MS,
  timeoutMs = DEFAULT_PENDING_TIMEOUT_MS,
}: DelayedPendingActionOptions = {}) {
  const [pendingKey, setPendingKey] = useState<Key | null>(null);
  const [visibleKey, setVisibleKey] = useState<Key | null>(null);

  const pendingKeyRef = useRef<Key | null>(null);
  const visibleKeyRef = useRef<Key | null>(null);
  const visibleSinceRef = useRef(0);
  const revealScheduleRef = useRef<DelayedRevealHandle | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);

  const clearRevealSchedule = useCallback(() => {
    revealScheduleRef.current?.cancel();
    revealScheduleRef.current = null;
  }, []);

  const clearAllTimers = useCallback(() => {
    clearRevealSchedule();
    clearWindowTimer(releaseTimerRef);
    clearWindowTimer(timeoutTimerRef);
  }, [clearRevealSchedule]);

  const releaseImmediately = useCallback((key: Key | null) => {
    if (key !== null && pendingKeyRef.current !== key) return;
    pendingKeyRef.current = null;
    visibleKeyRef.current = null;
    visibleSinceRef.current = 0;
    setPendingKey(null);
    setVisibleKey(null);
  }, []);

  const completeAction = useCallback((key?: Key) => {
    const activeKey = pendingKeyRef.current;
    if (activeKey === null || (key !== undefined && activeKey !== key)) return;

    clearRevealSchedule();
    clearWindowTimer(timeoutTimerRef);

    if (visibleKeyRef.current !== activeKey) {
      clearWindowTimer(releaseTimerRef);
      releaseImmediately(activeKey);
      return;
    }

    const visibleForMs = Date.now() - visibleSinceRef.current;
    const remainingMs = Math.max(0, minVisibleMs - visibleForMs);
    clearWindowTimer(releaseTimerRef);
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      releaseImmediately(activeKey);
    }, remainingMs);
  }, [clearRevealSchedule, minVisibleMs, releaseImmediately]);

  const beginAction = useCallback((key: Key) => {
    // This ref is the double-click lock. It does not make the loading label
    // visible and therefore causes no immediate visual transformation.
    if (pendingKeyRef.current !== null) return false;

    clearAllTimers();
    releaseImmediately(null);

    pendingKeyRef.current = key;
    setPendingKey(key);

    revealScheduleRef.current = scheduleDelayedReveal({
      scheduler: browserRevealScheduler,
      delayMs,
      isStillPending: () => pendingKeyRef.current === key,
      onReveal: () => {
        visibleSinceRef.current = Date.now();
        visibleKeyRef.current = key;
        setVisibleKey(key);
      },
    });

    timeoutTimerRef.current = window.setTimeout(() => {
      timeoutTimerRef.current = null;
      completeAction(key);
    }, Math.max(delayMs + minVisibleMs, timeoutMs));

    return true;
  }, [clearAllTimers, completeAction, delayMs, minVisibleMs, releaseImmediately, timeoutMs]);

  const isPending = useCallback((key: Key) => pendingKey === key, [pendingKey]);
  const isVisible = useCallback((key: Key) => visibleKey === key, [visibleKey]);

  useEffect(() => () => {
    clearAllTimers();
  }, [clearAllTimers]);

  return {
    pendingKey,
    visibleKey,
    beginAction,
    completeAction,
    isPending,
    isVisible,
  };
}
