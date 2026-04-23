export function isUpstashEnabled() {
  if (process.env.DISABLE_UPSTASH === "1") return false;
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_UPSTASH_IN_DEV !== "1") {
    return false;
  }
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function shouldBypassUpstashInCurrentEnv() {
  return !isUpstashEnabled();
}
