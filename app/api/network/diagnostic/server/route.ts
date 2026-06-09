type CheckStatus = "ok" | "http" | "fail" | "skipped";

type ServerCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  httpStatus?: number;
  durationMs?: number;
  message: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 7000;

function getSupabaseConfig() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  try {
    return {
      url: rawUrl ? new URL(rawUrl) : null,
      anonKey,
    };
  } catch {
    return {
      url: null,
      anonKey,
    };
  }
}

function publicHost(url: URL | null): string | null {
  if (!url) return null;
  return url.host;
}

async function timedFetch(url: string, init?: RequestInit): Promise<{ response: Response; durationMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    return {
      response,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(anonKey: string): HeadersInit {
  return anonKey
    ? {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      }
    : {};
}

async function runHttpCheck(key: string, label: string, url: string, init?: RequestInit): Promise<ServerCheck> {
  try {
    const { response, durationMs } = await timedFetch(url, init);
    const status: CheckStatus = response.ok ? "ok" : "http";

    return {
      key,
      label,
      status,
      httpStatus: response.status,
      durationMs,
      message: response.ok
        ? "Réponse serveur reçue correctement."
        : `Réponse HTTP reçue (${response.status}). Le domaine est joignable côté serveur iNrCy.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";

    return {
      key,
      label,
      status: "fail",
      message: `Impossible de joindre ce service côté serveur iNrCy : ${message}`,
    };
  }
}

export async function GET() {
  const { url, anonKey } = getSupabaseConfig();
  const headers = buildHeaders(anonKey);
  const checks: ServerCheck[] = [];

  if (!url || !anonKey) {
    checks.push({
      key: "supabase-config",
      label: "Configuration Supabase serveur",
      status: "fail",
      message: "Variables NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes.",
    });
  } else {
    checks.push({
      key: "supabase-config",
      label: "Configuration Supabase serveur",
      status: "ok",
      message: "Variables publiques Supabase présentes côté serveur.",
    });

    checks.push(
      await runHttpCheck("server-auth", "Supabase Auth depuis Vercel", `${url.origin}/auth/v1/health`, {
        headers,
      })
    );

    checks.push(
      await runHttpCheck("server-storage", "Supabase Storage depuis Vercel", `${url.origin}/storage/v1/bucket`, {
        headers,
      })
    );
  }

  const failed = checks.filter((check) => check.status === "fail").length;
  const warning = checks.filter((check) => check.status === "http").length;

  return Response.json(
    {
      ok: failed === 0,
      warning: warning > 0,
      timestamp: new Date().toISOString(),
      supabaseHost: publicHost(url),
      checks,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-inrcy-diagnostic": "1",
      },
    }
  );
}
