"use client";

import React from "react";
import { getSimpleFrenchApiError, getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";

type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft" | "imap";
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
  return p === "gmail" ? "Gmail" : p === "imap" ? "IMAP" : "Microsoft";
}

export default function MailsSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [mailAccounts, setMailAccounts] = React.useState<MailAccount[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busyDisconnect, setBusyDisconnect] = React.useState<string | null>(null);
  const [signatureEnabled, setSignatureEnabled] = React.useState(true);
  const [signatureTemplate, setSignatureTemplate] = React.useState(`{{nom_complet}}
{{nom_entreprise}}
Tél : {{telephone}}
Email : {{email}}`);
  const [signaturePreview, setSignaturePreview] = React.useState("");
  const [signatureBusy, setSignatureBusy] = React.useState(false);

  // --- IMAP (slot 4 only) ---
  type ImapPresetKey = "ovh" | "ionos" | "orange" | "sfr" | "other";
  const IMAP_PRESETS: Record<ImapPresetKey, {
    label: string;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_starttls: boolean;
  }> = {
    ovh: { label: "OVH", imap_host: "ssl0.ovh.net", imap_port: 993, imap_secure: true, smtp_host: "smtp.mail.ovh.net", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    ionos: { label: "IONOS", imap_host: "imap.ionos.com", imap_port: 993, imap_secure: true, smtp_host: "smtp.ionos.com", smtp_port: 587, smtp_secure: false, smtp_starttls: true },
    orange: { label: "Orange", imap_host: "imap.orange.fr", imap_port: 993, imap_secure: true, smtp_host: "smtp.orange.fr", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    sfr: { label: "SFR", imap_host: "imap.sfr.fr", imap_port: 993, imap_secure: true, smtp_host: "smtp.sfr.fr", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    other: { label: "Autre (manuel)", imap_host: "", imap_port: 993, imap_secure: true, smtp_host: "", smtp_port: 587, smtp_secure: false, smtp_starttls: true },
  };

  const [imapModalOpen, setImapModalOpen] = React.useState(false);
  const [imapPresetKey, setImapPresetKey] = React.useState<ImapPresetKey>("ovh");
  const [imapLogin, setImapLogin] = React.useState("");
  const [imapPassword, setImapPassword] = React.useState("");
  const [imapCustom, setImapCustom] = React.useState({
    imap_host: "",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_secure: false,
    smtp_starttls: true,
  });
  const [imapTestBusy, setImapTestBusy] = React.useState(false);
  const [imapConnectBusy, setImapConnectBusy] = React.useState(false);
  const [imapFormError, setImapFormError] = React.useState<string | null>(null);
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
          throw new Error(await getSimpleFrenchApiError(res));
        }
        const data = await res.json();
        const sigRes = await fetch("/api/inrsend/signature", { cache: "no-store" }).catch(() => null);
        const sigData = sigRes ? await sigRes.json().catch(() => ({})) : {};
        if (!alive) return;

        setMailAccounts(data.mailAccounts || []);
        if (sigRes?.ok) {
          setSignatureEnabled(sigData?.enabled !== false);
          setSignatureTemplate(String(sigData?.template || `{{nom_complet}}
{{nom_entreprise}}
Tél : {{telephone}}
Email : {{email}}`));
          setSignaturePreview(String(sigData?.preview || ""));
        }
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les réglages mail."));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const slots = [0, 1, 2, 3];
  const oauthAccounts = mailAccounts.filter((a) => a.provider !== "imap");
  const imapAccount = mailAccounts.find((a) => a.provider === "imap") || null;
  const maxReached = oauthAccounts.length >= 3; // slots 1-3

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
          Réglages iNr’Send
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          Vous pouvez connecter jusqu’à <b>4 boîtes d’envoi</b> : <b>3</b> en OAuth (Gmail / Outlook) et <b>1</b> en IMAP.
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          {loading ? "Chargement…" : error ? `Erreur : ${error}` : `Boîtes connectées : ${oauthAccounts.length + (imapAccount ? 1 : 0)}/4`}
        </div>
{toast === "already_connected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#fbbf24" }}>
    ⚠️ Cette boîte mail est déjà connectée.
  </div>
)}

