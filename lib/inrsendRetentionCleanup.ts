import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getInrSendRetentionCutoffIso, getInrSendRetentionMonths, type InrSendFolder } from "@/lib/inrsendRetention";

type SendItemCleanupRow = { id: string; type: string | null; created_at: string | null };
type CampaignCleanupRow = {
  id: string;
  folder: string | null;
  type: string | null;
  track_kind: string | null;
  track_type: string | null;
  created_at: string | null;
};
type EventCleanupRow = { id: string; module: string | null; type: string | null; created_at: string | null };

type CleanupSummary = {
  sendItemsDeleted: number;
  mailCampaignsDeleted: number;
  appEventsDeleted: number;
};

const FETCH_BATCH_SIZE = 500;
const DELETE_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size = DELETE_CHUNK_SIZE) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function defaultFolderFromSendType(type: string | null | undefined): InrSendFolder {
  if (type === "facture") return "factures";
  if (type === "devis") return "devis";
  return "mails";
}

function folderFromTrack(trackKind: string | null | undefined, trackType: string | null | undefined, fallback: InrSendFolder = "mails"): InrSendFolder {
  const kind = String(trackKind || "").toLowerCase();
  const type = String(trackType || "").toLowerCase();

  if (kind === "booster") {
    if (type === "review_mail") return "recoltes";
    if (type === "promo_mail") return "offres";
  }

  if (kind === "fideliser") {
    if (type === "newsletter_mail") return "informations";
    if (type === "thanks_mail") return "suivis";
    if (type === "satisfaction_mail") return "enquetes";
  }

  return fallback;
}

function resolveCampaignFolder(row: CampaignCleanupRow): InrSendFolder {
  const explicit = String(row.folder || "").toLowerCase();
  if (explicit === "mails" || explicit === "factures" || explicit === "devis" || explicit === "publications" || explicit === "recoltes" || explicit === "offres" || explicit === "informations" || explicit === "suivis" || explicit === "enquetes") {
    return explicit;
  }
  return folderFromTrack(row.track_kind, row.track_type, defaultFolderFromSendType(row.type));
}

function resolveEventFolder(row: EventCleanupRow): InrSendFolder | null {
  const mod = String(row.module || "").toLowerCase();
  const type = String(row.type || "").toLowerCase();
  if (mod === "booster") {
    if (type === "publish") return "publications";
    if (type === "review_mail") return "recoltes";
    if (type === "promo_mail") return "offres";
    return null;
  }
  if (mod === "fideliser") {
    if (type === "newsletter_mail") return "informations";
    if (type === "thanks_mail") return "suivis";
    if (type === "satisfaction_mail") return "enquetes";
    return null;
  }
  return null;
}

function isOlderThanRetention(folder: InrSendFolder, createdAt: string | null | undefined, now = new Date()) {
  const months = getInrSendRetentionMonths(folder);
  if (months == null) return false;
  const cutoffIso = getInrSendRetentionCutoffIso(folder, now);
  if (!cutoffIso) return false;
  const createdMs = new Date(String(createdAt || 0)).getTime();
  const cutoffMs = new Date(cutoffIso).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(cutoffMs)) return false;
  return createdMs < cutoffMs;
}

async function deleteSendItems(ids: string[]) {
  let deleted = 0;
  for (const part of chunk(ids)) {
    const { error } = await supabaseAdmin.from("send_items").delete().in("id", part);
    if (error) throw error;
    deleted += part.length;
  }
  return deleted;
}

async function deleteMailCampaigns(ids: string[]) {
  let deleted = 0;
  for (const part of chunk(ids)) {
    const { error } = await supabaseAdmin.from("mail_campaigns").delete().in("id", part);
    if (error) throw error;
    deleted += part.length;
  }
  return deleted;
}

async function deleteAppEvents(ids: string[]) {
  let deleted = 0;
  for (const part of chunk(ids)) {
    const { error } = await supabaseAdmin.from("app_events").delete().in("id", part);
    if (error) throw error;
    deleted += part.length;
  }
  return deleted;
}

