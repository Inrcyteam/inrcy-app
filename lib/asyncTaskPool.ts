export type AsyncTask<T> = () => Promise<T>;

/**
 * Runs promise factories without ever starting more than `concurrency` tasks.
 *
 * The settled result array preserves input order and one rejected task never
 * prevents the remaining work from running. Keeping promise creation inside
 * each factory is important: callers must not start the work before it enters
 * the pool.
 */
export async function runAsyncTaskPool<T>(
  tasks: readonly AsyncTask<T>[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Task-pool concurrency must be a positive integer.");
  }
  if (!tasks.length) return [];

  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let nextTaskIndex = 0;

  async function runWorker() {
    while (true) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      if (taskIndex >= tasks.length) return;

      try {
        results[taskIndex] = {
          status: "fulfilled",
          value: await tasks[taskIndex](),
        };
      } catch (reason) {
        results[taskIndex] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
