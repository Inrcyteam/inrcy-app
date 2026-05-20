import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { getIsoWeekId, getIsoWeekStart } from "@/lib/weeklyGoals";

export type WeeklyMissionActionKey = "create_actu" | "weekly_feature_use" | "weekly_propulser_use" | "weekly_fideliser_use";

const MULTIPLIED_ACTION_KEYS = new Set<WeeklyMissionActionKey>(["create_actu", "weekly_feature_use", "weekly_propulser_use", "weekly_fideliser_use"]);

const PROPULSER_CAMPAIGNS = new Set([
  "propulser:valorize",
  "propulser:review_mail",
  "propulser:promo_mail",
  // compat ancien historique : ces actions appartenaient à Booster avant la refonte
  "booster:valorize",
  "booster:review_mail",
  "booster:promo_mail",
]);

const FIDELISER_CAMPAIGNS = new Set([
  "fideliser:newsletter_mail",
  "fideliser:thanks_mail",
  "fideliser:satisfaction_mail",
]);

const WEEKLY_CAMPAIGN_FOLDERS: Record<string, { tool: "propulser" | "fideliser"; type: string }> = {
  propulsions: { tool: "propulser", type: "" },
  recoltes: { tool: "propulser", type: "review_mail" },
  offres: { tool: "propulser", type: "promo_mail" },
  fidelisations: { tool: "fideliser", type: "" },
  informations: { tool: "fideliser", type: "newsletter_mail" },
  suivis: { tool: "fideliser", type: "thanks_mail" },
  enquetes: { tool: "fideliser", type: "satisfaction_mail" },
};

type AwardResult = {
  ok: boolean;
  skipped?: boolean;
  amount?: number;
  error?: string;
};

type CampaignLike = {
  trackKind?: string | null;
  trackType?: string | null;
  folder?: string | null;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isDuplicateError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate") || message.includes("unique");
}

export function getWeeklyMissionForCampaign(campaign: CampaignLike): "propulser" | "fideliser" | null {
  const kind = normalize(campaign.trackKind);
  const type = normalize(campaign.trackType);
  const folder = normalize(campaign.folder);

  if (kind && type) {
    const signature = `${kind}:${type}`;
    if (PROPULSER_CAMPAIGNS.has(signature)) return "propulser";
    if (FIDELISER_CAMPAIGNS.has(signature)) return "fideliser";
  }

  if (kind === "propulser") return "propulser";
  if (kind === "fideliser") return "fideliser";

  const folderMatch = WEEKLY_CAMPAIGN_FOLDERS[folder];
  if (!folderMatch) return null;

  if (!kind && !type) return folderMatch.tool;
  if (!folderMatch.type) return folderMatch.tool;
  if (type && folderMatch.type === type) return folderMatch.tool;
  if (!type && folderMatch.tool) return folderMatch.tool;

  return null;
}

export function isWeeklyFeatureCampaign(campaign: CampaignLike) {
  return getWeeklyMissionForCampaign(campaign) !== null;
}

async function getTurboMultiplier(userId: string) {
  try {
    const states = await getChannelConnectionStates(supabaseAdmin, userId);
    const snapshot = computeInertiaSnapshot({
      site_inrcy: states.site_inrcy.connected && states.site_inrcy.statsConnected,
      site_web: states.site_web.connected && states.site_web.statsConnected,
      gmb: states.gmb.connected && !states.gmb.requiresUpdate,
      facebook: states.facebook.connected && !states.facebook.requiresUpdate,
      instagram: states.instagram.connected && !states.instagram.requiresUpdate,
      linkedin: states.linkedin.connected && !states.linkedin.requiresUpdate,
    }, { maxMultiplier: 7 });
    return snapshot.multiplier;
  } catch {
    return 1;
  }
}

