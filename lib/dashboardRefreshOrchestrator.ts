"use client";

type SharedRefreshOptions = {
  reuseMs?: number;
  pauseAfter429Ms?: number;
};

type RecentResult = {
  completedAt: number;
  value: unknown;
};

type OrchestratorState = {
  inFlight: Map<string, Promise<unknown>>;
  recent: Map<string, RecentResult>;
  serialTail: Promise<void>;
  pauseUntil: number;
};

const GLOBAL_STATE_KEY = "__inrcyDashboardRefreshOrchestratorV1";
const DEFAULT_REUSE_MS = 15_000;
const DEFAULT_429_PAUSE_MS = 90_000;

export class DashboardRefreshPausedError extends Error {
  readonly retryAt: number;

  constructor(retryAt: number) {
    super("Les synchronisations iNrCy sont momentanément ralenties après une limitation distante.");
    this.name = "DashboardRefreshPausedError";
    this.retryAt = retryAt;
  }
}

export class DashboardRefreshHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DashboardRefreshHttpError";
    this.status = status;
  }
}

function getState(): OrchestratorState {
  const root = globalThis as typeof globalThis & {
    [GLOBAL_STATE_KEY]?: OrchestratorState;
  };

  if (!root[GLOBAL_STATE_KEY]) {
    root[GLOBAL_STATE_KEY] = {
      inFlight: new Map(),
      recent: new Map(),
      serialTail: Promise.resolve(),
      pauseUntil: 0,
    };
  }

  return root[GLOBAL_STATE_KEY];
}

function statusFromError(error: unknown) {
  if (error instanceof DashboardRefreshHttpError) return error.status;
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

/**
 * Sérialise les reconstructions lourdes du dashboard dans toute l'application,
 * réutilise un résultat récent et suspend les nouveaux travaux après un 429.
 */
export function runSharedDashboardRefresh<T>(
  key: string,
  task: () => Promise<T>,
  options: SharedRefreshOptions = {},
): Promise<T> {
  const state = getState();
  const now = Date.now();
  const reuseMs = Math.max(0, options.reuseMs ?? DEFAULT_REUSE_MS);
  const pauseAfter429Ms = Math.max(1_000, options.pauseAfter429Ms ?? DEFAULT_429_PAUSE_MS);

  if (state.pauseUntil > now) {
    return Promise.reject(new DashboardRefreshPausedError(state.pauseUntil));
  }

  const inFlight = state.inFlight.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const recent = state.recent.get(key);
  if (recent && now - recent.completedAt <= reuseMs) {
    return Promise.resolve(recent.value as T);
  }

  const queued = state.serialTail
    .catch(() => undefined)
    .then(async () => {
      if (state.pauseUntil > Date.now()) {
        throw new DashboardRefreshPausedError(state.pauseUntil);
      }

      try {
        const value = await task();
        state.recent.set(key, { completedAt: Date.now(), value });
        return value;
      } catch (error) {
        if (statusFromError(error) === 429) {
          state.pauseUntil = Date.now() + pauseAfter429Ms;
        }
        throw error;
      }
    });

  state.inFlight.set(key, queued);
  state.serialTail = queued.then(() => undefined, () => undefined);

  void queued.finally(() => {
    if (state.inFlight.get(key) === queued) state.inFlight.delete(key);
  }).catch(() => undefined);

  return queued;
}

export async function fetchSharedDashboardRefreshJson<T>(
  key: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: SharedRefreshOptions,
): Promise<T> {
  return runSharedDashboardRefresh(
    key,
    async () => {
      const response = await fetch(input, init);
      if (!response.ok) {
        throw new DashboardRefreshHttpError(
          response.status,
          `Dashboard refresh failed: ${response.status}`,
        );
      }
      return (await response.json().catch(() => null)) as T;
    },
    options,
  );
}

export function resetDashboardRefreshOrchestratorForTests() {
  const state = getState();
  state.inFlight.clear();
  state.recent.clear();
  state.serialTail = Promise.resolve();
  state.pauseUntil = 0;
}
