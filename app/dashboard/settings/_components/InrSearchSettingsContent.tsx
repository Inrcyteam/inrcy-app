"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../../dashboard.module.css";
import StatusMessage from "../../_components/StatusMessage";

const INR_SEARCH_PUBLIC_ORIGIN = ((process.env.NEXT_PUBLIC_INRSEARCH_PUBLIC_ORIGIN || "https://app.inrcy.com").replace(/\/$/, "") === "https://inrcy.com" ? "https://app.inrcy.com" : (process.env.NEXT_PUBLIC_INRSEARCH_PUBLIC_ORIGIN || "https://app.inrcy.com").replace(/\/$/, ""));

function getRuntimeInrSearchOrigin() {
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return window.location.origin;
  }
  return INR_SEARCH_PUBLIC_ORIGIN;
}

type InrSearchPublicationState = {
  allowed: boolean;
  reason:
    | "published"
    | "slug_missing"
    | "config_missing"
    | "page_disabled"
    | "bubble_disabled"
    | "subscription_inactive"
    | "profile_missing"
    | "data_unavailable";
  subscriptionStatus?: string;
};

type InrSearchSettings = {
  enabled: boolean;
  slug: string;
  publishedSlug: string;
  slugLocked: boolean;
  publishedAt: string | null;
  pageTitle: string;
  pageDescription: string;
  updatedAt: string | null;
  systemManaged?: boolean;
};

const EMPTY_SETTINGS: InrSearchSettings = {
  enabled: false,
  slug: "",
  publishedSlug: "",
  slugLocked: false,
  publishedAt: null,
  pageTitle: "",
  pageDescription: "",
  updatedAt: null,
  systemManaged: true,
};

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 10,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeSettings(value: unknown): InrSearchSettings {
  const source = asRecord(value);
  return {
    enabled: Boolean(source.enabled),
    slug: String(source.slug || ""),
    publishedSlug: String(source.publishedSlug || ""),
    slugLocked: Boolean(source.slugLocked || source.publishedSlug || (source.enabled && source.slug)),
    publishedAt: typeof source.publishedAt === "string" ? source.publishedAt : null,
    pageTitle: String(source.pageTitle || ""),
    pageDescription: String(source.pageDescription || ""),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
    systemManaged: source.systemManaged !== false,
  };
}

function emitDashboardUpdate(settings: InrSearchSettings, publicationAllowed: boolean) {
  if (typeof window === "undefined") return;
  const pageUrl = settings.slug ? `${getRuntimeInrSearchOrigin()}/entreprises/${settings.slug}` : "";
  window.dispatchEvent(new CustomEvent("inrcy:inr-search-settings-updated", {
    detail: {
      connected: Boolean(settings.enabled && settings.slug && publicationAllowed),
      profileUrl: pageUrl,
    },
  }));
}

