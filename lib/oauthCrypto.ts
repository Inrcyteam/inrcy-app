import "server-only";
import crypto from "crypto";

function getKey(): Buffer {
  const raw = process.env.INRCY_CREDENTIALS_SECRET;
  if (!raw) throw new Error("Missing INRCY_CREDENTIALS_SECRET env var");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INRCY_CREDENTIALS_SECRET must be 32 bytes base64 (32 bytes once decoded)");
  return key;
}

// AES-256-GCM: payload = base64(iv(12) + tag(16) + ciphertext)
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptToken(enc: string): string {
  const key = getKey();
  const buf = Buffer.from(enc, "base64");
  if (buf.length < 12 + 16) throw new Error("Bad encrypted payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export function tryDecryptToken(encOrPlain: string | null | undefined): string | null {
  if (!encOrPlain) return null;
  const s = String(encOrPlain).trim();
  if (!s) return null;
  // If this value was historically stored in clear text inside *_enc columns,
  // decrypting will fail. In that case, return the string as-is to stay backward compatible.
  try {
    return decryptToken(s);
  } catch {
    return s;
  }
}
