export type BoosterGenerationContextClientScope =
  | "all"
  | "professional"
  | "publications";

export async function prewarmBoosterGenerationContextClient(): Promise<boolean> {
  try {
    const response = await fetch("/api/booster/generation-context", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function invalidateBoosterGenerationContextClient(
  scope: BoosterGenerationContextClientScope = "all",
): Promise<boolean> {
  try {
    const response = await fetch("/api/booster/generation-context", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
      cache: "no-store",
      credentials: "include",
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
