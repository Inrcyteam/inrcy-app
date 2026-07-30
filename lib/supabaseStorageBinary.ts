/**
 * Version du contrat binaire utilisé par les écritures Storage exécutées côté
 * serveur. Le marqueur permet de distinguer les variantes historiques qui
 * doivent encore être vérifiées/réparées.
 */
export const SUPABASE_STORAGE_BINARY_UPLOAD_VERSION = 1;

/**
 * Retourne un ArrayBuffer autonome couvrant exactement les octets reçus.
 *
 * Sous Next/Vercel, transmettre directement un Buffer Node à storage-js peut
 * le faire passer par une branche de sérialisation texte. Les octets UTF-8
 * produits ne correspondent alors plus au JPEG/PNG/MP4 d'origine. Une copie
 * explicite vers un ArrayBuffer standard supprime cette ambiguïté, y compris
 * lorsque le Buffer est une vue décalée dans un pool Node plus grand.
 */
export function toExactStorageArrayBuffer(
  input: Buffer | Uint8Array | ArrayBuffer,
): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input.slice(0);
  }

  const output = new Uint8Array(input.byteLength);
  output.set(
    new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
  );
  return output.buffer;
}

export function withStorageBinaryMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  return {
    ...(metadata || {}),
    storage_binary_upload_version: SUPABASE_STORAGE_BINARY_UPLOAD_VERSION,
  };
}
