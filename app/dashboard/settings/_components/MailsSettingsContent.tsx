"use client";

import React from "react";

type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft";
  email_address: string;
  display_name: string | null;
  status: "connected" | "expired" | "error";
  created_at: string;
};

type MessengerAccount = {
  id: string;
  page_id: string;
  page_name: string | null;
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
      className="mailsSettings_glassCard"
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

      <div className="mailsSettings_glassChildren" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        {children}
      </div>
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

function ProviderLabel(p: MailAccount["provider"]) {
  return p === "gmail" ? "Gmail" : "Microsoft";
}

export default function MailsSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [mailAccounts, setMailAccounts] = React.useState<MailAccount[]>([]);
  const [messengerAccount, setMessengerAccount] = React.useState<MessengerAccount>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busyDisconnect, setBusyDisconnect] = React.useState<string | null>(null);

React.useEffect(() => {
  const url = new URL(window.location.href);
  const t = url.searchParams.get("toast");

  if (t) {
    setToast(t);
    url.searchParams.delete("toast");
    window.history.replaceState({}, "", url.toString());
  }
}, []);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/integrations/status");
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `Erreur (${res.status})`);
        }
        const data = await res.json();
        if (!alive) return;

        setMailAccounts(data.mailAccounts || []);
        setMessengerAccount(data.messengerAccount || null);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Erreur inconnue");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const slots = [0, 1, 2];
  const maxReached = mailAccounts.length >= 3;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Responsive tweaks (mobile only) */}
      <style jsx>{`
        .mailsSettings_cardsGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        @media (max-width: 640px) {
          .mailsSettings_cardsGrid {
            grid-template-columns: 1fr;
          }

          /* Buttons stack vertically + take full width on mobile */
          .mailsSettings_glassChildren {
            flex-direction: column;
            align-items: stretch;
            flex-wrap: nowrap;
          }
          .mailsSettings_glassChildren > button {
            width: 100%;
          }
        }
      `}</style>

      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(90deg, rgba(56,189,248,0.14), rgba(167,139,250,0.12), rgba(244,114,182,0.10), rgba(251,146,60,0.08))",
          padding: 14,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.95)" }}>
          Réglages iNr’Box
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          Connecte jusqu’à <b>3 boîtes mail</b> (Gmail / Outlook) + <b>Messenger</b>.
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          {loading ? "Chargement…" : error ? `Erreur: ${error}` : `Boîtes connectées : ${mailAccounts.length}/3`}
        </div>
{toast === "already_connected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#fbbf24" }}>
    ⚠️ Cette boîte mail est déjà connectée.
  </div>
)}

{toast === "connected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte mail connectée avec succès.
  </div>
)}
      </div>

      <div className="mailsSettings_cardsGrid">
        {slots.map((i) => {
          const acc = mailAccounts[i];

          return (
            <GlassCard
              key={i}
              title={`Boîte mail ${i + 1}`}
              subtitle={
                loading
                  ? "Chargement…"
                  : acc
                  ? `Connectée : ${acc.email_address} (${ProviderLabel(acc.provider)})`
                  : "Vide"
              }
            >
              {!acc ? (
                <>
                  <Btn
                    label="Connecter Gmail"
                    disabled={loading || maxReached}
                   onClick={() => {
  window.location.href = "/api/integrations/google/start";
}}
                  />
                  <Btn
                    label="Connecter Microsoft"
                    disabled={loading || maxReached}
                    onClick={() => {
                      window.location.href = "/api/integrations/microsoft/start";
                    }}
                  />
                </>
              ) : (
                <>
                  <Btn label="Voir statut" onClick={() => alert(`Statut: ${acc.status}`)} disabled={loading} />
                  <Btn
  label={busyDisconnect === acc.id ? "Déconnexion…" : "Déconnecter"}
  disabled={loading || busyDisconnect === acc.id}
  onClick={async () => {
    try {
      setBusyDisconnect(acc.id);
      const endpoint = acc.provider === "gmail"
        ? "/api/integrations/google/disconnect"
        : "/api/integrations/microsoft/disconnect";

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acc.id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Erreur déconnexion");
      }
      setToast(acc.provider === "gmail" ? "gmail_disconnected" : "outlook_disconnected");
      // refresh status
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setMailAccounts(data.mailAccounts || []);
    } catch (e: any) {
      setToast(e?.message || "Erreur déconnexion Gmail");
    } finally {
      setBusyDisconnect(null);
    }
  }}
/>
                </>
              )}
            </GlassCard>
          );
        })}

        <GlassCard
          title="Messenger (Facebook)"
          subtitle={
            loading
              ? "Chargement…"
              : messengerAccount
              ? `Connecté : ${messengerAccount.page_name || messengerAccount.page_id}`
              : "Non connecté"
          }
        >
          {!messengerAccount ? (
            <Btn label="Connecter Messenger" disabled={loading} onClick={() => alert("Prochaine étape : OAuth Meta")} />
          ) : (
            <>
              <Btn
                label="Voir statut"
                disabled={loading}
                onClick={() => alert(`Statut: ${messengerAccount.status}`)}
              />
              <Btn label="Déconnecter" disabled={loading} onClick={() => alert("Prochaine étape : Déconnecter")} />
            </>
          )}
        </GlassCard>
      </div>
      </div>
  );
}
