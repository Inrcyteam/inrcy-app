import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { deleteFactureHistoryItem } from "@/lib/inrsendRetentionCleanup";

type DeletePayload = {
  id?: string;
  source?: "send_items" | "mail_campaigns" | string;
  folder?: string;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as DeletePayload;
    const id = String(body?.id || "").trim();
    const source = String(body?.source || "").trim();
    const folder = String(body?.folder || "").trim().toLowerCase();

    if (!id) {
      return NextResponse.json({ error: "Élément introuvable." }, { status: 400 });
    }
    if (folder !== "factures") {
      return NextResponse.json({ error: "Seules les factures peuvent être supprimées manuellement." }, { status: 400 });
    }
    if (source !== "send_items" && source !== "mail_campaigns") {
      return NextResponse.json({ error: "Type d’élément non pris en charge." }, { status: 400 });
    }

    await deleteFactureHistoryItem(userData.user.id, source, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression impossible pour le moment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
