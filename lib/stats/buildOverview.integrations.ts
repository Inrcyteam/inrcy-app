import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatsSourceKey } from "@/lib/googleStats";
import { asRecord, isExpired } from "@/lib/stats/buildOverview.shared";

type GoogleTokenLoader = typeof import("@/lib/googleStats").getGoogleTokenFor;

export function createIntegrationResolvers({
  integrationsAll,
  getGoogleTokenFor,
  supabase,
  userId,
}: {
  integrationsAll: unknown;
  getGoogleTokenFor: GoogleTokenLoader;
  supabase: SupabaseClient;
  userId: string;
}) {
  function hasActiveStoredIntegration(
    row: Record<string, unknown>,
    hasToken: boolean,
  ) {
    return Boolean(
      String(row["status"] || "") === "connected" &&
      row["resource_id"] &&
      hasToken &&
      !isExpired(row["expires_at"]),
    );
  }

  function latestIntegrationAny(
    provider: string,
    source: string,
    product: string,
  ) {
    const allRows = Array.isArray(integrationsAll) ? integrationsAll : [];
    const exactRows = allRows.filter((row) => {
      const record = asRecord(row);
      return (
        String(record["provider"] ?? "") === provider &&
        String(record["source"] ?? "") === source &&
        String(record["product"] ?? "") === product
      );
    });

    // Sécurité prod : si une ancienne migration a sauvé source/product différemment,
    // on retombe sur provider seul au lieu de déclarer le canal déconnecté.
    const rows = exactRows.length
      ? exactRows
      : allRows.filter(
          (row) => String(asRecord(row)["provider"] ?? "") === provider,
        );

    rows.sort((left, right) => {
      const leftRecord = asRecord(left);
      const rightRecord = asRecord(right);
      const leftScore =
        (String(leftRecord["status"] || "") === "connected" ? 100 : 0) +
        (leftRecord["resource_id"] ? 10 : 0) +
        (leftRecord["access_token_enc"] ? 1 : 0);
      const rightScore =
        (String(rightRecord["status"] || "") === "connected" ? 100 : 0) +
        (rightRecord["resource_id"] ? 10 : 0) +
        (rightRecord["access_token_enc"] ? 1 : 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(
        String(leftRecord["updated_at"] ?? leftRecord["created_at"] ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(rightRecord["updated_at"] ?? rightRecord["created_at"] ?? 0),
      ).getTime();
      return rightTime - leftTime;
    });
    return asRecord(rows[0]);
  }

  function bestIntegrationAny(
    provider: string,
    source: string,
    product: string,
    hasToken: (row: Record<string, unknown>) => boolean,
  ) {
    const allRows = Array.isArray(integrationsAll) ? integrationsAll : [];
    const exactRows = allRows.filter((row) => {
      const record = asRecord(row);
      return (
        String(record["provider"] ?? "") === provider &&
        String(record["source"] ?? "") === source &&
        String(record["product"] ?? "") === product
      );
    });
    const fallbackRows = allRows.filter(
      (row) => String(asRecord(row)["provider"] ?? "") === provider,
    );
    const rows = (exactRows.length ? exactRows : fallbackRows).map((row) =>
      asRecord(row),
    );

    rows.sort((left, right) => {
      const leftActive = hasActiveStoredIntegration(left, hasToken(left));
      const rightActive = hasActiveStoredIntegration(right, hasToken(right));
      if (leftActive !== rightActive) return rightActive ? 1 : -1;
      const leftScore =
        (String(left["status"] || "") === "connected" ? 100 : 0) +
        (left["resource_id"] ? 10 : 0) +
        (hasToken(left) ? 1 : 0);
      const rightScore =
        (String(right["status"] || "") === "connected" ? 100 : 0) +
        (right["resource_id"] ? 10 : 0) +
        (hasToken(right) ? 1 : 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftTime = new Date(
        String(left["updated_at"] ?? left["created_at"] ?? 0),
      ).getTime();
      const rightTime = new Date(
        String(right["updated_at"] ?? right["created_at"] ?? 0),
      ).getTime();
      return rightTime - leftTime;
    });

    return asRecord(rows[0]);
  }

  function hasFacebookStoredToken(row: Record<string, unknown>) {
    const meta = asRecord(row["meta"]);
    return Boolean(
      row["access_token_enc"] ||
      meta["user_access_token_enc"] ||
      meta["standard_user_access_token_enc"] ||
      meta["business_user_access_token_enc"],
    );
  }

  async function safeGetGoogleTokenFor(
    source: StatsSourceKey,
    product: "ga4" | "gsc",
  ) {
    try {
      return await getGoogleTokenFor(source, product, { supabase, userId });
    } catch {
      return null;
    }
  }

  return {
    latestIntegrationAny,
    bestIntegrationAny,
    hasFacebookStoredToken,
    hasActiveStoredIntegration,
    safeGetGoogleTokenFor,
  };
}
