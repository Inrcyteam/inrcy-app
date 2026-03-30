import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptSecret } from "@/lib/imapCrypto";
import net from "net";
import { withApi } from "@/lib/observability/withApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (/^10\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip === "0.0.0.0") return true;
  // IPv6 loopback / local
  if (ip === "::1") return true;
  if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true; // unique local
  if (/^fe80:/i.test(ip)) return true; // link-local
  return false;
}

function validateHost(input: string): string {
  const host = String(input || "").trim();
  if (!host) throw new Error("Le serveur de messagerie est manquant.");
  if (host.includes("/") || host.includes("\\")) throw new Error("L'adresse du serveur de messagerie est invalide.");
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("L'adresse du serveur de messagerie est invalide.");

  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new Error("Ce serveur de messagerie n'est pas autorisé.");
  }

  const ipVersion = net.isIP(host);
  if (ipVersion && isPrivateIp(host)) {
    throw new Error("Ce serveur de messagerie n'est pas autorisé.");
  }

  return host;
}

function validatePort(n: number, fallback: number): number {
  const p = Number.isFinite(n) ? Math.trunc(n) : fallback;
  if (p < 1 || p > 65535) throw new Error("Le numéro de port renseigné n'est pas valide.");
  return p;
}

const handler = async (req: Request) => {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const login = String(body.login || "").trim();
    const password = String(body.password || "");

    const imap_host = validateHost(body.imap_host);
    const imap_port = validatePort(Number(body.imap_port ?? 993), 993);
    const imap_secure = !!body.imap_secure;

    const smtp_host = validateHost(body.smtp_host);
    const smtp_port = validatePort(Number(body.smtp_port ?? 587), 587);
    const smtp_secure = !!body.smtp_secure;
    const smtp_starttls = !!body.smtp_starttls;

    if (!login || !password) {
      return NextResponse.json({ error: "Merci de renseigner l'identifiant et le mot de passe." }, { status: 400 });
    }

    const userId = userData.user.id;

    // Only 1 IMAP account per user
    await supabaseAdmin.from("integrations").delete().eq("user_id", userId).eq("category", "mail").eq("provider", "imap");

    // Store the encrypted password in refresh_token_enc (NOT inside settings)
    const password_enc = encryptSecret(password);

    const { data, error } = await supabaseAdmin
      .from("integrations")
      .insert({
        user_id: userId,
        provider: "imap",
        category: "mail",
        product: "imap",
        account_email: login,
        provider_account_id: null,
        status: "connected",
        access_token_enc: null,
        refresh_token_enc: password_enc,
        expires_at: null,
        settings: {
          display_name: "IMAP",
          imap: { host: imap_host, port: imap_port, secure: imap_secure },
          smtp: { host: smtp_host, port: smtp_port, secure: smtp_secure, starttls: smtp_starttls },
        },
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: "Impossible d'enregistrer ce compte de messagerie pour le moment." }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: unknown) {
    const msg = (e instanceof Error ? e.message : String(e)) || "Impossible de connecter cette messagerie pour le moment.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
};

export const POST = withApi(handler, { route: "/api/integrations/imap/connect" });