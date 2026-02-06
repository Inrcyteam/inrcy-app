import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * Send a Messenger message.
 * Body: { recipientId: string, text: string }
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;
  const { data: acc, error: accErr } = await supabase
    .from("messenger_accounts")
    .select("page_access_token_enc")
    .eq("user_id", userId)
    .maybeSingle();

  if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
  if (!acc?.page_access_token_enc) {
    return NextResponse.json({ error: "Messenger not connected" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const recipientId = body?.recipientId;
  const text = body?.text;
  if (!recipientId || !text) {
    return NextResponse.json({ error: "Missing recipientId/text" }, { status: 400 });
  }

  const token = (acc as any).page_access_token_enc as string;
  const graphBase = process.env.FACEBOOK_GRAPH_BASE || "https://graph.facebook.com";
  const version = process.env.FACEBOOK_API_VERSION || "v20.0";

  const url = `${graphBase}/${version}/me/messages?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_type: "RESPONSE",
      recipient: { id: recipientId },
      message: { text: String(text).slice(0, 2000) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data?.error?.message || "Send failed", details: data }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
