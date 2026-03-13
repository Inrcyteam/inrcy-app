import "server-only";

import nodemailer from "nodemailer";
import { Redis } from "@upstash/redis";
import { requireEnv, optionalEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeGet } from "@/lib/stripeRest";

export type HealthCheckName = "supabase" | "kv" | "stripe" | "smtp";

export type HealthCheckResult = {
  ok: boolean;
  ms: number | null;
  skipped?: boolean;
  error?: string | null;
};

export type DeepHealthReport = {
  ok: boolean;
  ts: string;
  version: string | null;
  total_ms: number;
  checks: Record<HealthCheckName, HealthCheckResult>;
};

type GlobalWithHealthRedis = typeof globalThis & {
  __inrcy_health_redis?: Redis;
};

function getVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    null
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "unknown_error");
}

async function timeCheck(fn: () => Promise<void>): Promise<HealthCheckResult> {
  const t0 = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t0, error: null };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - t0,
      error: normalizeError(error),
    };
  }
}

function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  const g = globalThis as GlobalWithHealthRedis;
  if (!g.__inrcy_health_redis) {
    g.__inrcy_health_redis = new Redis({ url, token });
  }
  return g.__inrcy_health_redis as Redis;
}

function canCheckSmtp() {
  return Boolean(
    process.env.TX_SMTP_HOST &&
      process.env.TX_SMTP_PORT &&
      process.env.TX_SMTP_USER &&
      process.env.TX_SMTP_PASS
  );
}

async function checkSupabase() {
  return timeCheck(async () => {
    const { error } = await supabaseAdmin.from("profiles").select("user_id").limit(1);
    if (error) throw new Error(error.message);
  });
}

async function checkKv() {
  return timeCheck(async () => {
    const redis = getRedis();
    await redis.ping();
  });
}

async function checkStripe() {
  return timeCheck(async () => {
    await stripeGet("/balance");
  });
}

async function checkSmtp(): Promise<HealthCheckResult> {
  if (!canCheckSmtp()) {
    return {
      ok: true,
      ms: null,
      skipped: true,
      error: null,
    };
  }

  return timeCheck(async () => {
    const host = requireEnv("TX_SMTP_HOST");
    const port = Number(requireEnv("TX_SMTP_PORT"));
    const user = requireEnv("TX_SMTP_USER");
    const pass = requireEnv("TX_SMTP_PASS");
    const secureEnv = optionalEnv("TX_SMTP_SECURE", "");
    const isProd = process.env.NODE_ENV === "production";
    const tlsRejectUnauthorized =
      optionalEnv("TX_SMTP_TLS_REJECT_UNAUTHORIZED", isProd ? "true" : "false") !== "false";
    const secure =
      secureEnv === "true" ? true : secureEnv === "false" ? false : port === 465;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
      tls: {
        rejectUnauthorized: tlsRejectUnauthorized,
      },
    });

    await transporter.verify();
  });
}

export async function runPublicHealthCheck() {
  const started = Date.now();
  const supabase = await checkSupabase();

  return {
    ok: supabase.ok,
    ts: new Date().toISOString(),
    version: getVersion(),
    total_ms: Date.now() - started,
  };
}

export async function runDeepHealthChecks(): Promise<DeepHealthReport> {
  const started = Date.now();

  const [supabase, kv, stripe, smtp] = await Promise.all([
    checkSupabase(),
    checkKv(),
    checkStripe(),
    checkSmtp(),
  ]);

  const checks: Record<HealthCheckName, HealthCheckResult> = {
    supabase,
    kv,
    stripe,
    smtp,
  };

  const ok = Object.values(checks).every((check) => check.ok);

  return {
    ok,
    ts: new Date().toISOString(),
    version: getVersion(),
    total_ms: Date.now() - started,
    checks,
  };
}
