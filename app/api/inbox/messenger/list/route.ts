import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { FbConversation, FbMessage, fbFetchJson } from "@/lib/messengerGraph";

/**
 * List Messenger conversations and the latest message of each.
 *
 * UI mapping notes:
 * - We expose a flat list compatible with the existing Mailbox UI.
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
  if (!acc?.page_id || !acc?.page_access_token_enc) {
    return NextResponse.json({ error: "Messenger not connected" }, { status: 401 });
  }

  const pageId = (acc as any).page_id as string;
  const pageToken = (acc as any).page_access_token_enc as string;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 25), 50);

  // 1) conversations
  const convResp = await fbFetchJson<{ data?: FbConversation[] }>(
    `${pageId}/conversations?${new URLSearchParams({
      fields: "id,updated_time,snippet",
      limit: String(limit),
      access_token: pageToken,
    }).toString()}`
  );
  const conversations = convResp.data || [];

  // 2) latest message for each (small limit to keep it snappy)
  const items = [] as any[];
  for (const c of conversations) {
    try {
      const msgResp = await fbFetchJson<{ data?: FbMessage[] }>(
        `${c.id}/messages?${new URLSearchParams({
          fields: "id,created_time,from,to,message",
          limit: "1",
          access_token: pageToken,
        }).toString()}`
      );
      const m = (msgResp.data || [])[0];
      if (!m) continue;

      const fromName = m.from?.name || "Messenger";
      const text = m.message || c.snippet || "";
      const created = m.created_time ? new Date(m.created_time) : new Date();

      items.push({
        id: `msg_${c.id}__${m.id}`,
        folder: "inbox",
        from: fromName,
        subject: `Conversation Messenger`,
        preview: text,
        bodyPreview: text,
        source: "Messenger",
        threadId: c.id,
        messageId: m.id,
        created_time: created.toISOString(),
        sender_id: m.from?.id ?? null,
      });
    } catch {
      // ignore one conversation
    }
  }

  // Sort newest first
  items.sort((a, b) => Date.parse(b.created_time) - Date.parse(a.created_time));
  return NextResponse.json({ items });
}
