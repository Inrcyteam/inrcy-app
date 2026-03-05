"use client";

import { useEffect, useMemo, useState } from "react";

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
    // Allow other parts of the app to react (optional).
    window.dispatchEvent(new CustomEvent("inrcy:cookie-consent", { detail: next }));
  } catch {
    // no-op
  }
}

export default function CookieConsentBanner() {
  const initial = useMemo(() => readConsent(), []);
  const [consent, setConsent] = useState<Consent | null>(initial);
  const [open, setOpen] = useState(false);

  // Keep in sync if something else updates localStorage.
  useEffect(() => {
    const onStorage = () => setConsent(readConsent());
    window.addEventListener("storage", onStorage);
    const onCustom = () => setConsent(readConsent());
    window.addEventListener("inrcy:cookie-consent" as any, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("inrcy:cookie-consent" as any, onCustom);
    };
  }, []);

  // If not decided yet, show banner.
  const shouldShow = !consent;
  if (!shouldShow && !open) return null;

  const card: React.CSSProperties = {
    position: "fixed",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 999999,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(16,16,16,0.92)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "white",
    padding: 14,
    maxWidth: 980,
    margin: "0 auto",
    boxShadow: "0 16px 50px rgba(0,0,0,0.35)",
  };

  const btn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    whiteSpace: "nowrap",
  };

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background:
      "linear-gradient(135deg, rgba(0, 200, 255, 0.18), rgba(97, 87, 255, 0.18), rgba(255, 77, 166, 0.14))",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const link: React.CSSProperties = {
    color: "rgba(255,255,255,0.85)",
    textDecoration: "underline",
    fontWeight: 700,
  };

  const setAll = (analytics: boolean) => {
    const next: Consent = { v: 1, ts: Date.now(), analytics };
    writeConsent(next);
    setConsent(next);
    setOpen(false);
  };

  return (
    <div style={card} role="dialog" aria-live="polite" aria-label="Consentement cookies">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 240, flex: "1 1 420px" }}>
          <div style={{ fontWeight: 1000, marginBottom: 6 }}>Cookies</div>
          <div style={{ opacity: 0.85, lineHeight: 1.45, fontSize: 14 }}>
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
