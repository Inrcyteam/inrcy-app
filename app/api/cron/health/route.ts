import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { withApi } from "@/lib/observability/withApi";
import { optionalEnv, requireEnv } from "@/lib/env";
import { runDeepHealthChecks } from "@/lib/health/checks";
import { log } from "@/lib/observability/logger";
import { sendTxMail } from "@/lib/txMailer";

export const runtime = "nodejs";

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.VERCEL_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!cronSecret) return false;

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
  const querySecret = new URL(req.url).searchParams.get("secret") || "";

  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

function getRedis() {
  const url = requireEnv("KV_REST_API_URL");
  const token = requireEnv("KV_REST_API_TOKEN");
  return new Redis({ url, token });
}

function buildAlertBody(report: Awaited<ReturnType<typeof runDeepHealthChecks>>) {
  const lines = [
    `Santé infra iNrCy: ${report.ok ? "OK" : "KO"}`,
    `Date: ${report.ts}`,
    `Version: ${report.version || "n/a"}`,
    `Durée totale: ${report.total_ms} ms`,
    "",
    ...Object.entries(report.checks).map(([name, check]) => {
      const parts = [name, check.ok ? "OK" : "KO"];
      if (check.skipped) parts.push("skipped");
      if (typeof check.ms === "number") parts.push(`${check.ms} ms`);
      if (check.error) parts.push(`error=${check.error}`);
      return `- ${parts.join(" | ")}`;
    }),
  ];

  return lines.join("\n");
}

async function sendFailureAlert(report: Awaited<ReturnType<typeof runDeepHealthChecks>>) {
  const alertTo = optionalEnv("HEALTHCHECK_ALERT_TO", "").trim();
  if (!alertTo) return false;

  const dedupeSeconds = Number(optionalEnv("HEALTHCHECK_ALERT_DEDUPE_SECONDS", "21600"));
  let shouldSend = true;

  try {
    const redis = getRedis();
    const key = `healthcheck:alert:${new Date().toISOString().slice(0, 13)}`;
    const res = await redis.set(key, "1", {
      nx: true,
      ex: Number.isFinite(dedupeSeconds) && dedupeSeconds > 0 ? dedupeSeconds : 21600,
    });
    shouldSend = res === "OK";
  } catch {
    shouldSend = true;
  }

  if (!shouldSend) return false;

  const text = buildAlertBody(report);
  await sendTxMail({
    to: alertTo,
    subject: "iNrCy — Alerte healthcheck infra",
    text,
    html: `<pre>${text}</pre>`,
  });
  return true;
}

export const GET = withApi(async (req) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 401 });
  }

  const report = await runDeepHealthChecks();
  let alertSent = false;

  if (!report.ok) {
    try {
      alertSent = await sendFailureAlert(report);
    } catch (error) {
      log.error("cron_health_alert_failed", {
        route: "/api/cron/health",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    log.error("cron_health_failed", {
      route: "/api/cron/health",
      checks: report.checks,
      total_ms: report.total_ms,
      alert_sent: alertSent,
    });
  } else {
    log.info("cron_health_ok", {
      route: "/api/cron/health",
      total_ms: report.total_ms,
    });
  }

  return NextResponse.json(
    {
      ...report,
      alert_sent: alertSent,
    },
    { status: report.ok ? 200 : 503 }
  );
}, { route: "/api/cron/health" });
