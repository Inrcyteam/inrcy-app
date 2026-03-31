import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { asRecord, asString } from "@/lib/tsSafe";
import { DEFAULT_INRSEND_SIGNATURE_TEMPLATE, buildInrSendSignature, getInrSendSignatureSettings } from "@/lib/inrsendSignature";

export async function GET() {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const settings = await getInrSendSignatureSettings(supabase as any, user.id);
  const rendered = await buildInrSendSignature({ supabase: supabase as any, userId: user.id });

  return NextResponse.json({
    enabled: settings.enabled,
    template: settings.template,
    preview: rendered.signatureText,
    defaults: {
      template: DEFAULT_INRSEND_SIGNATURE_TEMPLATE,
      variables: [
        "{{prenom}}",
        "{{nom}}",
        "{{nom_complet}}",
        "{{nom_entreprise}}",
        "{{telephone}}",
        "{{email}}",
        "{{adresse}}",
        "{{code_postal}}",
        "{{ville}}",
        "{{boite_mail}}",
        "{{nom_expediteur}}",
      ],
    },
  });
}

export async function POST(req: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const body = await req.json().catch(() => ({}));
  const enabled = asRecord(body).enabled !== false;
  const template = asString(asRecord(body).template)?.trim() || DEFAULT_INRSEND_SIGNATURE_TEMPLATE;

  const { data: cfgRow } = await (supabase as any).from("pro_tools_configs").select("settings").eq("user_id", user.id).maybeSingle();
  const currentSettings = asRecord(asRecord(cfgRow).settings);
  const nextSettings = {
    ...currentSettings,
    inrsend: {
      ...asRecord(currentSettings.inrsend),
      signature_enabled: enabled,
      signature_template: template,
    },
  };

  const { error } = await (supabase as any)
    .from("pro_tools_configs")
    .upsert({ user_id: user.id, settings: nextSettings }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message || "Impossible d’enregistrer la signature." }, { status: 500 });
  }

  const rendered = await buildInrSendSignature({ supabase: supabase as any, userId: user.id });
  return NextResponse.json({ ok: true, enabled, template, preview: rendered.signatureText });
}
