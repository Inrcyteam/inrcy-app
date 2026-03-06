"use client";

import { useSyncExternalStore, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

type Consent = {
  v: 1;
  ts: number;
  analytics: boolean;
};

const LS_KEY = "inrcy_cookie_consent";

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== 1) return null;
    if (typeof parsed.ts !== "number") return null;
    if (typeof parsed.analytics !== "boolean") return null;
    return parsed as Consent;
  } catch {
    return null;
  }
}

function writeConsent(next: Consent) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("inrcy:cookie-consent", { detail: next }));
  } catch {
    // no-op
  }
}

function subscribeToConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("inrcy:cookie-consent", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("inrcy:cookie-consent", onStoreChange);
  };
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const shouldHideOnThisPage = pathname?.startsWith("/login") || pathname?.startsWith("/legal");
  const [open, setOpen] = useState(false);
  const consent = useSyncExternalStore(subscribeToConsent, readConsent, () => null);

  if (shouldHideOnThisPage) return null;

  const shouldShow = !consent;
  if (!shouldShow && !open) return null;

  const card: CSSProperties = {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 999999,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(16,16,16,0.88)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "white",
    padding: 12,
    maxWidth: 720,
    margin: "0 auto",
    boxShadow: "0 14px 40px rgba(0,0,0,0.32)",
  };

  const btn: CSSProperties = {
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    whiteSpace: "nowrap",
  };

  const primaryBtn: CSSProperties = {
    ...btn,
    background:
      "linear-gradient(135deg, rgba(0, 200, 255, 0.18), rgba(97, 87, 255, 0.18), rgba(255, 77, 166, 0.14))",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const link: CSSProperties = {
    color: "rgba(255,255,255,0.85)",
    textDecoration: "underline",
    fontWeight: 700,
  };

  const setAll = (analytics: boolean) => {
    const next: Consent = { v: 1, ts: Date.now(), analytics };
    writeConsent(next);
    setOpen(false);
  };

  return (
    <div style={card} role="dialog" aria-live="polite" aria-label="Consentement cookies">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: "1 1 360px" }}>
          <div style={{ fontWeight: 1000, marginBottom: 6 }}>Cookies</div>
          <div style={{ opacity: 0.86, lineHeight: 1.42, fontSize: 13 }}>
            iNrCy utilise des cookies <b>strictement nécessaires</b> au fonctionnement (connexion, sécurité). Les cookies de
            mesure d’audience / services tiers ne sont activés qu’avec votre accord.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/legal/confidentialite" style={link}>
              Politique de confidentialité
            </a>
            <button type="button" onClick={() => setOpen((v) => !v)} style={{ ...btn, padding: "8px 10px" }}>
              {open ? "Fermer les réglages" : "Gérer mes cookies"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => setAll(false)} style={btn}>
            Refuser
          </button>
          <button type="button" onClick={() => setAll(true)} style={primaryBtn}>
            Accepter
          </button>
        </div>
      </div>

      {open ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.10)",
            display: "grid",
            gap: 10,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.9 }}>
            <input type="checkbox" checked readOnly />
            <span>
              <b>Nécessaires</b> (toujours actifs)
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.9 }}>
            <input
              type="checkbox"
              checked={Boolean(consent?.analytics)}
              onChange={(e) => setAll(Boolean(e.target.checked))}
            />
            <span>
              <b>Mesure d’audience</b> (optionnel)
            </span>
          </label>
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
            Note : iNrCy ne force pas l’installation d’outils tiers. Les connexions à Google Analytics / GSC se font via OAuth
            à l’initiative du professionnel.
          </div>
        </div>
      ) : null}
    </div>
  );
}
