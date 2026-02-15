import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createSupabaseServer() {
  const cookieStore = await cookies();

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
  });
}

