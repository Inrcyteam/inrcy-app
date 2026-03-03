import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { sendTxMail } from "@/lib/txMailer";
import { findBoutiqueProduct } from "@/lib/boutique/products";
import { optionalEnv } from "@/lib/env";

type OrderBody = {
  productKey: string;
  method: "EUR" | "UI";
};

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(req: Request) {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return badRequest("Body JSON invalide.");
  }

  const productKey = String(body?.productKey ?? "").trim();
  const method = body?.method;
  if (!productKey) return badRequest("productKey manquant.");
  if (method !== "EUR" && method !== "UI") return badRequest("method invalide.");

  const product = findBoutiqueProduct(productKey);
  if (!product) return badRequest("Produit inconnu.");

  const supabase = await createSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }

  const user = userData.user;

  // Admin email = email pro renseigné dans le profil (si dispo)
  const [profileRes, balanceRes] = await Promise.all([
    supabase.from("profiles").select("contact_email").eq("user_id", user.id).maybeSingle(),
    supabase.from("loyalty_balance").select("balance").eq("user_id", user.id).maybeSingle(),
  ]);

  const adminEmail = String((profileRes.data as any)?.contact_email ?? "").trim() || null;
  const uiBalance = Number((balanceRes.data as any)?.balance ?? 0);
  const safeBalance = Number.isFinite(uiBalance) ? uiBalance : 0;

  // UI orders must have sufficient balance (server-side guard)
  if (method === "UI" && safeBalance < product.priceUi) {
    return NextResponse.json(
      { ok: false, error: "Solde UI insuffisant pour cette commande." },
      { status: 400 }
    );
  }

  // Recipient for boutique orders (configurable via env)
  const to = optionalEnv("BOUTIQUE_EMAIL", "boutique@inrcy.com");
  const subject = `Commande Boutique iNrCy — ${product.title} (${method === "EUR" ? "€" : "UI"})`;

  const lines = [
    `Bonjour,`,
    ``,
    `Nouvelle commande Boutique iNrCy :`,
    `- Produit : ${product.title} (${product.key})`,
    `- Mode : ${method === "EUR" ? "€" : "UI"}`,
    `- Prix : ${method === "EUR" ? `${product.priceEur} €` : `${product.priceUi} UI`}`,
    ``,
    `---`,
    `Compte :`,
    `- Email compte (auth) : ${user.email ?? "(non disponible)"}`,
    `- Email admin (profil) : ${adminEmail ?? "(non disponible)"}`,
    `- User ID : ${user.id}`,
    `- Solde UI (indicatif) : ${safeBalance}`,
    ``,
    `Envoyé automatiquement depuis l'application iNrCy.`,
  ];

  try {
    await sendTxMail({
      to,
      subject,
      text: lines.join("\n"),
    });
  } catch (e: any) {
    // Don't leak SMTP details
    return NextResponse.json(
      { ok: false, error: "Impossible d'envoyer la commande pour le moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
