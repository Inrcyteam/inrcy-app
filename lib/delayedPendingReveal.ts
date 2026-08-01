export type DelayedRevealScheduler = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (id: number) => void;
  now: () => number;
};

export type DelayedRevealHandle = {
  cancel: () => void;
};

type ScheduleDelayedRevealOptions = {
  scheduler: DelayedRevealScheduler;
  delayMs: number;
  isStillPending: () => boolean;
  onReveal: () => void;
};

/**
 * Schedules a loading-label reveal without letting a blocked main thread create
 * a one-frame flash. The delay starts after the first browser frame, and the
 * label is committed on a separate frame after the threshold.
 */
export function scheduleDelayedReveal({
  scheduler,
  delayMs,
  isStillPending,
  onReveal,
}: ScheduleDelayedRevealOptions): DelayedRevealHandle {
  let cancelled = false;
  let paintFrameId: number | null = null;
  let revealFrameId: number | null = null;
  let timerId: number | null = null;
  let startedAt = 0;

  const clearScheduledWork = () => {
    if (paintFrameId !== null) scheduler.cancelFrame(paintFrameId);
    if (revealFrameId !== null) scheduler.cancelFrame(revealFrameId);
    if (timerId !== null) scheduler.clearTimer(timerId);
    paintFrameId = null;
    revealFrameId = null;
    timerId = null;
  };

  const revealOnNextFrame = () => {
    if (cancelled || !isStillPending()) return;

    revealFrameId = scheduler.requestFrame(() => {
      revealFrameId = null;
      if (cancelled || !isStillPending()) return;

      const remainingMs = Math.max(0, delayMs - (scheduler.now() - startedAt));
      if (remainingMs > 0) {
        timerId = scheduler.setTimer(() => {
          timerId = null;
          revealOnNextFrame();
        }, remainingMs);
        return;
      }

      onReveal();
    });
  };

  paintFrameId = scheduler.requestFrame(() => {
    paintFrameId = null;
    if (cancelled || !isStillPending()) return;

    startedAt = scheduler.now();
    timerId = scheduler.setTimer(() => {
      timerId = null;
      revealOnNextFrame();
    }, Math.max(0, delayMs));
  });

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      clearScheduledWork();
    },
  };
}
