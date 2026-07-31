import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  INRCY_PUBLISHABLE_CHANNELS,
  asRecord,
  emptyInrcyActivityStatsByChannel,
  emptyInrcyChannelActivityStats,
  incrementWindowCount,
  inferPayloadMediaKindForChannel,
  inferPhotoCountForChannel,
  inferYoutubeVideoPublicationKind,
  payloadSucceededForChannel,
} from "@/lib/stats/buildOverview.shared";
import type { InrcyActivityStatsByChannel } from "@/lib/stats/buildOverview.shared";

export async function loadInrcyPublishedActivityStats({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<InrcyActivityStatsByChannel> {
  const statsByChannel = emptyInrcyActivityStatsByChannel();
  const nowMs = Date.now();

  try {
    const { data, error } = await supabase
      .from("app_events")
      .select("payload,created_at,module,type")
      .eq("user_id", userId)
      .in("module", ["booster", "propulser", "fideliser"])
      .in("type", ["publish", "valorize"])
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error || !Array.isArray(data)) return statsByChannel;

    for (const row of data) {
      const payload = asRecord(asRecord(row)["payload"]);
      const createdAt = String(asRecord(row)["created_at"] || "").trim();
      const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;

      for (const channel of INRCY_PUBLISHABLE_CHANNELS) {
        if (!payloadSucceededForChannel(payload, channel)) continue;
        const stats = statsByChannel[channel] || emptyInrcyChannelActivityStats();
        statsByChannel[channel] = stats;

        incrementWindowCount(stats.publications, createdAtMs, nowMs);
        if (createdAt && (!stats.latestAt || createdAt > stats.latestAt)) stats.latestAt = createdAt;

        const kind = inferPayloadMediaKindForChannel(payload, channel);
        if (kind === "video") {
          if (channel === "youtube_shorts" && inferYoutubeVideoPublicationKind(payload) === "long") {
            incrementWindowCount(stats.photos, createdAtMs, nowMs);
          } else {
            incrementWindowCount(stats.videos, createdAtMs, nowMs);
          }
        } else if (kind === "photos") {
          incrementWindowCount(stats.photoPosts, createdAtMs, nowMs);
          incrementWindowCount(stats.photos, createdAtMs, nowMs, inferPhotoCountForChannel(payload, channel));
        }
      }
    }

    return statsByChannel;
  } catch {
    return statsByChannel;
  }
}