export async function cleanupInrSendRetention(now = new Date()): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    sendItemsDeleted: 0,
    mailCampaignsDeleted: 0,
    appEventsDeleted: 0,
  };

  const oldestAutoCutoffIso = getInrSendRetentionCutoffIso("mails", now);
  if (!oldestAutoCutoffIso) return summary;

  const sendItemIdsToDelete: string[] = [];
  for (let from = 0; ; from += FETCH_BATCH_SIZE) {
    const to = from + FETCH_BATCH_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("send_items")
      .select("id,type,created_at")
      .lt("created_at", oldestAutoCutoffIso)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as SendItemCleanupRow[];
    if (!rows.length) break;

    sendItemIdsToDelete.push(
      ...rows
        .filter((row) => isOlderThanRetention(defaultFolderFromSendType(row.type), row.created_at, now))
        .map((row) => row.id)
        .filter(Boolean),
    );

    if (rows.length < FETCH_BATCH_SIZE) break;
  }
  if (sendItemIdsToDelete.length) summary.sendItemsDeleted = await deleteSendItems(sendItemIdsToDelete);

  const campaignIdsToDelete: string[] = [];
  for (let from = 0; ; from += FETCH_BATCH_SIZE) {
    const to = from + FETCH_BATCH_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("mail_campaigns")
      .select("id,folder,type,track_kind,track_type,created_at")
      .lt("created_at", oldestAutoCutoffIso)
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as CampaignCleanupRow[];
    if (!rows.length) break;

    campaignIdsToDelete.push(
      ...rows
        .filter((row) => isOlderThanRetention(resolveCampaignFolder(row), row.created_at, now))
        .map((row) => row.id)
        .filter(Boolean),
    );

    if (rows.length < FETCH_BATCH_SIZE) break;
  }
  if (campaignIdsToDelete.length) summary.mailCampaignsDeleted = await deleteMailCampaigns(campaignIdsToDelete);

  const eventIdsToDelete: string[] = [];
  for (let from = 0; ; from += FETCH_BATCH_SIZE) {
    const to = from + FETCH_BATCH_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("app_events")
      .select("id,module,type,created_at")
      .lt("created_at", oldestAutoCutoffIso)
      .in("module", ["booster", "fideliser"])
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as EventCleanupRow[];
    if (!rows.length) break;

    eventIdsToDelete.push(
      ...rows
        .filter((row) => {
          const folder = resolveEventFolder(row);
          return folder ? isOlderThanRetention(folder, row.created_at, now) : false;
        })
        .map((row) => row.id)
        .filter(Boolean),
    );

    if (rows.length < FETCH_BATCH_SIZE) break;
  }
  if (eventIdsToDelete.length) summary.appEventsDeleted = await deleteAppEvents(eventIdsToDelete);

  return summary;
}

async function deleteInrSendHistoryItemsBySource(userId: string, source: "send_items" | "mail_campaigns" | "app_events", ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((value) => String(value || "").trim()).filter(Boolean)));
  if (!uniqueIds.length) return 0;

  let deleted = 0;
  for (const part of chunk(uniqueIds)) {
    if (source === "send_items") {
      const { error, count } = await supabaseAdmin
        .from("send_items")
        .delete({ count: "exact" })
        .in("id", part)
        .eq("user_id", userId);
      if (error) throw error;
      deleted += count ?? part.length;
      continue;
    }

    if (source === "mail_campaigns") {
      const { error, count } = await supabaseAdmin
        .from("mail_campaigns")
        .delete({ count: "exact" })
        .in("id", part)
        .eq("user_id", userId);
      if (error) throw error;
      deleted += count ?? part.length;
      continue;
    }

    const { error, count } = await supabaseAdmin
      .from("app_events")
      .delete({ count: "exact" })
      .in("id", part)
      .eq("user_id", userId);
    if (error) throw error;
    deleted += count ?? part.length;
  }

  return deleted;
}

export async function deleteInrSendHistoryItems(
  userId: string,
  entries: Array<{ source: "send_items" | "mail_campaigns" | "app_events"; id: string }>,
) {
  const grouped = new Map<"send_items" | "mail_campaigns" | "app_events", string[]>();

  for (const entry of entries) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;
    const source = entry?.source;
    if (source !== "send_items" && source !== "mail_campaigns" && source !== "app_events") continue;
    const current = grouped.get(source) || [];
    current.push(id);
    grouped.set(source, current);
  }

  let deleted = 0;
  for (const [source, ids] of grouped.entries()) {
    deleted += await deleteInrSendHistoryItemsBySource(userId, source, ids);
  }
  return deleted;
}

export async function deleteInrSendHistoryItem(userId: string, source: "send_items" | "mail_campaigns" | "app_events", id: string) {
  const deleted = await deleteInrSendHistoryItems(userId, [{ source, id }]);
  return deleted > 0;
}
