import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { resolveActiveInrcyAccountId } from "@/lib/multicompte/server";
import { resolveMailboxReputationPolicy } from "@/lib/mailboxReputation";
import { withApi } from "@/lib/observability/withApi";

export const runtime = "nodejs";

async function handler(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  const userId = await resolveActiveInrcyAccountId(supabase, user.id);
  const url = new URL(req.url);
  const accountId = String(url.searchParams.get("accountId") || "").trim();
  if (!accountId) {
    return NextResponse.json({ error: "Boîte d’envoi manquante." }, { status: 400 });
  }

  const { data: account, error } = await supabase
    .from("integrations")
    .select("id,user_id,provider,category,status,account_email,settings")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("category", "mail")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Impossible de vérifier cette boîte mail." }, { status: 500 });
  if (!account?.id) return NextResponse.json({ error: "Boîte mail introuvable." }, { status: 404 });

  const policy = await resolveMailboxReputationPolicy({
    userId,
    integrationId: accountId,
    provider: account.provider,
    accountEmail: account.account_email,
    settings: account.settings && typeof account.settings === "object" ? account.settings as Record<string, unknown> : null,
    forceDnsRefresh: url.searchParams.get("refresh") === "1",
  });

  return NextResponse.json({
    success: true,
    accountId,
    provider: account.provider,
    accountEmail: policy.accountEmail,
    healthStatus: policy.healthStatus,
    mode: policy.mode,
    blocked: policy.blocked,
    blockedReason: policy.blockedReason,
    resumeAt: policy.resumeAt,
    domainAuthentication: policy.domainAudit,
    pacing: {
      batchSize: policy.config.batchSize,
      delaySeconds: Math.round(policy.config.sendDelayMs / 1000),
      pauseSeconds: Math.round(policy.config.batchPauseMs / 1000),
      hourlyLimit: policy.config.hourlyLimit,
      dailyLimit: policy.config.dailyLimit,
    },
  });
}

export const GET = withApi(handler, { route: "/api/inrsend/reputation" });
