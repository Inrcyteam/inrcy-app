import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TxMailAttachment } from "@/lib/txMailer";

export const INRCY_EMAIL_LOGO_CID = "inrcy-logo@inrcy";
export const INRCY_SIGNATURE_CID = "inrcy-signature@inrcy";

const LOGO_INLINE_ATTACHMENT_SPEC = {
  filename: "inrcy-logo-email.png",
  mimeType: "image/png",
  cid: INRCY_EMAIL_LOGO_CID,
  filePath: path.join(process.cwd(), "public/email/inrcy-logo-email.png"),
} as const;

const SIGNATURE_INLINE_ATTACHMENT_SPEC = {
  filename: "signature-client.png",
  mimeType: "image/png",
  cid: INRCY_SIGNATURE_CID,
  filePath: path.join(process.cwd(), "public/signature-client.png"),
} as const;

const BRAND_INLINE_ATTACHMENT_SPECS = [LOGO_INLINE_ATTACHMENT_SPEC, SIGNATURE_INLINE_ATTACHMENT_SPEC] as const;

async function buildInlineAttachment(asset: typeof BRAND_INLINE_ATTACHMENT_SPECS[number]): Promise<TxMailAttachment> {
  return {
    filename: asset.filename,
    mimeType: asset.mimeType,
    content: await readFile(asset.filePath),
    inline: true,
    cid: asset.cid,
  };
}

function cloneAttachments(attachments: TxMailAttachment[]) {
  return attachments.map((attachment) => ({
    ...attachment,
    content: Buffer.from(attachment.content),
  }));
}

let logoInlineAttachmentsPromise: Promise<TxMailAttachment[]> | null = null;
let brandInlineAttachmentsPromise: Promise<TxMailAttachment[]> | null = null;

export function getInrcyLogoInlineAttachments() {
  if (!logoInlineAttachmentsPromise) {
    logoInlineAttachmentsPromise = buildInlineAttachment(LOGO_INLINE_ATTACHMENT_SPEC).then((attachment) => [attachment]);
  }
  return logoInlineAttachmentsPromise.then(cloneAttachments);
}

export function getInrcyBrandInlineAttachments() {
  if (!brandInlineAttachmentsPromise) {
    brandInlineAttachmentsPromise = Promise.all(BRAND_INLINE_ATTACHMENT_SPECS.map(buildInlineAttachment));
  }
  return brandInlineAttachmentsPromise.then(cloneAttachments);
}
