/**
 * Réseaux pros / postes sécurisés : certains proxys d'entreprise autorisent
 * app.inrcy.com mais bloquent les appels navigateur vers *.supabase.co.
 *
 * On garde l'URL Supabase officielle dans le client pour ne pas changer les
 * clés de session/cookies, puis on réécrit uniquement les requêtes navigateur
 * compatibles vers une route same-origin iNrCy.
 *
 * Sécurité : la route proxy ne reçoit jamais la clé service_role. Elle ne fait
 * que relayer les requêtes du navigateur avec la clé anon + le JWT utilisateur,
 * donc les règles RLS Supabase restent appliquées comme avant.
 */

const DISABLE_COMPAT_FLAG = "0";

function getSupabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof window.location?.origin === "string";
}

function getHeaderValue(headers: HeadersInit | undefined, name: string): string {
  if (!headers) return "";

  if (headers instanceof Headers) return headers.get(name) || "";

  const lowerName = name.toLowerCase();
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => String(key).toLowerCase() === lowerName);
    return found ? String(found[1] || "") : "";
  }

  const record = headers as Record<string, string | number | boolean | undefined>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === lowerName) return String(value ?? "");
  }

  return "";
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const initMethod = init?.method;
  if (initMethod) return String(initMethod).toUpperCase();

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }

  return "GET";
}

function getRequestContentType(input: RequestInfo | URL, init?: RequestInit): string {
  const initContentType = getHeaderValue(init?.headers, "content-type");
  if (initContentType) return initContentType.toLowerCase();

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.headers.get("content-type")?.toLowerCase() || "";
  }

  return "";
}

function isStorageUploadLikeRequest(pathname: string, method: string, contentType: string): boolean {
  if (!pathname.startsWith("/storage/v1/")) return false;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;

  // Les petites opérations JSON storage (createSignedUrl, remove, list, etc.)
  // peuvent passer par le proxy. Les vrais uploads binaires restent directs
  // pour éviter les limites de body côté Vercel.
  if (contentType.includes("application/json")) return false;

  return true;
}

function shouldUseNetworkCompat(): boolean {
  if (!isBrowserRuntime()) return false;
  if (process.env.NEXT_PUBLIC_INRCY_NETWORK_COMPAT === DISABLE_COMPAT_FLAG) return false;
  return true;
}

function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function buildSupabaseProxyUrl(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (!shouldUseNetworkCompat()) return null;

  const supabaseOrigin = getSupabaseOrigin();
  if (!supabaseOrigin) return null;

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(getUrlString(input));
  } catch {
    return null;
  }

  if (sourceUrl.origin !== supabaseOrigin) return null;

  const pathname = sourceUrl.pathname;
  const isSupportedSupabasePath =
    pathname.startsWith("/rest/v1/") ||
    pathname.startsWith("/auth/v1/") ||
    pathname.startsWith("/storage/v1/") ||
    pathname.startsWith("/functions/v1/");

  if (!isSupportedSupabasePath) return null;

  const method = getRequestMethod(input, init);
  const contentType = getRequestContentType(input, init);

  if (isStorageUploadLikeRequest(pathname, method, contentType)) {
    return null;
  }

  return `${window.location.origin}/api/network/supabase-proxy${pathname}${sourceUrl.search}`;
}

function buildProxyRequest(input: RequestInfo | URL, proxyUrl: string, init?: RequestInit): RequestInfo | URL {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return new Request(proxyUrl, input);
  }

  return proxyUrl;
}

function canRetryDirect(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = getRequestMethod(input, init);
  return method === "GET" || method === "HEAD";
}

export const supabaseNetworkCompatFetch: typeof fetch = async (input, init) => {
  const proxyUrl = buildSupabaseProxyUrl(input, init);

  if (!proxyUrl) {
    return fetch(input, init);
  }

  try {
    const response = await fetch(buildProxyRequest(input, proxyUrl, init), init);

    // Fallback ultra prudent : si notre proxy same-origin est indisponible,
    // on retente l'ancien comportement direct uniquement pour les lectures.
    if ((response.status === 502 || response.status === 503 || response.status === 504) && canRetryDirect(input, init)) {
      try {
        return await fetch(input, init);
      } catch {
        return response;
      }
    }

    return response;
  } catch (error) {
    if (canRetryDirect(input, init)) {
      try {
        return await fetch(input, init);
      } catch {
        // On remonte l'erreur initiale pour garder le diagnostic réseau.
      }
    }

    throw error;
  }
};
