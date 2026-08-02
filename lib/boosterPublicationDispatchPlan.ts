export type BoosterChannelPreflightFailure = Record<string, unknown> & {
  ok: false;
  code: string;
  error: string;
};

export function buildBoosterPublicationDispatchPlan<Channel extends string>(
  channels: readonly Channel[],
  failures: Partial<Record<Channel, BoosterChannelPreflightFailure>>,
) {
  const entries = channels.map((channel) => {
    const failure = failures[channel] || null;
    return {
      channel,
      dispatchable: !failure,
      status: failure ? ("failed" as const) : ("queued" as const),
      result: failure,
    };
  });
  return {
    entries,
    dispatchableChannels: entries
      .filter((entry) => entry.dispatchable)
      .map((entry) => entry.channel),
    failedChannels: entries
      .filter((entry) => !entry.dispatchable)
      .map((entry) => entry.channel),
  };
}