{toast === "connected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte mail connectée. Vous pouvez maintenant l’utiliser pour vos envois.
  </div>
)}

{toast === "gmail_disconnected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte Gmail déconnectée.
  </div>
)}

{toast === "outlook_disconnected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte Outlook déconnectée.
  </div>
)}

{toast === "imap_disconnected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte IMAP déconnectée.
  </div>
)}

{toast === "imap_test_ok" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Test de connexion réussi. Vous pouvez maintenant enregistrer cette boîte.
  </div>
)}

{toast === "imap_connected" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Boîte IMAP connectée. Vous pouvez maintenant l’utiliser pour vos envois.
  </div>
)}

{toast === "signature_saved" && (
  <div style={{ marginTop: 8, fontSize: 13, color: "#34d399" }}>
    ✅ Signature automatique enregistrée.
  </div>
)}

      </div>

      <GlassCard
        title="Signature automatique"
        subtitle="Cette signature est ajoutée automatiquement à la fin des mails iNr’Send. Vous pouvez utiliser les variables {{nom_complet}}, {{nom_entreprise}}, {{telephone}}, {{email}}, {{adresse}}, {{code_postal}}, {{ville}}, {{boite_mail}}."
      >
        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.82)" }}>
            <input
              type="checkbox"
              checked={signatureEnabled}
              onChange={(e) => setSignatureEnabled(e.target.checked)}
            />
            Activer la signature automatique
          </label>

          <textarea
            value={signatureTemplate}
            onChange={(e) => setSignatureTemplate(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.92)",
              resize: "vertical",
            }}
          />

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
            Aperçu actuel :
          </div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.86)",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            {signatureEnabled ? (signaturePreview || "Aperçu indisponible pour le moment.") : "Signature automatique désactivée."}
          </pre>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn
              label={signatureBusy ? "Enregistrement…" : "Sauvegarder la signature"}
              disabled={signatureBusy}
              onClick={async () => {
                try {
                  setSignatureBusy(true);
                  const res = await fetch("/api/inrsend/signature", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: signatureEnabled, template: signatureTemplate }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible d’enregistrer la signature."));
                  setSignatureEnabled(data?.enabled !== false);
                  setSignatureTemplate(String(data?.template || signatureTemplate));
                  setSignaturePreview(String(data?.preview || ""));
                  setToast("signature_saved");
                } catch (e: any) {
                  setToast(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer la signature."));
                } finally {
                  setSignatureBusy(false);
                }
              }}
            />
          </div>
        </div>
      </GlassCard>

      <div className="mailsSettings_cardsGrid">
        {slots.map((i) => {
          const isImapSlot = i === 3;
          const acc = isImapSlot ? imapAccount : oauthAccounts[i];

          return (
            <GlassCard
              key={i}
              title={`Boîte mail ${i + 1}`}
              subtitle={
                loading
                  ? "Chargement…"
                  : acc
                  ? `Boîte connectée : ${acc.email_address} (${ProviderLabel(acc.provider)})`
                  : isImapSlot
                    ? "Vide (IMAP)"
                    : "Vide"
              }
            >
              {!acc ? (
                <>
                  {!isImapSlot && (
                    <Btn
                      label="Connecter Gmail"
                      disabled={loading || maxReached}
                   onClick={() => {
  window.location.href = "/api/integrations/google/start";
}}
                    />
                  )}
                  {!isImapSlot && (
                    <Btn
                      label="Connecter Microsoft"
                      disabled={loading || maxReached}
                      onClick={() => {
                        window.location.href = "/api/integrations/microsoft/start";
                      }}
                    />
                  )}

                  {isImapSlot && (
                    <Btn
                      label="Connecter IMAP (OVH / IONOS / Orange / SFR…)"
                      disabled={loading}
                      onClick={() => {
                        setImapFormError(null);
                        setImapLogin("");
                        setImapPassword("");
                        setImapPresetKey("ovh");
                        setImapCustom({
                          imap_host: "",
                          imap_port: 993,
                          imap_secure: true,
                          smtp_host: "",
                          smtp_port: 587,
                          smtp_secure: false,
                          smtp_starttls: true,
                        });
                        setImapModalOpen(true);
                      }}
                    />
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>Statut : {acc.status === "connected" ? "Connectée" : acc.status === "expired" ? "À reconnecter" : acc.status}</div>
                  <Btn
  label={busyDisconnect === acc.id ? "Déconnexion…" : "Déconnecter"}
  disabled={loading || busyDisconnect === acc.id}
  onClick={async () => {
    try {
      setBusyDisconnect(acc.id);
      const endpoint = acc.provider === "gmail"
        ? "/api/integrations/google/disconnect"
        : acc.provider === "microsoft"
          ? "/api/integrations/microsoft/disconnect"
          : "/api/integrations/imap/disconnect";

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acc.id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(await getSimpleFrenchApiError(r, "Impossible de déconnecter cette boîte mail."));
      }
      setToast(acc.provider === "gmail" ? "gmail_disconnected" : acc.provider === "microsoft" ? "outlook_disconnected" : "imap_disconnected");
      // refresh status
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      setMailAccounts(data.mailAccounts || []);
    } catch (e: any) {
      setToast(getSimpleFrenchErrorMessage(e, "Impossible de déconnecter cette boîte mail."));
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

      </div>

      {imapModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={() => {
            if (imapTestBusy || imapConnectBusy) return;
            setImapModalOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(20,20,24,0.95)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.38)",
              padding: 16,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 950 }}>Connexion IMAP (boîte 4)</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                  Choisissez un fournisseur (prérempli), saisissez votre <b>identifiant</b> et votre <b>mot de passe</b>, puis lancez le test.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImapModalOpen(false)}
                disabled={imapTestBusy || imapConnectBusy}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "8px 10px",
                  color: "rgba(255,255,255,0.9)",
                  cursor: "pointer",
                }}
              >
                Fermer
              </button>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Fournisseur</label>
                <select
                  value={imapPresetKey}
                  onChange={(e) => setImapPresetKey(e.target.value as ImapPresetKey)}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    padding: "10px 12px",
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  {Object.entries(IMAP_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Identifiant (email complet)</label>
                <input
                  value={imapLogin}
                  onChange={(e) => setImapLogin(e.target.value)}
                  placeholder="contact@domaine.fr"
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    padding: "10px 12px",
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Mot de passe (ou mot de passe d’application)</label>
                <input
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    padding: "10px 12px",
                    color: "rgba(255,255,255,0.92)",
                  }}
                />
              </div>

              {imapPresetKey === "other" && (
                <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Réglages manuels</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: 8 }}>
                    <input
                      value={imapCustom.imap_host}
                      onChange={(e) => setImapCustom((p) => ({ ...p, imap_host: e.target.value }))}
                      placeholder="IMAP host (ex: imap.domaine.fr)"
                      style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", padding: "10px 12px", color: "rgba(255,255,255,0.92)" }}
                    />
                    <input
                      value={imapCustom.imap_port}
                      onChange={(e) => setImapCustom((p) => ({ ...p, imap_port: Number(e.target.value || 0) }))}
                      placeholder="993"
                      type="number"
                      style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", padding: "10px 12px", color: "rgba(255,255,255,0.92)" }}
                    />
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.85 }}>
                      <input
                        type="checkbox"
                        checked={imapCustom.imap_secure}
                        onChange={(e) => setImapCustom((p) => ({ ...p, imap_secure: e.target.checked }))}
                      />
                      SSL
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px", gap: 8 }}>
                    <input
                      value={imapCustom.smtp_host}
                      onChange={(e) => setImapCustom((p) => ({ ...p, smtp_host: e.target.value }))}
                      placeholder="SMTP host (ex: smtp.domaine.fr)"
                      style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", padding: "10px 12px", color: "rgba(255,255,255,0.92)" }}
                    />
                    <input
                      value={imapCustom.smtp_port}
                      onChange={(e) => setImapCustom((p) => ({ ...p, smtp_port: Number(e.target.value || 0) }))}
                      placeholder="587"
                      type="number"
                      style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", padding: "10px 12px", color: "rgba(255,255,255,0.92)" }}
                    />
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.85 }}>
                      <input
                        type="checkbox"
                        checked={imapCustom.smtp_starttls}
                        onChange={(e) => setImapCustom((p) => ({ ...p, smtp_starttls: e.target.checked }))}
                      />
                      STARTTLS
                    </label>
                  </div>
                </div>
              )}

              {imapFormError && (
                <div style={{ fontSize: 13, color: "#fbbf24" }}>⚠️ {imapFormError}</div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                <button
                  type="button"
                  disabled={imapTestBusy || imapConnectBusy}
                  onClick={async () => {
                    try {
                      setImapFormError(null);
                      if (!imapLogin.trim() || !imapPassword) {
                        setImapFormError("Saisis identifiant et mot de passe.");
                        return;
                      }
                      setImapTestBusy(true);
                      const preset = imapPresetKey === "other" ? imapCustom : IMAP_PRESETS[imapPresetKey];
                      const r = await fetch("/api/integrations/imap/test", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          login: imapLogin.trim(),
                          password: imapPassword,
                          ...preset,
                        }),
                      });
                      const j = await r.json().catch(() => ({}));
                      if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Test impossible"));
                      setImapFormError(null);
                      setToast("imap_test_ok");
                    } catch (e: any) {
                      setImapFormError(getSimpleFrenchErrorMessage(e, "Test impossible pour le moment."));
                    } finally {
                      setImapTestBusy(false);
                    }
                  }}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.92)",
                    padding: "10px 12px",
                    cursor: "pointer",
                    opacity: imapTestBusy || imapConnectBusy ? 0.6 : 1,
                  }}
                >
                  {imapTestBusy ? "Test…" : "Tester"}
                </button>

                <button
                  type="button"
                  disabled={imapTestBusy || imapConnectBusy}
                  onClick={async () => {
                    try {
                      setImapFormError(null);
                      if (!imapLogin.trim() || !imapPassword) {
                        setImapFormError("Saisis identifiant et mot de passe.");
                        return;
                      }
                      setImapConnectBusy(true);
                      const preset = imapPresetKey === "other" ? imapCustom : IMAP_PRESETS[imapPresetKey];
                      const r = await fetch("/api/integrations/imap/connect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          login: imapLogin.trim(),
                          password: imapPassword,
                          ...preset,
                        }),
                      });
                      const j = await r.json().catch(() => ({}));
                      if (!r.ok) throw new Error(await getSimpleFrenchApiError(r, "Connexion impossible"));
                      setImapModalOpen(false);
                      // refresh
                      const res = await fetch("/api/integrations/status");
                      const data = await res.json();
                      setMailAccounts(data.mailAccounts || []);
                      setToast("imap_connected");
                    } catch (e: any) {
                      setImapFormError(getSimpleFrenchErrorMessage(e, "Connexion impossible pour le moment."));
                    } finally {
                      setImapConnectBusy(false);
                    }
                  }}
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(56,189,248,0.18)",
                    color: "rgba(255,255,255,0.95)",
                    padding: "10px 12px",
                    cursor: "pointer",
                    opacity: imapTestBusy || imapConnectBusy ? 0.6 : 1,
                  }}
                >
                  {imapConnectBusy ? "Connexion…" : "Connecter"}
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Astuce : si votre boîte a la double authentification, utilisez un <b>mot de passe d’application</b>.
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
