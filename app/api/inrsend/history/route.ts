import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type Folder =
  | "mails"
  | "factures"
  | "devis"
  | "actualites"
  | "avis"
  | "promotion"
  | "informer"
  | "remercier"
  | "satisfaction"
  | "all";

function asString(v: string | null) {
  return (v ?? "").toString();
}

function normalizeFolder(raw: string | null): Folder {
  const f = (raw ?? "").toLowerCase().trim();
  switch (f) {
    case "mails":
    case "mail":
      return "mails";
    case "factures":
    case "facture":
    case "invoices":
    case "invoice":
      return "factures";
    case "devis":
    case "devises":
    case "quotes":
    case "quote":
      return "devis";
    case "actualites":
    case "actualite":
    case "actus":
    case "actu":
      return "actualites";
    case "avis":
    case "reviews":
      return "avis";
    case "promotion":
    case "promotions":
    case "promo":
      return "promotion";
    case "informer":
    case "newsletter":
      return "informer";
    case "remercier":
    case "merci":
    case "thanks":
      return "remercier";
    case "satisfaction":
      return "satisfaction";
    default:
      return "all";
  }
}

type UnifiedItem = {
  id: string;
  source: "send_items" | "booster_events" | "fideliser_events";
  folder: Exclude<Folder, "all">;
  type: string;
  status: string | null;
  to: string | null;
  title: string | null;
  text: string | null;
  html: string | null;
  provider: string | null;
  created_at: string; // ISO
  meta: Record<string, unknown>;
};

function folderFromSendType(t: string | null): UnifiedItem["folder"] {
  const type = (t ?? "mail").toLowerCase();
  if (type === "invoice" || type === "facture") return "factures";
  if (type === "quote" || type === "devis") return "devis";
  return "mails";
}

function folderFromBoosterType(t: string): UnifiedItem["folder"] {
  switch (t) {
    case "publish":
      return "actualites";
    case "review_mail":
      return "avis";
    case "promo_mail":
      return "promotion";
    default:
      return "actualites";
  }
}

