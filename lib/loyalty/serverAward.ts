import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { getIsoWeekId, getIsoWeekStart } from "@/lib/weeklyGoals";

const MULTIPLIED_ACTION_KEYS = new Set(["create_actu", "weekly_feature_use"]);

const WEEKLY_FEATURE_CAMPAIGNS = new Set([
  "booster:review_mail",
  "booster:promo_mail",
  "fideliser:newsletter_mail",
  "fideliser:thanks_mail",
  "fideliser:satisfaction_mail",
]);

const WEEKLY_FEATURE_FOLDERS: Record<string, string> = {
  recoltes: "booster:review_mail",
  offres: "booster:promo_mail",
  informations: "fideliser:newsletter_mail",
  suivis: "fideliser:thanks_mail",
  enquetes: "fideliser:satisfaction_mail",
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

export function isWeeklyFeatureCampaign(campaign: CampaignLike) {
  const kind = normalize(campaign.trackKind);
  const type = normalize(campaign.trackType);
  const folder = normalize(campaign.folder);

  if (kind && type && WEEKLY_FEATURE_CAMPAIGNS.has(`${kind}:${type}`)) return true;

  const folderMatch = WEEKLY_FEATURE_FOLDERS[folder];
  if (!folderMatch) return false;

  if (!kind && !type) return true;
  if (kind && folderMatch.startsWith(`${kind}:`)) return true;
  if (type && folderMatch.endsWith(`:${type}`)) return true;

  return false;
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
  actionKey: "create_actu" | "weekly_feature_use";
  baseAmount: number;
  sourceId: string;
  label: string;
  meta?: Record<string, unknown>;
}): Promise<AwardResult> {
  const userId = String(args.userId || "").trim();
  const actionKey = String(args.actionKey || "").trim();
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
  if (!args.userId || Number(args.sentCount || 0) <= 0 || !isWeeklyFeatureCampaign(args)) {
    return { ok: true, skipped: true } satisfies AwardResult;
  }

  return awardInertiaActionForUser({
    userId: args.userId,
    actionKey: "weekly_feature_use",
    baseAmount: 10,
    sourceId: `week-${getIsoWeekId()}`,
    label: "Utilisation Booster/Fidéliser",
    meta: {
      origin: "mail_campaign",
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
    const { data: campaigns } = await supabaseAdmin
      .from("mail_campaigns")
      .select("id,track_kind,track_type,folder,sent_count")
      .eq("user_id", userId)
      .gte("created_at", weekStartIso)
      .gt("sent_count", 0)
      .order("created_at", { ascending: false })
      .limit(20);

    const eligible = (campaigns || []).find((campaign: any) => isWeeklyFeatureCampaign({
      trackKind: campaign.track_kind,
      trackType: campaign.track_type,
      folder: campaign.folder,
    }));

    if (eligible) {
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
