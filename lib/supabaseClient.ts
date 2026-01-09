import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!anon) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");

  // ✅ Ici url et anon sont garantis string
  return createSupabaseClient(url, anon);
}

