import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const AUTH_USER_PATH = "/auth/v1/user";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAuthUserRequest(input: RequestInfo | URL) {
  return requestUrl(input).includes(AUTH_USER_PATH);
}

function unauthenticatedResponse() {
  return new Response(
    JSON.stringify({ error: "invalid_token", error_description: "Session absente." }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some(({ name, value }) => (
    /^sb-.+-auth-token(?:\.\d+)?$/.test(name) && Boolean(value)
  ));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // ⚠️ Next.js interdit parfois l’écriture de cookies en Server Components.
        // On tente quand même, mais on n’explose pas si Next refuse.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // no-op en Server Component (layout/page)
        }
      },
    },
    global: {
      // Ã‰vite les appels rÃ©seau `/auth/v1/user` sans session. Ces appels
      // produisaient des avertissements 403 rÃ©pÃ©tÃ©s lors des chargements
      // parallÃ¨les du dashboard, sans apporter d'information utile.
      fetch: (input, init) => {
        if (!hasAuthCookie && isAuthUserRequest(input)) return Promise.resolve(unauthenticatedResponse());
        return fetch(input, init);
      },
    },
  });
}
