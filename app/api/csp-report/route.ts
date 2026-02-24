import { NextResponse } from "next/server";

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

    let payload: any = null;
    if (contentType.includes("application/json") || contentType.includes("application/csp-report")) {
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
    // Browsers often send either {"csp-report": {...}} or Reporting API shapes.
    const report = payload?.["csp-report"] ?? payload?.report ?? payload;

    const summary = {
      ua: req.headers.get("user-agent") || undefined,
      ref: req.headers.get("referer") || undefined,
      violatedDirective: report?.["violated-directive"] ?? report?.violatedDirective,
      effectiveDirective: report?.["effective-directive"] ?? report?.effectiveDirective,
      blockedUri: report?.["blocked-uri"] ?? report?.blockedURL ?? report?.blockedUri,
      disposition: report?.disposition,
    };

    // In production, keep it compact.
    // In development, you may want the full payload to tune the policy.
    if (process.env.NODE_ENV === "development") {
      console.log("[csp] report", { summary, payload });
    } else {
      console.log("[csp] report", summary);
    }
  } catch {
    // Never fail the caller
  }

  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
