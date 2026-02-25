import { NextResponse } from "next/server";
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// Receives browser CSP violation reports.
// This endpoint should never throw or leak details.
export async function POST(req: Request) {
  try {
    const contentLength = Number(req.headers.get("content-length") || "0");
    // Avoid large payloads (defensive)
    if (contentLength && contentLength > 100_000) {
      return new NextResponse(null, { status: 413 });
    }

    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    let payload: unknown = null;
    // Reporting API (report-to) commonly sends `application/reports+json` with an array payload.
    if (
      contentType.includes("application/json") ||
      contentType.includes("application/csp-report") ||
      contentType.includes("application/reports+json")
    ) {
      try {
        payload = await req.json();
      } catch {
        payload = null;
      }
    } else {
      // Fallback: try to read small text
      try {
        const text = await req.text();
        payload = text?.slice(0, 10_000) || null;
      } catch {
        payload = null;
      }
    }

    // Log a minimal, non-sensitive summary.
    // Shapes we may receive:
    // - Legacy: {"csp-report": {...}}
    // - Some UAs: {"report": {...}}
    // - Reporting API: [{ type: "csp-violation", body: {...}, ... }, ...]

    const ua = req.headers.get("user-agent") || undefined;
    const ref = req.headers.get("referer") || undefined;

    const normalize = (r: Record<string, unknown>) => ({
      violatedDirective: r?.["violated-directive"] ?? r?.violatedDirective,
      effectiveDirective: r?.["effective-directive"] ?? r?.effectiveDirective,
      blockedUri: r?.["blocked-uri"] ?? r?.blockedURL ?? r?.blockedUri,
      documentUri: r?.["document-uri"] ?? r?.documentURL ?? r?.documentUri,
      disposition: r?.disposition,
    });

    let summaries: unknown[] = [];

    if (Array.isArray(payload)) {
      // Reporting API array
      const cspItems = payload.filter(
        (it) => it?.type === "csp-violation" || it?.type === "csp-report" || it?.body?.["violated-directive"]
      );
      summaries = cspItems.map((it) => normalize(it?.body ?? it));
    } else {
      const _payloadRec = asRecord(payload);
      const report = _payloadRec["csp-report"] ?? _payloadRec["report"] ?? _payloadRec;
      summaries = [normalize(report)];
    }

    const compact = {
      ua,
      ref,
      count: summaries.length,
      first: summaries[0],
    };

    // In production, keep it compact.
    // In development, you may want the full payload to tune the policy.
    if (process.env.NODE_ENV === "development") {
      console.log("[csp] report", { compact, payload });
    } else {
      console.log("[csp] report", compact);
    }
  } catch {
    // Never fail the caller
  }

  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
