import "server-only";

/**
 * Minimal env helpers: fail fast with a clear error message.
 * (No runtime dependency, safe for Vercel/Next.)
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
