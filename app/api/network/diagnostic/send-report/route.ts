import { NextRequest, NextResponse } from "next/server";

import { sendTxMail } from "@/lib/txMailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_TO = process.env.INRCY_DIAGNOSTIC_REPORT_TO || "contact@inrcy.com";
const MAX_FIELD_LENGTH = 600;
const MAX_REPORT_LENGTH = 20_000;

type DiagnosticReportBody = {
  report?: unknown;
  summary?: unknown;
  clientName?: unknown;
  company?: unknown;
  phone?: unknown;
  message?: unknown;
  url?: unknown;
  userAgent?: unknown;
};

function asText(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSubject(summary: string, company: string): string {
  const suffix = company ? ` · ${company}` : "";
  const shortSummary = summary ? summary.slice(0, 70) : "Diagnostic réseau";
  return `Diagnostic réseau iNrCy${suffix} · ${shortSummary}`.slice(0, 140);
}

function buildText(payload: {
  clientName: string;
  company: string;
  phone: string;
  message: string;
  summary: string;
  url: string;
  userAgent: string;
  report: string;
}) {
  return [
    "Nouveau diagnostic réseau iNrCy",
    "",
    `Destinataire : ${REPORT_TO}`,
    `Date serveur : ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    `Nom : ${payload.clientName || "-"}`,
    `Société : ${payload.company || "-"}`,
    `Téléphone : ${payload.phone || "-"}`,
    `Message : ${payload.message || "-"}`,
    `Résumé : ${payload.summary || "-"}`,
    `URL : ${payload.url || "-"}`,
    `Navigateur : ${payload.userAgent || "-"}`,
    "",
    "--- Rapport technique ---",
    payload.report,
  ].join("\n");
}

function buildHtml(payload: {
  clientName: string;
  company: string;
  phone: string;
  message: string;
  summary: string;
  url: string;
  userAgent: string;
  report: string;
}) {
  const rows = [
    ["Nom", payload.clientName || "-"],
    ["Société", payload.company || "-"],
    ["Téléphone", payload.phone || "-"],
    ["Message", payload.message || "-"],
    ["Résumé", payload.summary || "-"],
    ["URL", payload.url || "-"],
    ["Navigateur", payload.userAgent || "-"],
  ];

  return `
    <div style="margin:0;padding:26px;background:#07101f;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;border-radius:24px;overflow:hidden;background:#ffffff;border:1px solid #e5e7eb;box-shadow:0 24px 60px rgba(0,0,0,.18);">
        <div style="padding:24px 26px;background:linear-gradient(135deg,#0b1633,#1c2f62 58%,#ff9b4b);color:#ffffff;">
          <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.14);font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">iNrCy · Diagnostic réseau</div>
          <h1 style="margin:16px 0 6px;font-size:26px;line-height:1.1;">Nouveau rapport reçu</h1>
          <p style="margin:0;color:rgba(255,255,255,.82);font-size:15px;line-height:1.5;">Un client a envoyé un diagnostic depuis la page /diagnostic.</p>
        </div>
        <div style="padding:24px 26px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <td style="width:130px;padding:10px 0;color:#64748b;border-bottom:1px solid #eef2f7;vertical-align:top;">${escapeHtml(label)}</td>
                    <td style="padding:10px 0;color:#0f172a;border-bottom:1px solid #eef2f7;vertical-align:top;font-weight:700;">${escapeHtml(value)}</td>
                  </tr>`
              )
              .join("")}
          </table>
          <h2 style="margin:24px 0 10px;font-size:18px;color:#0f172a;">Rapport technique</h2>
          <pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:16px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font-size:12px;line-height:1.55;">${escapeHtml(payload.report)}</pre>
        </div>
      </div>
    </div>`;
}

export async function POST(req: NextRequest) {
  let body: DiagnosticReportBody;

  try {
    body = (await req.json()) as DiagnosticReportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "json_invalid" }, { status: 400 });
  }

  const report = asText(body.report, MAX_REPORT_LENGTH);
  const summary = asText(body.summary, 300);
  const clientName = asText(body.clientName);
  const company = asText(body.company);
  const phone = asText(body.phone, 80);
  const message = asText(body.message, 1_200);
  const url = asText(body.url, 1_000);
  const userAgent = asText(body.userAgent, 1_500) || asText(req.headers.get("user-agent"), 1_500);

  if (!report) {
    return NextResponse.json({ ok: false, error: "report_required" }, { status: 400 });
  }

  const payload = { clientName, company, phone, message, summary, url, userAgent, report };

  try {
    await sendTxMail({
      to: REPORT_TO,
      subject: buildSubject(summary, company),
      text: buildText(payload),
      html: buildHtml(payload),
    });

    return NextResponse.json(
      { ok: true, to: REPORT_TO },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-inrcy-diagnostic": "1",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    console.error("[diagnostic/send-report] email failed", message);

    return NextResponse.json(
      { ok: false, error: "mail_send_failed" },
      {
        status: 500,
        headers: {
          "cache-control": "no-store",
          "x-inrcy-diagnostic": "1",
        },
      }
    );
  }
}
