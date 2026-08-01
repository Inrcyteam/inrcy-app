import test from "node:test";
import assert from "node:assert/strict";
import {
  scheduleDelayedReveal,
  type DelayedRevealScheduler,
} from "../../lib/delayedPendingReveal.ts";

type ScheduledTimer = { id: number; dueAt: number; callback: () => void };

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, ScheduledTimer>();

  const scheduler: DelayedRevealScheduler = {
    requestFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    setTimer(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { id, dueAt: now + delayMs, callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    now: () => now,
  };

  const flushFrames = () => {
    const queued = [...frames.entries()];
    frames.clear();
    for (const [, callback] of queued) callback();
  };

  const advance = (milliseconds: number) => {
    now += milliseconds;
    let ranTimer = true;
    while (ranTimer) {
      ranTimer = false;
      const due = [...timers.values()]
        .filter((timer) => timer.dueAt <= now)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);
      for (const timer of due) {
        if (!timers.delete(timer.id)) continue;
        timer.callback();
        ranTimer = true;
      }
    }
  };

  return { scheduler, flushFrames, advance };
}

test("the loading label cannot appear before the real 650 ms threshold", () => {
  const fake = createFakeScheduler();
  let pending = true;
  let reveals = 0;

  scheduleDelayedReveal({
    scheduler: fake.scheduler,
    delayMs: 650,
    isStillPending: () => pending,
    onReveal: () => { reveals += 1; },
  });

  fake.flushFrames();
  fake.advance(649);
  fake.flushFrames();
  assert.equal(reveals, 0);

  fake.advance(1);
  assert.equal(reveals, 0, "the timer alone must not reveal the label");
  fake.flushFrames();
  assert.equal(reveals, 1);

  pending = false;
});

test("a route that commits before the reveal frame never flashes Chargement", () => {
  const fake = createFakeScheduler();
  let pending = true;
  let reveals = 0;

  scheduleDelayedReveal({
    scheduler: fake.scheduler,
    delayMs: 650,
    isStillPending: () => pending,
    onReveal: () => { reveals += 1; },
  });

  fake.flushFrames();
  fake.advance(1_000); // Simulates a blocked development compilation.
  pending = false; // The destination commits before the next paint.
  fake.flushFrames();

  assert.equal(reveals, 0);
});

test("cancelling an action removes every pending reveal", () => {
  const fake = createFakeScheduler();
  let reveals = 0;

  const handle = scheduleDelayedReveal({
    scheduler: fake.scheduler,
    delayMs: 650,
    isStillPending: () => true,
    onReveal: () => { reveals += 1; },
  });

  fake.flushFrames();
  handle.cancel();
  fake.advance(1_000);
  fake.flushFrames();

  assert.equal(reveals, 0);
});
