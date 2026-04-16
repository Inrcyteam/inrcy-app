import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";

const ALLOWED_TARGET_STATUSES = new Set(["en_attente_paiement", "envoye", "paye"]);

type FinalizeRpcRow = {
  number?: string | null;
  year?: number | null;
  seq?: number | null;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTargetStatus(value: unknown) {
  const raw = asTrimmedString(value);
  if (ALLOWED_TARGET_STATUSES.has(raw)) return raw;
  return "en_attente_paiement";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const docSaveId = asTrimmedString(body?.docSaveId);
  const targetStatus = normalizeTargetStatus(body?.targetStatus);

  if (!docSaveId) {
    return NextResponse.json({ error: "L'identifiant de la facture est manquant." }, { status: 400 });
  }

  const { data: docRow, error: docError } = await supabase
    .from("doc_saves")
    .select("id,name,payload")
    .eq("id", docSaveId)
    .eq("user_id", userData.user.id)
    .eq("type", "facture")
    .maybeSingle();

  if (docError) return jsonUserFacingError(docError, { status: 500 });
  if (!docRow) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const payload = ((docRow.payload as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const alreadyFinalized = !!payload.isFinalized && asTrimmedString(payload.number);

  let officialNumber = asTrimmedString(payload.number);
  let officialYear = typeof payload.officialSequenceYear === "number" ? payload.officialSequenceYear : null;
  let officialSeq = typeof payload.officialSequenceValue === "number" ? payload.officialSequenceValue : null;

  if (!alreadyFinalized) {
    const { data: rpcData, error: rpcError } = await supabase.rpc("allocate_invoice_number", {
      p_doc_save_id: docSaveId,
    });

    if (rpcError) {
      return jsonUserFacingError(rpcError, {
        status: 500,
        fallback: "La numérotation officielle n’est pas encore configurée dans Supabase.",
        code: "invoice_numbering_not_configured",
      });
    }

    const rpcRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as FinalizeRpcRow | null;
    officialNumber = asTrimmedString(rpcRow?.number);
    officialYear = typeof rpcRow?.year === "number" ? rpcRow.year : officialYear;
    officialSeq = typeof rpcRow?.seq === "number" ? rpcRow.seq : officialSeq;

    if (!officialNumber) {
      return NextResponse.json({ error: "Impossible d’attribuer un numéro officiel à cette facture." }, { status: 500 });
    }
  }

  const nowISO = new Date().toISOString();
  const finalStatus = targetStatus || asTrimmedString(payload.status) || "en_attente_paiement";

  const nextPayload: Record<string, unknown> = {
    ...payload,
    number: officialNumber,
    status: finalStatus,
    isFinalized: true,
    finalizedAt: asTrimmedString(payload.finalizedAt) || nowISO,
    lockedAt: asTrimmedString(payload.lockedAt) || nowISO,
    officialNumberAssignedAt: asTrimmedString(payload.officialNumberAssignedAt) || nowISO,
    officialSequenceYear: officialYear,
    officialSequenceValue: officialSeq,
  };

  const autoName =
    asTrimmedString(nextPayload.clientName) ||
    asTrimmedString(nextPayload.clientEmail) ||
    officialNumber ||
    asTrimmedString(docRow.name) ||
    "Facture";

  const { error: updateError } = await supabase
    .from("doc_saves")
    .update({
      name: autoName,
      payload: nextPayload,
      updated_at: nowISO,
    })
    .eq("id", docSaveId)
    .eq("user_id", userData.user.id)
    .eq("type", "facture");

  if (updateError) return jsonUserFacingError(updateError, { status: 500 });

  return NextResponse.json({
    ok: true,
    docSaveId,
    number: officialNumber,
    status: finalStatus,
    isFinalized: true,
    finalizedAt: String(nextPayload.finalizedAt || nowISO),
    lockedAt: String(nextPayload.lockedAt || nowISO),
    officialSequenceYear: officialYear,
    officialSequenceValue: officialSeq,
  });
}
