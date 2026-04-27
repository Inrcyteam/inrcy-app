import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { computeInertiaSnapshot } from "@/lib/loyalty/inertia";
import { getIsoWeekId, getIsoWeekStart } from "@/lib/weeklyGoals";

type LedgerRow = {
  created_at: string;
  action_key: string;
  amount: number | null;
  meta: Record<string, unknown> | null;
};

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const weekStart = getIsoWeekStart();
  const weekId = getIsoWeekId();

  const [states, ledgerRes] = await Promise.all([
    getChannelConnectionStates(supabase, user.id),
    supabase
      .from("loyalty_ledger")
      .select("created_at,action_key,amount,meta")
      .eq("user_id", user.id)
      .gte("created_at", weekStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const snapshot = computeInertiaSnapshot({
    site_inrcy: states.site_inrcy.connected && states.site_inrcy.statsConnected,
    site_web: states.site_web.connected && states.site_web.statsConnected,
    gmb: states.gmb.connected,
    facebook: states.facebook.connected,
    instagram: states.instagram.connected,
    linkedin: states.linkedin.connected,
  }, { maxMultiplier: 7 });

  const events = ((ledgerRes.data ?? []) as LedgerRow[]).filter((row) => new Date(row.created_at) >= weekStart);
  const hasAction = (key: string) => events.some((row) => row.action_key === key);
  const sumAction = (key: string) => events.filter((row) => row.action_key === key).reduce((acc, row) => acc + Number(row.amount ?? 0), 0);

  const createActuDone = hasAction("create_actu");
  const featureDone = hasAction("weekly_feature_use");

  return NextResponse.json({
    weekId,
    weekStart: weekStart.toISOString(),
    turbo: {
      multiplier: snapshot.multiplier,
      connectedCount: snapshot.connectedCount,
      totalChannels: snapshot.totalChannels,
    },
    missions: {
      createActu: {
        done: createActuDone,
        gained: sumAction("create_actu"),
        projected: Math.round(10 * snapshot.multiplier),
      },
      weeklyFeatureUse: {
        done: featureDone,
        gained: sumAction("weekly_feature_use"),
        projected: Math.round(10 * snapshot.multiplier),
      },
    },
  });
}
