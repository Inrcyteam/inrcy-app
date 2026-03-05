"use client";

import { useMemo, useState } from "react";

const LS_KEY = "inrcy_cookie_consent";

function getCookiePrefs() {
  if (typeof window === "undefined") return null as any;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCookiePrefs(analytics: boolean) {
  if (typeof window === "undefined") return;
  try {
    const next = { v: 1, ts: Date.now(), analytics };
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("inrcy:cookie-consent", { detail: next }));
  } catch {
    // no-op
  }
}

type Props = {
  mode?: "page" | "drawer";
};

export default function RgpdContent({ mode = "page" }: Props) {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const initialPrefs = useMemo(() => getCookiePrefs(), []);
  const [analytics, setAnalytics] = useState<boolean>(Boolean(initialPrefs?.analytics));

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const btn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  };

  const dangerBtn: React.CSSProperties = {
    ...btn,
    border: "1px solid rgba(255,120,120,0.35)",
    background: "rgba(255, 77, 166, 0.10)",
  };

  async function downloadExport() {
    setErr(null);
    setDone(null);
    setBusy("export");
    try {
      const res = await fetch("/api/account/export", { method: "GET" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Export impossible (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inrcy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setDone("Export généré et téléchargé.");
    } catch (e: any) {
      setErr(e?.message || "Erreur export");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setErr(null);
    setDone(null);
    const ok = window.confirm(
      "⚠️ Cette action supprime votre compte iNrCy et vos données associées.\n\nSouhaitez-vous vraiment continuer ?"
    );
    if (!ok) return;

    setBusy("delete");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error || `Suppression impossible (${res.status})`;
        throw new Error(msg);
      }
      setDone("Compte supprimé. Vous allez être déconnecté.");
      // Redirect to home/login.
      window.location.href = "/";
    } catch (e: any) {
      setErr(e?.message || "Erreur suppression");
    } finally {
      setBusy(null);
    }
  }

  function onToggleAnalytics(next: boolean) {
    setAnalytics(next);
    setCookiePrefs(next);
    setDone("Préférences cookies enregistrées.");
  }

  const info: React.CSSProperties = {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.25)",
    fontSize: 13,
    lineHeight: 1.45,
    opacity: 0.9,
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Mes données (RGPD)</h3>
        <p style={{ margin: "10px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
          Télécharger vos données, gérer vos cookies, ou supprimer votre compte.
        </p>

        {(err || done) && (
          <div style={info}>
            {err ? <div style={{ color: "#ff9aa2", fontWeight: 900 }}>{err}</div> : null}
            {done ? <div style={{ color: "#b5ffcf", fontWeight: 900 }}>{done}</div> : null}
          </div>
        )}
      </div>

      <div style={card}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>Export (portabilité)</h4>
        <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5, fontSize: 13 }}>
          Génère un fichier JSON téléchargeable contenant vos données principales.
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" style={btn} onClick={downloadExport} disabled={busy !== null}>
            {busy === "export" ? "Export en cours…" : "Télécharger mes données"}
          </button>
        </div>
      </div>

      <div style={card}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>Cookies</h4>
        <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5, fontSize: 13 }}>
          Les cookies nécessaires sont toujours actifs. La mesure d’audience est optionnelle.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, opacity: 0.9 }}>
          <input type="checkbox" checked={analytics} onChange={(e) => onToggleAnalytics(Boolean(e.target.checked))} />
          <span>Autoriser la mesure d’audience (optionnel)</span>
        </label>
      </div>

      <div style={card}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>Suppression du compte</h4>
        <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5, fontSize: 13 }}>
          Supprime votre compte et les données associées. Action irréversible.
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" style={dangerBtn} onClick={deleteAccount} disabled={busy !== null}>
            {busy === "delete" ? "Suppression en cours…" : "Supprimer mon compte"}
          </button>
        </div>
        <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, lineHeight: 1.4 }}>
          Conseil : téléchargez d’abord vos données (bouton ci-dessus).
        </div>
      </div>

      {mode === "drawer" ? null : null}
    </div>
  );
}