function folderFromFideliserType(t: string): UnifiedItem["folder"] {
  switch (t) {
    case "newsletter_mail":
      return "informer";
    case "thanks_mail":
      return "remercier";
    case "satisfaction_mail":
      return "satisfaction";
    default:
      return "informer";
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const folder = normalizeFolder(url.searchParams.get("folder"));
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

    const wantAll = folder === "all";

    // --- SEND ITEMS (mails / factures / devis) ---
    const needSendItems = wantAll || ["mails", "factures", "devis"].includes(folder);
    const sendTypeFilter =
      folder === "factures" ? ["invoice", "facture"] : folder === "devis" ? ["quote", "devis"] : ["mail"];

    let sendItems: UnifiedItem[] = [];
    if (needSendItems) {
      let query = supabase
        .from("send_items")
        .select(
          "id,type,status,to_emails,subject,body_text,body_html,provider,sent_at,created_at,mail_account_id,provider_message_id,provider_thread_id,error"
        )
        .eq("user_id", userData.user.id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!wantAll) {
        query = query.in("type", sendTypeFilter as any);
      }

      if (q) {
        // Only apply server-side filters where safe
        query = query.ilike("subject", `%${q.replace(/%/g, "\\%")}%`);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        sendItems = data.map((r: any) => ({
          id: r.id,
          source: "send_items",
          folder: folderFromSendType(r.type),
          type: r.type ?? "mail",
          status: r.status ?? null,
          to: r.to_emails ?? null,
          title: r.subject ?? null,
          text: r.body_text ?? null,
          html: r.body_html ?? null,
          provider: r.provider ?? null,
          created_at: (r.sent_at ?? r.created_at ?? new Date().toISOString()) as string,
          meta: {
            mail_account_id: r.mail_account_id ?? null,
            provider_message_id: r.provider_message_id ?? null,
            provider_thread_id: r.provider_thread_id ?? null,
            error: r.error ?? null,
          },
        }));
      }
    }

    // --- BOOSTER EVENTS (actus / avis / promotion) ---
    const needBooster = wantAll || ["actualites", "avis", "promotion"].includes(folder);
    const boosterTypeFilter =
      folder === "actualites" ? ["publish"] : folder === "avis" ? ["review_mail"] : folder === "promotion" ? ["promo_mail"] : [];

    let boosterItems: UnifiedItem[] = [];
    if (needBooster) {
      let query = supabase
        .from("booster_events")
        .select("id,type,payload,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!wantAll) query = query.in("type", boosterTypeFilter as any);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        boosterItems = data
          .map((r: any) => {
            const payload = (r.payload ?? {}) as Record<string, unknown>;
            const title =
              (typeof payload.title === "string" && payload.title) ||
              (typeof payload.subject === "string" && payload.subject) ||
              null;

            const to =
              (typeof payload.to === "string" && payload.to) ||
              (Array.isArray(payload.to) ? (payload.to as any[]).join(", ") : null);

            return {
              id: r.id,
              source: "booster_events",
              folder: folderFromBoosterType(r.type),
              type: r.type,
              status: "sent",
              to,
              title,
              text: (typeof payload.text === "string" ? payload.text : null) ?? null,
              html: (typeof payload.html === "string" ? payload.html : null) ?? null,
              provider: (typeof payload.provider === "string" ? payload.provider : null) ?? null,
              created_at: (r.created_at ?? new Date().toISOString()) as string,
              meta: payload,
            } as UnifiedItem;
          })
          .filter((it: UnifiedItem) => {
            if (!q) return true;
            const hay = `${it.title ?? ""} ${it.to ?? ""} ${it.text ?? ""}`.toLowerCase();
            return hay.includes(q.toLowerCase());
          });
      }
    }

    // --- FIDELISER EVENTS (informer / remercier / satisfaction) ---
    const needFideliser = wantAll || ["informer", "remercier", "satisfaction"].includes(folder);
    const fideliserTypeFilter =
      folder === "informer"
        ? ["newsletter_mail"]
        : folder === "remercier"
          ? ["thanks_mail"]
          : folder === "satisfaction"
            ? ["satisfaction_mail"]
            : [];

    let fideliserItems: UnifiedItem[] = [];
    if (needFideliser) {
      let query = supabase
        .from("fideliser_events")
        .select("id,type,payload,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!wantAll) query = query.in("type", fideliserTypeFilter as any);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        fideliserItems = data
          .map((r: any) => {
            const payload = (r.payload ?? {}) as Record<string, unknown>;
            const title =
              (typeof payload.title === "string" && payload.title) ||
              (typeof payload.subject === "string" && payload.subject) ||
              null;

            const to =
              (typeof payload.to === "string" && payload.to) ||
              (Array.isArray(payload.to) ? (payload.to as any[]).join(", ") : null);

            return {
              id: r.id,
              source: "fideliser_events",
              folder: folderFromFideliserType(r.type),
              type: r.type,
              status: "sent",
              to,
              title,
              text: (typeof payload.text === "string" ? payload.text : null) ?? null,
              html: (typeof payload.html === "string" ? payload.html : null) ?? null,
              provider: (typeof payload.provider === "string" ? payload.provider : null) ?? null,
              created_at: (r.created_at ?? new Date().toISOString()) as string,
              meta: payload,
            } as UnifiedItem;
          })
          .filter((it: UnifiedItem) => {
            if (!q) return true;
            const hay = `${it.title ?? ""} ${it.to ?? ""} ${it.text ?? ""}`.toLowerCase();
            return hay.includes(q.toLowerCase());
          });
      }
    }

    const merged = [...sendItems, ...boosterItems, ...fideliserItems].sort((a, b) => {
      const ta = Date.parse(a.created_at);
      const tb = Date.parse(b.created_at);
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });

    const filtered = wantAll ? merged : merged.filter((it) => it.folder === folder);

    return NextResponse.json({
      ok: true,
      folder,
      count: filtered.length,
      items: filtered.slice(0, limit),
    });
  } catch (e) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
