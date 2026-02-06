import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { FbMessage, fbFetchJson } from "@/lib/messengerGraph";

/**
 * Fetch a Messenger conversation thread.
 * Query:
 *  - threadId: conversation id
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;
  const { data: acc, error: accErr } = await supabase
    .from("messenger_accounts")
    .select("page_id, page_access_token_enc")
    .eq("user_id", userId)
    .maybeSingle();

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  if (!acc?.page_access_token_enc) {
    return NextResponse.json({ error: "Messenger not connected" }, { status: 401 });
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "Missing threadId" }, { status: 400 });

  const pageToken = (acc as any).page_access_token_enc as string;
  const limit = Math.min(Number(url.searchParams.get("limit") || 25), 50);

  const msgResp = await fbFetchJson<{ data?: FbMessage[] }>(
    `${threadId}/messages?${new URLSearchParams({
      fields: "id,created_time,from,to,message",
      limit: String(limit),
      access_token: pageToken,
    }).toString()}`
  );

  const items = (msgResp.data || []).map((m) => ({
    id: m.id,
    created_time: m.created_time ?? null,
    from: m.from?.name ?? null,
    from_id: m.from?.id ?? null,
    message: m.message ?? "",
  }));

  return NextResponse.json({ threadId, items });
}
