"use client";

import React from "react";

type CalendarAccount = {
  id: string;
  provider: "google";
  email_address: string;
  display_name: string | null;
  status: "connected" | "expired" | "error";
  created_at: string;
} | null;

function GlassCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
        padding: 14,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.92)" }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.68)",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {subtitle}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabled}
      style={{
        opacity: disabled ? 0.45 : 1,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        padding: "10px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform .15s ease, background .15s ease, border-color .15s ease",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "rgba(255,255,255,0.09)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)";
        e.currentTarget.style.transform = "translateY(0px)";
      }}
    >
      {label}
    </button>
  );
}

export default function AgendaSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [account, setAccount] = React.useState<CalendarAccount>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busyDisconnect, setBusyDisconnect] = React.useState(false);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("toast");
    if (t) {
      setToast(t);
      url.searchParams.delete("toast");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/calendar/account");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Erreur (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      setAccount(data.account || null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = () => {
    window.location.href = "/api/integrations/google-calendar/start";
  };

  const disconnect = async () => {
    if (!account?.id) return;
    try {
      setBusyDisconnect(true);
      const r = await fetch("/api/integrations/google-calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Erreur déconnexion");
      }
      setToast("calendar_disconnected");
      await refresh();
    } catch (e: any) {
      setToast(e?.message || "Erreur déconnexion");
    } finally {
      setBusyDisconnect(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style jsx>{`
        @media (max-width: 640px) {
          .agendaSettings_btnRow {
            flex-direction: column;
            align-items: stretch;
          }
          .agendaSettings_btnRow > button {
            width: 100%;
          }
        }
      `}</style>

      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(90deg, rgba(251,146,60,0.14), rgba(244,114,182,0.12), rgba(56,189,248,0.10))",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.95)" }}>
          Réglages Agenda
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          Connecte ton <b>Google Agenda</b> pour que iNrCy affiche et pilote tes RDV.
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          {loading
            ? "Chargement…"
            : error
            ? `Erreur: ${error}`
            : account
            ? `Connecté : ${account.email_address}`
            : "Aucun Google Agenda connecté"}
        </div>

        {toast === "connected" && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>✅ Google Agenda connecté avec succès.</div>
        )}
        {toast === "denied" && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#fbbf24" }}>⚠️ Connexion annulée côté Google.</div>
        )}
        {toast === "calendar_disconnected" && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#fbbf24" }}>✅ Agenda déconnecté.</div>
        )}
      </div>

      <GlassCard
        title="Google Agenda"
        subtitle={
          loading
            ? "Chargement…"
            : account
            ? `Synchronisé avec : ${account.email_address}`
            : "Non connecté"
        }
      >
        {!account ? (
          <div className="agendaSettings_btnRow" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn label="Connecter Google Agenda (OAuth)" onClick={connect} disabled={loading} />
            <Btn label="Rafraîchir" onClick={refresh} disabled={loading} />
          </div>
        ) : (
          <div className="agendaSettings_btnRow" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn label="Rafraîchir" onClick={refresh} disabled={loading} />
            <Btn label={busyDisconnect ? "Déconnexion…" : "Déconnecter"} onClick={disconnect} disabled={loading || busyDisconnect} />
          </div>
        )}
      </GlassCard>
    </div>
  );
}
