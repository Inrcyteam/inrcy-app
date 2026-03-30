export type MailAttachmentRef = {
  bucket: string;
  path: string;
  name?: string | null;
  type?: string | null;
  size?: number | null;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseMailAttachmentRefs(input: unknown): MailAttachmentRef[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const rec = asRecord(item);
      const bucket = asString(rec.bucket)?.trim();
      const path = asString(rec.path)?.trim();
      if (!bucket || !path) return null;
      return {
        bucket,
        path,
        name: asString(rec.name)?.trim() || null,
        type: asString(rec.type)?.trim() || null,
        size: asNumber(rec.size),
      } as MailAttachmentRef;
    })
    .filter(Boolean) as MailAttachmentRef[];
}

export async function downloadMailAttachmentRefs(
  supabase: any,
  refs: MailAttachmentRef[]
): Promise<Array<{ filename: string; mimeType?: string; content: Buffer }>> {
  const out: Array<{ filename: string; mimeType?: string; content: Buffer }> = [];

  for (const ref of refs) {
    const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
    if (error || !data) {
      throw new Error(`Impossible de charger la pièce jointe: ${ref.name || ref.path}`);
    }
    const ab = await data.arrayBuffer();
    out.push({
      filename: ref.name || ref.path.split("/").pop() || "piece-jointe",
      mimeType: ref.type || data.type || "application/octet-stream",
      content: Buffer.from(ab),
    });
  }

  return out;
}
