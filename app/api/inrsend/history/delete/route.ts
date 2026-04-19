import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { deleteInrSendHistoryItem, deleteInrSendHistoryItems } from "@/lib/inrsendRetentionCleanup";

type DeletePayload = {
  id?: string;
  source?: "send_items" | "mail_campaigns" | "app_events" | string;
  folder?: string;
  items?: Array<{
    id?: string;
    source?: "send_items" | "mail_campaigns" | "app_events" | string;
    folder?: string;
  }>;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as DeletePayload;
    const allowedFolders = ["mails", "factures", "devis", "publications", "recoltes", "offres", "informations", "suivis", "enquetes"];
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const normalizedItems = rawItems.length
      ? rawItems.map((entry) => ({
          id: String(entry?.id || "").trim(),
          source: String(entry?.source || "").trim(),
          folder: String(entry?.folder || "").trim().toLowerCase(),
        }))
      : [{
          id: String(body?.id || "").trim(),
          source: String(body?.source || "").trim(),
          folder: String(body?.folder || "").trim().toLowerCase(),
        }];

    const items = normalizedItems.filter((entry) => entry.id);
    if (!items.length) {
      return NextResponse.json({ error: "Élément introuvable." }, { status: 400 });
    }
    if (items.some((entry) => !allowedFolders.includes(entry.folder))) {
      return NextResponse.json({ error: "Rubrique non prise en charge." }, { status: 400 });
    }
    if (items.some((entry) => entry.source !== "send_items" && entry.source !== "mail_campaigns" && entry.source !== "app_events")) {
      return NextResponse.json({ error: "Type d’élément non pris en charge." }, { status: 400 });
    }

    const deletedCount = items.length === 1
      ? ((await deleteInrSendHistoryItem(userData.user.id, items[0].source as "send_items" | "mail_campaigns" | "app_events", items[0].id)) ? 1 : 0)
      : await deleteInrSendHistoryItems(
          userData.user.id,
          items.map((entry) => ({ source: entry.source as "send_items" | "mail_campaigns" | "app_events", id: entry.id })),
        );
    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression impossible pour le moment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
