import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type PayloadV1 = {
  v: 1;
  domain: string;
  source: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeDomain(input: string | null): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    return (u.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

function sign(payload: PayloadV1, secret: string) {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export async function GET(req: Request) {
  try {
    const secret = process.env.INRCY_WIDGETS_SIGNING_SECRET;
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: "Missing INRCY_WIDGETS_SIGNING_SECRET" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const domain = normalizeDomain(searchParams.get("domain"));
    const source = (searchParams.get("source") || "").trim();

    if (!domain) {
      return NextResponse.json({ ok: false, error: "Missing domain" }, { status: 400 });
    }
    if (source !== "inrcy_site" && source !== "site_web") {
      return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400 });
    }

    // Must be an authenticated dashboard user.
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Extra safety: ensure the domain belongs to THIS user for this source.
    if (source === "inrcy_site") {
      const { data, error } = await supabase
        .from("inrcy_site_configs")
        .select("site_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      const d = normalizeDomain((data as any)?.site_url || "");
      if (!d || d !== domain) {
        return NextResponse.json(
          { ok: false, error: "Domain not linked to your iNrCy site" },
          { status: 403 }
        );
      }
    } else {
      const { data, error } = await supabase
        .from("pro_tools_configs")
        .select("settings")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const d = normalizeDomain((data as any)?.settings?.site_web?.url || "");
      if (!d || d !== domain) {
        return NextResponse.json(
          { ok: false, error: "Domain not linked to your website" },
          { status: 403 }
        );
      }
    }

    const now = Math.floor(Date.now() / 1000);
    // Long-lived token (1 year). Rotation is possible by changing the signing secret.
    const payload: PayloadV1 = {
      v: 1,
      domain,
      source,
      iat: now,
      exp: now + 60 * 60 * 24 * 365,
    };

    const token = sign(payload, secret);
    return NextResponse.json({ ok: true, token, payload }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
