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

const MAIL_ACCOUNTS_UPDATED_EVENT = "inrsend:mail-accounts-updated";

function dispatchMailAccountsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MAIL_ACCOUNTS_UPDATED_EVENT));
}

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire l’image."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l’image."));
    img.src = dataUrl;
  });
}

async function prepareSignatureImage(file: File): Promise<string> {
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    throw new Error("Format d’image non pris en charge. Utilisez PNG, JPG, WEBP, GIF ou SVG.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image trop lourde. Choisissez un fichier inférieur à 5 Mo.");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return sourceDataUrl;
  }

  const img = await loadImageFromDataUrl(sourceDataUrl);
  const maxWidth = 600;
  const targetWidth = Math.min(img.width || maxWidth, maxWidth);
  const scale = targetWidth / Math.max(img.width || targetWidth, 1);
  const targetHeight = Math.max(1, Math.round((img.height || targetWidth) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de préparer l’image.");
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const preferredType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = preferredType === "image/jpeg" ? 0.9 : undefined;
  const output = canvas.toDataURL(preferredType, quality);

  if (output.length > 950000) {
    throw new Error("Image encore trop lourde après optimisation. Choisissez une image plus légère.");
  }

  return output;
}

async function dataUrlToFile(dataUrl: string, fallbackName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : blob.type === "image/svg+xml" ? "svg" : "jpg";
  return new File([blob], `${fallbackName}.${ext}`, { type: blob.type || "image/jpeg" });
}

const SIGNATURE_WIDTH_OPTIONS = [
  { value: 300, label: "Petit (300 px)" },
  { value: 400, label: "Normal (400 px)" },
  { value: 500, label: "Grand (500 px)" },
  { value: 600, label: "Très grand (600 px)" },
];

export default function MailsSettingsContent() {
  const [loading, setLoading] = React.useState(true);
  const [mailAccounts, setMailAccounts] = React.useState<MailAccount[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [busyDisconnect, setBusyDisconnect] = React.useState<string | null>(null);
  const refreshMailAccounts = React.useCallback(async (notify = false) => {
    const res = await fetch("/api/integrations/status", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de charger les boîtes mail."));
    setMailAccounts(data.mailAccounts || []);
    if (notify) dispatchMailAccountsUpdated();
    return data.mailAccounts || [];
  }, []);

  const [signatureEnabled, setSignatureEnabled] = React.useState(true);
  const [signatureTemplate, setSignatureTemplate] = React.useState(`{{nom_complet}}
{{nom_entreprise}}
Tél : {{telephone}}
Email : {{email}}`);
  const [signaturePreview, setSignaturePreview] = React.useState("");
  const [signatureImageUrl, setSignatureImageUrl] = React.useState("");
  const [signatureImagePath, setSignatureImagePath] = React.useState("");
  const [signatureBusy, setSignatureBusy] = React.useState(false);
  const [signatureImageWidth, setSignatureImageWidth] = React.useState(400);
  const [signatureToast, setSignatureToast] = React.useState<string | null>(null);
  const signatureFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // --- IMAP (slot 4 only) ---
  type ImapPresetKey = "ovh" | "ionos" | "orange" | "sfr" | "other";
  type ImapSettings = {
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_starttls: boolean;
  };
  type ImapSecurityMode = "ssl" | "none";
  type SmtpSecurityMode = "ssl" | "starttls" | "none";
  const IMAP_PRESETS: Record<ImapPresetKey, {
    label: string;
  } & ImapSettings> = {
    ovh: { label: "OVH", imap_host: "ssl0.ovh.net", imap_port: 993, imap_secure: true, smtp_host: "smtp.mail.ovh.net", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    ionos: { label: "IONOS", imap_host: "imap.ionos.com", imap_port: 993, imap_secure: true, smtp_host: "smtp.ionos.com", smtp_port: 587, smtp_secure: false, smtp_starttls: true },
    orange: { label: "Orange", imap_host: "imap.orange.fr", imap_port: 993, imap_secure: true, smtp_host: "smtp.orange.fr", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    sfr: { label: "SFR", imap_host: "imap.sfr.fr", imap_port: 993, imap_secure: true, smtp_host: "smtp.sfr.fr", smtp_port: 465, smtp_secure: true, smtp_starttls: false },
    other: { label: "Autre fournisseur", imap_host: "", imap_port: 993, imap_secure: true, smtp_host: "", smtp_port: 587, smtp_secure: false, smtp_starttls: true },
  };

  const [imapModalOpen, setImapModalOpen] = React.useState(false);
  const [imapPresetKey, setImapPresetKey] = React.useState<ImapPresetKey>("ovh");
  const [imapLogin, setImapLogin] = React.useState("");
  const [imapPassword, setImapPassword] = React.useState("");
  const [imapCustom, setImapCustom] = React.useState<ImapSettings>({
    imap_host: "",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "",
    smtp_port: 587,
    smtp_secure: false,
    smtp_starttls: true,
  });
  const [imapShowPassword, setImapShowPassword] = React.useState(false);
  const [imapTestBusy, setImapTestBusy] = React.useState(false);
  const [imapConnectBusy, setImapConnectBusy] = React.useState(false);
  const [imapFormError, setImapFormError] = React.useState<string | null>(null);
  const [imapAssistMessage, setImapAssistMessage] = React.useState<string | null>(null);

  const smtpSecurityModeFromSettings = React.useCallback((settings: ImapSettings): SmtpSecurityMode => {
    if (settings.smtp_secure) return "ssl";
    if (settings.smtp_starttls) return "starttls";
    return "none";
  }, []);

  const applySmtpSecurityMode = React.useCallback((settings: ImapSettings, mode: SmtpSecurityMode): ImapSettings => ({
    ...settings,
    smtp_secure: mode === "ssl",
    smtp_starttls: mode === "starttls",
  }), []);

  const suggestSmtpSecurityForPort = React.useCallback((port: number): { mode: SmtpSecurityMode; message: string | null } | null => {
    if (port === 465) {
      return { mode: "ssl", message: "Configuration recommandée appliquée : port 465 → SSL/TLS." };
    }
    if (port === 587) {
      return { mode: "starttls", message: "Configuration recommandée appliquée : port 587 → STARTTLS." };
    }
    return null;
  }, []);

  const applyImapPreset = React.useCallback((key: ImapPresetKey) => {
    const preset = IMAP_PRESETS[key];
    setImapCustom({
      imap_host: preset.imap_host,
      imap_port: preset.imap_port,
      imap_secure: preset.imap_secure,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port,
      smtp_secure: preset.smtp_secure,
      smtp_starttls: preset.smtp_starttls,
    });
    setImapAssistMessage(
      key === "other"
        ? "Autre fournisseur sélectionné : renseignez vos paramètres librement."
        : `Réglages recommandés chargés pour ${IMAP_PRESETS[key].label}. Vous pouvez les modifier.`
    );
  }, []);

  const imapFieldStyle: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    padding: "10px 12px",
    color: "rgba(255,255,255,0.92)",
  };

  const imapSelectStyle: React.CSSProperties = {
    ...imapFieldStyle,
    background: "#ffffff",
    color: "#111827",
  };

  const [isMobileImapLayout, setIsMobileImapLayout] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobileImapLayout(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

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
        const data = { mailAccounts: await refreshMailAccounts(false) };
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
          setSignatureImagePath(String(sigData?.imagePath || ""));
          setSignatureImageUrl(String(sigData?.imageUrl || ""));
          setSignatureImageWidth(Number(sigData?.imageWidth || 400) || 400);
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
          {loading ? "Chargement…" : error ? error : `Boîtes connectées : ${oauthAccounts.length + (imapAccount ? 1 : 0)}/4`}
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


      </div>

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
                        applyImapPreset("ovh");
                        setImapShowPassword(false);
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
      await refreshMailAccounts(true);
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


      <GlassCard
        title="Signature automatique"
        subtitle="Cette signature est ajoutée automatiquement à la fin des mails iNr’Send. Vous pouvez utiliser les variables {{nom_complet}}, {{nom_entreprise}}, {{telephone}}, {{email}}, {{adresse}}, {{code_postal}}, {{ville}}, {{boite_mail}} et importer une image qui sera ajoutée automatiquement en bas des mails."
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

          {signatureToast ? (
            <div style={{ fontSize: 13, color: signatureToast.startsWith("✅") ? "#34d399" : "#fbbf24" }}>
              {signatureToast}
            </div>
          ) : null}

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

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
              Image de signature (optionnel)
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "10px 12px",
                  color: "rgba(255,255,255,0.92)",
                  cursor: signatureBusy ? "not-allowed" : "pointer",
                  opacity: signatureBusy ? 0.6 : 1,
                }}
              >
                Importer une image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  disabled={signatureBusy}
                  style={{ display: "none" }}
                  ref={signatureFileInputRef}
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      setSignatureBusy(true);
                      setSignatureToast(null);
                      const prepared = await prepareSignatureImage(file);
                      const preparedFile = await dataUrlToFile(prepared, file.name.replace(/\.[^.]+$/, "") || "signature");
                      const formData = new FormData();
                      formData.append("file", preparedFile);
                      const res = await fetch("/api/inrsend/signature-image", { method: "POST", body: formData });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible d’importer cette image."));
                      setSignatureImagePath(String(data?.imagePath || ""));
                      setSignatureImageUrl(String(data?.imageUrl || ""));
                      setSignatureToast("✅ Image insérée. Pensez à sauvegarder la signature.");
                    } catch (err: any) {
                      setSignatureToast(`⚠️ ${getSimpleFrenchErrorMessage(err, "Impossible d’importer cette image.")}`);
                    } finally {
                      if (input) input.value = "";
                      setSignatureBusy(false);
                    }
                  }}
                />
              </label>
              {signatureImageUrl ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setSignatureBusy(true);
                      if (signatureImagePath) {
                        const res = await fetch("/api/inrsend/signature-image", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ imagePath: signatureImagePath }),
                        });
                        if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible de retirer cette image."));
                      }
                      setSignatureImagePath("");
                      setSignatureImageUrl("");
                      setSignatureToast("✅ Image retirée.");
                    } catch (err: any) {
                      setSignatureToast(`⚠️ ${getSimpleFrenchErrorMessage(err, "Impossible de retirer cette image.")}`);
                    } finally {
                      setSignatureBusy(false);
                    }
                  }}
                  disabled={signatureBusy}
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.03)",
                    padding: "10px 12px",
                    color: "rgba(255,255,255,0.88)",
                    cursor: signatureBusy ? "not-allowed" : "pointer",
                    opacity: signatureBusy ? 0.6 : 1,
                  }}
                >
                  Retirer l’image
                </button>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.56)" }}>
              La signature est ajoutée automatiquement en bas des envois iNr’Send.
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                Taille de l’image de signature
              </label>
              <select
                value={String(signatureImageWidth)}
                onChange={(e) => setSignatureImageWidth(Number(e.target.value || 400))}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "#ffffff",
                  padding: "10px 12px",
                  color: "#111111",
                  appearance: "auto",
                  WebkitAppearance: "menulist",
                }}
              >
                {SIGNATURE_WIDTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: "#ffffff", color: "#111111" }}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.56)" }}>
                La taille choisie sera utilisée automatiquement dans les emails.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
            Aperçu actuel :
          </div>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              padding: "10px 12px",
              color: "rgba(255,255,255,0.86)",
              fontSize: 13,
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                color: "rgba(255,255,255,0.86)",
                fontFamily: "inherit",
                fontSize: 13,
              }}
            >
              {signatureEnabled ? (signaturePreview || "Aperçu indisponible pour le moment.") : "Signature automatique désactivée."}
            </pre>
            {signatureEnabled && signatureImageUrl ? (
              <div style={{ marginTop: 12 }}>
                <img
                  src={signatureImageUrl}
                  alt="Aperçu image de signature"
                  style={{ width: `${signatureImageWidth}px`, maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, display: "block" }}
                />
              </div>
            ) : null}
          </div>

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
                    body: JSON.stringify({ enabled: signatureEnabled, template: signatureTemplate, imagePath: signatureImagePath, imageUrl: signatureImageUrl, imageWidth: signatureImageWidth }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(await getSimpleFrenchApiError(res, "Impossible d’enregistrer la signature."));
                  setSignatureEnabled(data?.enabled !== false);
                  setSignatureTemplate(String(data?.template || signatureTemplate));
                  setSignatureImagePath(String(data?.imagePath || signatureImagePath));
                  setSignatureImageUrl(String(data?.imageUrl || ""));
                  setSignaturePreview(String(data?.preview || ""));
                  setSignatureImageWidth(Number(data?.imageWidth || signatureImageWidth) || 400);
                  setSignatureToast("✅ Signature enregistrée.");
                } catch (e: any) {
                  setSignatureToast(`⚠️ ${getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer la signature.")}`);
                } finally {
                  setSignatureBusy(false);
                }
              }}
            />
          </div>
        </div>
      </GlassCard>

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
                  Choisissez un fournisseur (prérempli), saisissez votre <b>identifiant</b> et votre <b>mot de passe</b>, puis cliquez sur <b>Connecter</b>.
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
                  onChange={(e) => {
                    const nextKey = e.target.value as ImapPresetKey;
                    setImapPresetKey(nextKey);
                    applyImapPreset(nextKey);
                  }}
                  style={imapSelectStyle}
                >
                  {Object.entries(IMAP_PRESETS).map(([k, v]) => (
                    <option key={k} value={k} style={{ background: "#ffffff", color: "#111827" }}>
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
                  style={imapFieldStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Mot de passe (ou mot de passe d’application)</label>
                <div style={{ position: "relative" }}>
                  <input
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    type={imapShowPassword ? "text" : "password"}
                    placeholder="••••••••"
                    style={{ ...imapFieldStyle, width: "100%", paddingRight: 48 }}
                  />
                  <button
                    type="button"
                    onClick={() => setImapShowPassword((v) => !v)}
                    aria-label={imapShowPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    title={imapShowPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      border: "none",
                      background: "transparent",
                      color: "rgba(255,255,255,0.82)",
                      cursor: "pointer",
                      fontSize: 18,
                      lineHeight: 1,
                    }}
                  >
                    {imapShowPassword ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {imapPresetKey === "other"
                    ? "Autre fournisseur : renseignez vos paramètres librement."
                    : `Réglages préremplis pour ${IMAP_PRESETS[imapPresetKey].label} — tous les champs restent modifiables.`}
                </div>
                {imapAssistMessage ? (
                  <div style={{ fontSize: 12, color: "#93c5fd" }}>{imapAssistMessage}</div>
                ) : null}
                {isMobileImapLayout ? (
                  <>
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={imapCustom.imap_host}
                        onChange={(e) => setImapCustom((p) => ({ ...p, imap_host: e.target.value }))}
                        placeholder="Serveur IMAP (ex: imap.domaine.fr)"
                        style={imapFieldStyle}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 8 }}>
                        <input
                          value={imapCustom.imap_port}
                          onChange={(e) => setImapCustom((p) => ({ ...p, imap_port: Number(e.target.value || 0) }))}
                          placeholder="993"
                          type="number"
                          style={imapFieldStyle}
                        />
                        <select
                          value={imapCustom.imap_secure ? "ssl" : "none"}
                          onChange={(e) => {
                            const mode = e.target.value as ImapSecurityMode;
                            setImapCustom((p) => ({ ...p, imap_secure: mode === "ssl" }));
                          }}
                          style={{ ...imapSelectStyle, minWidth: 0 }}
                        >
                          <option value="ssl" style={{ background: "#ffffff", color: "#111827" }}>Sécurité IMAP : SSL/TLS</option>
                          <option value="none" style={{ background: "#ffffff", color: "#111827" }}>Sécurité IMAP : aucune</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={imapCustom.smtp_host}
                        onChange={(e) => setImapCustom((p) => ({ ...p, smtp_host: e.target.value }))}
                        placeholder="Serveur SMTP (ex: smtp.domaine.fr)"
                        style={imapFieldStyle}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 8 }}>
                        <input
                          value={imapCustom.smtp_port}
                          onChange={(e) => {
                            const port = Number(e.target.value || 0);
                            setImapCustom((p) => {
                              const next = { ...p, smtp_port: port };
                              const suggestion = suggestSmtpSecurityForPort(port);
                              if (!suggestion) return next;
                              return applySmtpSecurityMode(next, suggestion.mode);
                            });
                            const suggestion = suggestSmtpSecurityForPort(port);
                            setImapAssistMessage(suggestion?.message || null);
                          }}
                          placeholder="587"
                          type="number"
                          style={imapFieldStyle}
                        />
                        <select
                          value={smtpSecurityModeFromSettings(imapCustom)}
                          onChange={(e) => {
                            const mode = e.target.value as SmtpSecurityMode;
                            setImapCustom((p) => applySmtpSecurityMode(p, mode));
                            setImapAssistMessage(
                              mode === "ssl"
                                ? "Sécurité SMTP réglée sur SSL/TLS. Recommandé le plus souvent avec le port 465."
                                : mode === "starttls"
                                ? "Sécurité SMTP réglée sur STARTTLS. Recommandé le plus souvent avec le port 587."
                                : "Sécurité SMTP personnalisée : aucun chiffrement sélectionné."
                            );
                          }}
                          style={{ ...imapSelectStyle, minWidth: 0 }}
                        >
                          <option value="ssl" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : SSL/TLS</option>
                          <option value="starttls" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : STARTTLS</option>
                          <option value="none" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : aucune</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.86fr) 96px minmax(220px,0.64fr)", gap: 8 }}>
                      <input
                        value={imapCustom.imap_host}
                        onChange={(e) => setImapCustom((p) => ({ ...p, imap_host: e.target.value }))}
                        placeholder="IMAP host (ex: imap.domaine.fr)"
                        style={imapFieldStyle}
                      />
                      <input
                        value={imapCustom.imap_port}
                        onChange={(e) => setImapCustom((p) => ({ ...p, imap_port: Number(e.target.value || 0) }))}
                        placeholder="993"
                        type="number"
                        style={imapFieldStyle}
                      />
                      <select
                        value={imapCustom.imap_secure ? "ssl" : "none"}
                        onChange={(e) => {
                          const mode = e.target.value as ImapSecurityMode;
                          setImapCustom((p) => ({ ...p, imap_secure: mode === "ssl" }));
                        }}
                        style={{ ...imapSelectStyle, minWidth: 0 }}
                      >
                        <option value="ssl" style={{ background: "#ffffff", color: "#111827" }}>Sécurité IMAP : SSL/TLS</option>
                        <option value="none" style={{ background: "#ffffff", color: "#111827" }}>Sécurité IMAP : aucune</option>
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.86fr) 96px minmax(220px,0.64fr)", gap: 8 }}>
                      <input
                        value={imapCustom.smtp_host}
                        onChange={(e) => setImapCustom((p) => ({ ...p, smtp_host: e.target.value }))}
                        placeholder="SMTP host (ex: smtp.domaine.fr)"
                        style={imapFieldStyle}
                      />
                      <input
                        value={imapCustom.smtp_port}
                        onChange={(e) => {
                          const port = Number(e.target.value || 0);
                          setImapCustom((p) => {
                            const next = { ...p, smtp_port: port };
                            const suggestion = suggestSmtpSecurityForPort(port);
                            if (!suggestion) return next;
                            return applySmtpSecurityMode(next, suggestion.mode);
                          });
                          const suggestion = suggestSmtpSecurityForPort(port);
                          setImapAssistMessage(suggestion?.message || null);
                        }}
                        placeholder="587"
                        type="number"
                        style={imapFieldStyle}
                      />
                      <select
                        value={smtpSecurityModeFromSettings(imapCustom)}
                        onChange={(e) => {
                          const mode = e.target.value as SmtpSecurityMode;
                          setImapCustom((p) => applySmtpSecurityMode(p, mode));
                          setImapAssistMessage(
                            mode === "ssl"
                              ? "Sécurité SMTP réglée sur SSL/TLS. Recommandé le plus souvent avec le port 465."
                              : mode === "starttls"
                              ? "Sécurité SMTP réglée sur STARTTLS. Recommandé le plus souvent avec le port 587."
                              : "Sécurité SMTP personnalisée : aucun chiffrement sélectionné."
                          );
                        }}
                        style={{ ...imapSelectStyle, minWidth: 0 }}
                      >
                        <option value="ssl" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : SSL/TLS</option>
                        <option value="starttls" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : STARTTLS</option>
                        <option value="none" style={{ background: "#ffffff", color: "#111827" }}>Sécurité SMTP : aucune</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

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
                      setImapConnectBusy(true);
                      const preset = imapCustom;
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
                      await refreshMailAccounts(true);
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
