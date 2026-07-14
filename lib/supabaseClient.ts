import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type BrowserSupabaseClient = SupabaseClient;

let browserClient: BrowserSupabaseClient | null = null;

const AUTH_USER_PATH = "/auth/v1/user";
const AUTH_FAILURE_COOLDOWN_MS = 15_000;
let authFailureAt = 0;
let authFailureEventSent = false;

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAuthUserRequest(input: RequestInfo | URL) {
  return getRequestUrl(input).includes(AUTH_USER_PATH);
}

function authFailureResponse() {
  return new Response(
    JSON.stringify({ error: "invalid_token", error_description: "Session expirée." }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

async function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const isAuthUser = isAuthUserRequest(input);
  const now = Date.now();

  if (isAuthUser && authFailureAt && now - authFailureAt < AUTH_FAILURE_COOLDOWN_MS) {
    return authFailureResponse();
  }

  const response = await fetch(input, init);
  if (!isAuthUser) return response;

  if (response.ok) {
    authFailureAt = 0;
    authFailureEventSent = false;
    return response;
  }

  if (response.status === 401 || response.status === 403) {
    authFailureAt = now;
    if (!authFailureEventSent && typeof window !== "undefined") {
      authFailureEventSent = true;
      window.dispatchEvent(new CustomEvent("inrcy:auth-session-invalid"));
    }
  }

  return response;
}

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: { fetch: guardedFetch },
    }
  );

  return browserClient;
}