export default function InrSearchSettingsContent() {
  const [settings, setSettings] = useState<InrSearchSettings>(EMPTY_SETTINGS);
  const [publication, setPublication] = useState<InrSearchPublicationState>({ allowed: false, reason: "bubble_disabled" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = useMemo(
    () => settings.slug ? `${INR_SEARCH_PUBLIC_ORIGIN}/entreprises/${settings.slug}` : "",
    [settings.slug],
  );
  const previewUrl = useMemo(
    () => settings.slug ? `/entreprises/${settings.slug}` : "",
    [settings.slug],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inr-search/settings", { cache: "no-store", credentials: "include" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Chargement impossible.");

      const next = normalizeSettings(payload.inrSearch);
      const publicationValue = asRecord(payload.publication);
      const nextPublication: InrSearchPublicationState = {
        allowed: Boolean(publicationValue.allowed),
        reason: [
          "published",
          "slug_missing",
          "config_missing",
          "page_disabled",
          "bubble_disabled",
          "subscription_inactive",
          "profile_missing",
          "data_unavailable",
        ].includes(String(publicationValue.reason))
          ? publicationValue.reason as InrSearchPublicationState["reason"]
          : "data_unavailable",
        subscriptionStatus: typeof publicationValue.subscriptionStatus === "string" ? publicationValue.subscriptionStatus : undefined,
      };

      setSettings(next);
      setPublication(nextPublication);
      emitDashboardUpdate(next, nextPublication.allowed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement de la page iNr'Search impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const isPublished = Boolean(settings.enabled && settings.slug && publication.allowed);
  const publicationMessage = publication.reason === "subscription_inactive"
    ? "La page est temporairement retirée du web tant que l’abonnement iNrCy n’est pas actif."
    : publication.reason === "bubble_disabled"
      ? "La page est désactivée à distance par iNrCy."
      : publication.reason === "profile_missing"
        ? "La page attend la synchronisation du profil principal."
        : publication.reason === "slug_missing" || publication.reason === "config_missing"
          ? "La page est en cours de création automatique."
          : publication.reason === "data_unavailable"
            ? "La page est en cours de synchronisation. Actualisez dans quelques secondes."
            : isPublished
              ? "La page est publiée, mise à jour automatiquement et signalée aux moteurs lors des nouvelles publications."
              : "La page est en cours de synchronisation automatique.";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <div style={{ ...cardStyle, gridTemplateColumns: "1fr auto", alignItems: "center" }}>
        <div style={{ display: "grid", gap: 5 }}>
          <div className={styles.blockTitle}>Page publique iNr&apos;Search</div>
          <div className={styles.smallMuted}>
            iNrCy transforme les informations du professionnel en une présence publique claire, vivante et exploitable par les moteurs de recherche.
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            minHeight: 30,
            padding: "0 11px",
            borderRadius: 999,
            border: `1px solid ${isPublished ? "rgba(34,197,94,.38)" : "rgba(148,163,184,.28)"}`,
            background: isPublished ? "rgba(34,197,94,.10)" : "rgba(148,163,184,.08)",
            color: isPublished ? "#86efac" : "rgba(226,232,240,.76)",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: isPublished ? "#22c55e" : "#94a3b8" }} />
          {loading ? "Synchronisation…" : isPublished ? "Page publiée" : "Page indisponible"}
        </span>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockTitle}>Une page qui travaille en continu</div>
        <div className={styles.smallMuted}>
          La page est alimentée automatiquement par les informations déjà présentes dans iNrCy. Le professionnel n’a pas à choisir ses rubriques ni à recopier ses données : son activité, ses preuves et ses réponses restent cohérentes partout.
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {[
            ["Référencement", "Titre, description et données structurées"],
            ["Moteurs IA", "Synthèse factuelle et source dédiée"],
            ["Mon activité", "Métier, prestations et zones confirmées"],
            ["Preuves", "Photos, réalisations et actualités"],
            ["iNr’Guide", "Réponses vérifiées pour guider les visiteurs"],
            ["Conversion", "Contact, téléphone, site et réseaux"],
          ].map(([title, text]) => (
            <div key={title} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 11, background: "rgba(15,23,42,0.42)", display: "grid", gap: 3 }}>
              <strong>{title}</strong>
              <span className={styles.smallMuted}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div className={styles.blockTitle}>État de publication</div>
        <div className={styles.smallMuted}>{loading ? "Création et synchronisation en cours…" : publicationMessage}</div>
      </div>

      {publicUrl ? (
        <div style={cardStyle}>
          <div className={styles.blockTitle}>Adresse publique permanente</div>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15,23,42,0.62)", borderRadius: 12, padding: "10px 12px", overflowWrap: "anywhere" }}>
            {publicUrl}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            <button className={styles.ghostBtn} type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "Synchronisation…" : "Actualiser"}
            </button>
            {isPublished ? (
              <a className={styles.primaryBtn} href={previewUrl} target="_blank" rel="noreferrer">
                Voir ma page
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
