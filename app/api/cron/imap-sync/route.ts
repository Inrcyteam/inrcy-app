import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Vérifie que c'est bien Vercel Cron qui appelle.
 * Vercel peut envoyer le secret dans le header Authorization (Bearer …)
 * quand CRON_SECRET est défini côté env. :contentReference[oaicite:1]{index=1}
 */
function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // si tu veux le laisser ouvert en dev

  const auth = req.headers.get("authorization") || "";
  // Vercel envoie généralement: "Bearer <CRON_SECRET>"
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

  if (token !== secret) {
    throw new Error("Unauthorized cron");
  }
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    // 1) Récupérer les comptes IMAP à sync
    const { data: accounts, error } = await supabase
      .from("mail_accounts")
      .select("id")
      .eq("provider", "imap") // adapte si ton champ est différent
      .eq("is_connected", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ids = (accounts || []).map((a) => a.id);

    // 2) Limite de sécurité (si tu as une règle 4 boîtes max, tu peux juste sync celles actives)
    // Ici on sync tout ce qui est connecté.
    let ok = 0;
    let fail = 0;

    // 3) Appeler ton endpoint "sync" existant (celui que tu as déjà fait)
    // IMPORTANT: on appelle en interne via fetch en URL absolue
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || // mets ton domaine ici en env
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

    for (const accountId of ids) {
      try {
        const res = await fetch(`${baseUrl}/api/inbox/imap/sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId })
        });

        if (!res.ok) {
          fail++;
          continue;
        }
        ok++;
      } catch {
        fail++;
      }
    }

    return NextResponse.json({ success: true, ok, fail, total: ids.length });
  } catch (e: any) {
    const msg = e?.message || "Cron error";
    const status = msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
