function unique(values: readonly string[]) {
  return values.filter(
    (value, index, entries) => Boolean(value) && entries.indexOf(value) === index,
  );
}

/**
 * Keeps explicit per-channel deselections stable while automatically selecting
 * files that were genuinely added after the previous synchronization.
 */
export function mergeBoosterChannelImageSelection(params: {
  availableKeys: readonly string[];
  previousSelectedKeys?: readonly string[];
  previousAvailableKeys?: readonly string[];
  supportsImages: boolean;
}) {
  if (!params.supportsImages) return [];
  const available = unique(params.availableKeys);
  const previousAvailable = Array.isArray(params.previousAvailableKeys)
    ? unique(params.previousAvailableKeys)
    : null;
  const retained = unique(params.previousSelectedKeys || []).filter((key) =>
    available.includes(key),
  );

  // Legacy/new state has no synchronization marker: initialize with all media.
  if (previousAvailable === null) return available;

  const genuinelyAdded = available.filter(
    (key) => !previousAvailable.includes(key),
  );
  return unique([...retained, ...genuinelyAdded]);
}
