import { NextResponse } from "next/server";

import { createSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  const ready = !error && Boolean(data?.user);

  return NextResponse.json(
    { ready },
    {
      status: ready ? 200 : 401,
      headers: {
        "cache-control": "private, no-store, no-cache, max-age=0, must-revalidate",
      },
    },
  );
}
