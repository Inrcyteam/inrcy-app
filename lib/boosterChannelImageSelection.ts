function unique(values: readonly string[]) {
  return values.filter(
    (value, index, entries) => Boolean(value) && entries.indexOf(value) === index,
  );
}

/**
 * Keeps every explicit per-channel selection stable when the global image pool
 * changes. A newly added physical source remains unassigned until the user
 * chooses it for a channel.
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

  // A restored draft can carry an ordered subset without the transient
  // synchronization marker. Preserve that explicit mapping. Only a genuinely
  // new channel (no selected-key field at all) starts with the complete pool.
  if (previousAvailable === null) {
    return Array.isArray(params.previousSelectedKeys) ? retained : available;
  }

  return retained;
}
