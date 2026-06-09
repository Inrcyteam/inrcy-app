import { createBrowserClient } from "@supabase/ssr";

import { supabaseNetworkCompatFetch } from "@/lib/supabaseNetworkCompat";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        fetch: supabaseNetworkCompatFetch,
      },
    }
  );
}