export async function awardInertiaActionForUser(args: {
  userId: string;
  actionKey: WeeklyMissionActionKey;
  baseAmount: number;
  sourceId: string;
  label: string;
  meta?: Record<string, unknown>;
}): Promise<AwardResult> {
  const userId = String(args.userId || "").trim();
  const actionKey = String(args.actionKey || "").trim() as WeeklyMissionActionKey;
  const sourceId = String(args.sourceId || "").trim();
  const baseAmount = Number(args.baseAmount || 0);

  if (!userId || !actionKey || !sourceId || !Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { ok: false, skipped: true, error: "award_invalid_args" };
  }

  const existingRes = await supabaseAdmin
    .from("loyalty_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("action_key", actionKey)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (!existingRes.error && existingRes.data?.id) {
    return { ok: true, skipped: true };
  }

  if (existingRes.error) {
    return { ok: false, skipped: true, error: existingRes.error.message };
  }

  const turbo = MULTIPLIED_ACTION_KEYS.has(actionKey) ? await getTurboMultiplier(userId) : 1;
  const amount = MULTIPLIED_ACTION_KEYS.has(actionKey) ? Math.round(baseAmount * turbo) : baseAmount;

  const insertRes = await supabaseAdmin
    .from("loyalty_ledger")
    .insert({
      user_id: userId,
      action_key: actionKey,
      source_id: sourceId,
      amount,
      label: args.label,
      meta: {
        ...(args.meta || {}),
        turbo_multiplier: turbo,
        base_amount: baseAmount,
      },
    })
    .select("id,amount")
    .maybeSingle();

  if (insertRes.error) {
    if (isDuplicateError(insertRes.error)) return { ok: true, skipped: true };
    return { ok: false, skipped: true, error: insertRes.error.message };
  }

  const balanceRes = await supabaseAdmin
    .from("loyalty_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (!balanceRes.error && balanceRes.data) {
    const current = Number((balanceRes.data as { balance?: number | null }).balance ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + amount;
    const updateRes = await supabaseAdmin
      .from("loyalty_balance")
      .update({ balance: next })
      .eq("user_id", userId);

    if (updateRes.error) return { ok: false, skipped: true, amount, error: updateRes.error.message };
    return { ok: true, amount };
  }

  const createBalanceRes = await supabaseAdmin
    .from("loyalty_balance")
    .insert({ user_id: userId, balance: amount });

  if (createBalanceRes.error) {
    if (!isDuplicateError(createBalanceRes.error)) {
      return { ok: false, skipped: true, amount, error: createBalanceRes.error.message };
    }

    const retryBalanceRes = await supabaseAdmin
      .from("loyalty_balance")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    const current = Number((retryBalanceRes.data as { balance?: number | null } | null)?.balance ?? 0);
    const retryUpdateRes = await supabaseAdmin
      .from("loyalty_balance")
      .update({ balance: (Number.isFinite(current) ? current : 0) + amount })
      .eq("user_id", userId);

    if (retryUpdateRes.error) {
      return { ok: false, skipped: true, amount, error: retryUpdateRes.error.message };
    }
  }

  return { ok: true, amount };
}

export async function awardWeeklyFeatureUseForCampaign(args: CampaignLike & {
  userId: string;
  campaignId?: string | null;
  sentCount?: number | null;
}) {
  const missionTool = getWeeklyMissionForCampaign(args);
  if (!args.userId || Number(args.sentCount || 0) <= 0 || !missionTool) {
    return { ok: true, skipped: true } satisfies AwardResult;
  }

  const actionKey: WeeklyMissionActionKey = missionTool === "propulser" ? "weekly_propulser_use" : "weekly_fideliser_use";

  return awardInertiaActionForUser({
    userId: args.userId,
    actionKey,
    baseAmount: 10,
    sourceId: `week-${getIsoWeekId()}`,
    label: missionTool === "propulser" ? "Action Propulser" : "Action Fidéliser",
    meta: {
      origin: "mail_campaign",
      mission_tool: missionTool,
      campaign_id: args.campaignId || null,
      track_kind: args.trackKind || null,
      track_type: args.trackType || null,
      folder: args.folder || null,
      sent_count: Number(args.sentCount || 0),
    },
  });
}

export async function repairWeeklyMissionAwardsForUser(userId: string) {
  const weekStartIso = getIsoWeekStart().toISOString();
  const results: AwardResult[] = [];

  try {
    const { data: publishEvents } = await supabaseAdmin
      .from("app_events")
      .select("id")
      .eq("user_id", userId)
      .eq("module", "booster")
      .eq("type", "publish")
      .gte("created_at", weekStartIso)
      .limit(1);

    if ((publishEvents || []).length > 0) {
      results.push(await awardInertiaActionForUser({
        userId,
        actionKey: "create_actu",
        baseAmount: 10,
        sourceId: `week-${getIsoWeekId()}`,
        label: "Actu créée",
        meta: { origin: "weekly_mission_repair" },
      }));
    }
  } catch {
    // Réparation best-effort : ne jamais bloquer l'affichage.
  }

  try {
    const { data: propulserEvents } = await supabaseAdmin
      .from("app_events")
      .select("id")
      .eq("user_id", userId)
      .eq("module", "propulser")
      .eq("type", "valorize")
      .gte("created_at", weekStartIso)
      .limit(1);

    if ((propulserEvents || []).length > 0) {
      results.push(await awardInertiaActionForUser({
        userId,
        actionKey: "weekly_propulser_use",
        baseAmount: 10,
        sourceId: `week-${getIsoWeekId()}`,
        label: "Action Propulser",
        meta: { origin: "weekly_mission_repair", mission_tool: "propulser", type: "valorize" },
      }));
    }
  } catch {
    // Réparation best-effort : ne jamais bloquer l'affichage.
  }

  try {
    const { data: campaigns } = await supabaseAdmin
      .from("mail_campaigns")
      .select("id,track_kind,track_type,folder,sent_count")
      .eq("user_id", userId)
      .gte("created_at", weekStartIso)
      .gt("sent_count", 0)
      .order("created_at", { ascending: false })
      .limit(20);

    const eligiblePropulser = (campaigns || []).find((campaign: any) => getWeeklyMissionForCampaign({
      trackKind: campaign.track_kind,
      trackType: campaign.track_type,
      folder: campaign.folder,
    }) === "propulser");

    const eligibleFideliser = (campaigns || []).find((campaign: any) => getWeeklyMissionForCampaign({
      trackKind: campaign.track_kind,
      trackType: campaign.track_type,
      folder: campaign.folder,
    }) === "fideliser");

    for (const eligible of [eligiblePropulser, eligibleFideliser].filter(Boolean) as any[]) {
      results.push(await awardWeeklyFeatureUseForCampaign({
        userId,
        campaignId: eligible.id,
        trackKind: eligible.track_kind,
        trackType: eligible.track_type,
        folder: eligible.folder,
        sentCount: eligible.sent_count,
      }));
    }
  } catch {
    // Réparation best-effort : ne jamais bloquer l'affichage.
  }

  return results;
}
