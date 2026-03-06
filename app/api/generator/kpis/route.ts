import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { buildMetricsSummary } from '@/lib/metrics/summary';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

type AnyRec = Record<string, unknown>;

/**
 * Compat route kept for the dashboard.
 * The real computation is now centralized in /api/metrics/summary via buildMetricsSummary().
 */
export async function GET(req: Request) {
  const debug: AnyRec = {
    ok: false,
    errors: {},
    env: {
      has_SUPABASE_URL: !!SUPABASE_URL,
    },
  };

  try {
    if (!SUPABASE_URL) {
      return NextResponse.json(
        {
          error: 'Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
          debug,
        },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr && typeof authErr.message === 'string') {
      (debug.errors as Record<string, string>).auth = authErr.message;
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', debug: process.env.NODE_ENV === 'development' ? debug : undefined },
        { status: 401 }
      );
    }

    const { searchParams, origin } = new URL(req.url);
    const monthDays = Math.max(1, Number(searchParams.get('monthDays') || 30));
    const weekDays = Math.max(1, Number(searchParams.get('weekDays') || 7));
    const todayDays = Math.max(1, Number(searchParams.get('todayDays') || 2));
    const cookie = req.headers.get('cookie') || '';
    const fresh = searchParams.get('fresh') === '1';

    const summary = await buildMetricsSummary({
      supabase,
      userId: user.id,
      origin,
      getHeaders: () => (cookie ? { cookie } : undefined),
      monthDays,
      weekDays,
      todayDays,
      debug,
      fresh,
    });

    debug.ok = true;

    const includeDebug = process.env.NODE_ENV === 'development' || req.headers.get('x-inrcy-debug') === '1';

    return NextResponse.json({
      ...summary,
      ...(includeDebug ? { debug } : {}),
    });
  } catch (e: unknown) {
    (debug.errors as Record<string, string>).unhandled = e instanceof Error ? e.message : String(e);
    const includeDebug = process.env.NODE_ENV === 'development' || req.headers.get('x-inrcy-debug') === '1';
    return NextResponse.json(
      { error: (debug.errors as Record<string, string>).unhandled, ...(includeDebug ? { debug } : {}) },
      { status: 500 }
    );
  }
}
