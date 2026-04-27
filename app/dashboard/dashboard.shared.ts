import type { ModuleStatus } from "./dashboard.types";
import type { DashboardChannelKey } from "@/lib/dashboardChannels";
import type { InrstatsChannelBlock } from "@/lib/inrstats/channelBlocks";

export function normalizeExternalHref(input: string | null | undefined) {
  const value = (input || "").trim();
  if (!value) return null;
  return value.startsWith("http") ? value : `https://${value}`;
}

export function hasMeaningfulChannelBlock(block: InrstatsChannelBlock | null | undefined) {
  if (!block) return false;
  return Boolean(
    block.connection.connected ||
      block.connection.accountConnected ||
      block.connection.configured ||
      block.connection.statsConnected ||
      block.connection.expired ||
      block.connection.requiresUpdate ||
      block.syncAt ||
      block.snapshotDate ||
      block.opportunities > 0 ||
      block.estimatedValue > 0 ||
      block.error ||
      block.connection.resourceUrl ||
      block.connection.resourceLabel ||
      block.connection.resourceId
  );
}

export function getBubbleStatusFromBlock(
  channel: DashboardChannelKey,
  block: InrstatsChannelBlock,
): { status: ModuleStatus; text: string } | null {
  if (!hasMeaningfulChannelBlock(block)) return null;

  if (channel === "site_inrcy") {
    if (!block.connection.connected) return null;
    return { status: "connected", text: "Connecté" };
  }

  if (block.connection.requiresUpdate || block.connection.connectionStatus === "needs_update") {
    return { status: "available", text: "À actualiser" };
  }

  if (block.connection.expired) {
    return { status: "available", text: "Reconnexion requise" };
  }

  if (block.connection.connected) {
    return { status: "connected", text: "Connecté" };
  }

  return { status: "available", text: "A connecter" };
}

export function getBubbleViewHrefFromBlock(
  channel: DashboardChannelKey,
  block: InrstatsChannelBlock | null | undefined,
) {
  if (!block) return null;
  const raw = block.connection.resourceUrl;
  if (!raw) return null;
  if (
    channel === "gmb" ||
    channel === "facebook" ||
    channel === "instagram" ||
    channel === "linkedin" ||
    channel === "site_inrcy" ||
    channel === "site_web"
  ) {
    return normalizeExternalHref(raw);
  }
  return null;
}

export function areJsonValuesEqual(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return a === b;
  }
}

export function getChannelsFromSettingsDiff(previousSettings: unknown, nextSettings: unknown): DashboardChannelKey[] {
  const previous =
    previousSettings && typeof previousSettings === "object"
      ? (previousSettings as Record<string, unknown>)
      : {};
  const next =
    nextSettings && typeof nextSettings === "object"
      ? (nextSettings as Record<string, unknown>)
      : {};
  const impacted: DashboardChannelKey[] = [];

  const map: Array<[DashboardChannelKey, string]> = [
    ["site_web", "site_web"],
    ["gmb", "gmb"],
    ["facebook", "facebook"],
    ["instagram", "instagram"],
    ["linkedin", "linkedin"],
  ];

  for (const [channel, key] of map) {
    if (!areJsonValuesEqual(previous[key], next[key])) {
      impacted.push(channel);
    }
  }

  return Array.from(new Set(impacted));
}

export function getChannelsFromProfilesDiff(previousRow: unknown, nextRow: unknown): DashboardChannelKey[] {
  const previous = previousRow && typeof previousRow === "object" ? (previousRow as Record<string, unknown>) : {};
  const next = nextRow && typeof nextRow === "object" ? (nextRow as Record<string, unknown>) : {};
  const impacted: DashboardChannelKey[] = [];

  if ((previous.inrcy_site_ownership ?? null) !== (next.inrcy_site_ownership ?? null)) {
    impacted.push("site_inrcy");
  }

  return impacted;
}

export function inferChannelsFromRealtimePayload(payload: any): DashboardChannelKey[] {
  const table = typeof payload?.table === "string" ? payload.table : "";
  if (table === "inrcy_site_configs") {
    return ["site_inrcy"];
  }

  if (table === "profiles") {
    return getChannelsFromProfilesDiff(payload?.old, payload?.new);
  }

  if (table === "pro_tools_configs") {
    return getChannelsFromSettingsDiff(payload?.old?.settings, payload?.new?.settings);
  }

  if (table !== "integrations") {
    return [];
  }

  const rows = [payload?.new, payload?.old];
  const impacted = new Set<DashboardChannelKey>();

  for (const row of rows) {
    const source = typeof row?.source === "string" ? row.source : "";
    const provider = typeof row?.provider === "string" ? row.provider : "";

    if (
      source === "site_inrcy" ||
      source === "site_web" ||
      source === "gmb" ||
      source === "facebook" ||
      source === "instagram" ||
      source === "linkedin"
    ) {
      impacted.add(source);
      continue;
    }

    if (provider === "facebook") impacted.add("facebook");
    if (provider === "linkedin") impacted.add("linkedin");
    if (provider === "google" && source === "gmb") impacted.add("gmb");
  }

  return Array.from(impacted);
}

export function inferChannelsFromSearchParams(
  linked: string | null,
  targetPanel: string | null,
): DashboardChannelKey[] {
  if (linked === "gmb" || linked === "facebook" || linked === "instagram" || linked === "linkedin") {
    return [linked];
  }

  if ((linked === "ga4" || linked === "gsc") && (targetPanel === "site_inrcy" || targetPanel === "site_web")) {
    return [targetPanel];
  }

  if (
    targetPanel === "site_inrcy" ||
    targetPanel === "site_web" ||
    targetPanel === "gmb" ||
    targetPanel === "facebook" ||
    targetPanel === "instagram" ||
    targetPanel === "linkedin"
  ) {
    return [targetPanel];
  }

  return [];
}
