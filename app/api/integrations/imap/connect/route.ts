import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { encryptSecret } from "@/lib/imapCrypto";
import net from "net";
import { withApi } from "@/lib/observability/withApi";

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
  if (!host) throw new Error("Host manquant");
  if (host.includes("/") || host.includes("\\")) throw new Error("Host invalide");
  if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("Host invalide");

  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new Error("Host interdit");
  }

  const ipVersion = net.isIP(host);
  if (ipVersion && isPrivateIp(host)) {
    throw new Error("Host interdit");
  }

  return host;
}

function validatePort(n: number, fallback: number): number {
  const p = Number.isFinite(n) ? Math.trunc(n) : fallback;
  if (p < 1 || p > 65535) throw new Error("Port invalide");
  return p;
}

const handler = async (req: Request) => {
  const supabase = await createSupabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
    }

    const userId = userData.user.id;

    // Only 1 IMAP account per user
    await supabase.from("integrations").delete().eq("user_id", userId).eq("category", "mail").eq("provider", "imap");

    // Store the encrypted password in refresh_token_enc (NOT inside settings)
    const password_enc = encryptSecret(password);

    const { data, error } = await supabase
      .from("integrations")
      .insert({
        user_id: userId,
        provider: "imap",
        category: "mail",
        product: "imap",
        account_email: login,
        provider_account_id: null,
        status: "connected",
        access_token: null,
        refresh_token: null,
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: unknown) {
    const msg = (e instanceof Error ? e.message : String(e)) || "Connexion impossible";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
};

export const POST = withApi(handler, { route: "/api/integrations/imap/connect" });
