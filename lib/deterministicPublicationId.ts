import { createHash } from "node:crypto";

/**
 * Builds a UUID-shaped, deterministic child identifier for a durable
 * publication. It is suitable for tables whose primary key is `uuid` and lets
 * a retried channel worker upsert the same provider-side/local resource.
 */
export function buildDeterministicPublicationChildId(params: {
  publicationId: string;
  channel: string;
  resource: string;
}) {
  const publicationId = String(params.publicationId || "").trim();
  const channel = String(params.channel || "").trim().toLowerCase();
  const resource = String(params.resource || "").trim().toLowerCase();
  if (!publicationId || !channel || !resource) {
    throw new Error("deterministic_publication_child_id_input_required");
  }

  const hash = createHash("sha256")
    .update(`inrcy-publication-child:v1:${publicationId}:${channel}:${resource}`)
    .digest("hex")
    .slice(0, 32);
  // RFC 4122 version/variant bits keep the identifier accepted by strict UUID
  // parsers while the remaining bits stay deterministic.
  const versioned = `${hash.slice(0, 12)}5${hash.slice(13)}`;
  const variantNibble = (8 + (Number.parseInt(versioned[16], 16) % 4)).toString(
    16,
  );
  const normalized = `${versioned.slice(0, 16)}${variantNibble}${versioned.slice(17)}`;
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}
