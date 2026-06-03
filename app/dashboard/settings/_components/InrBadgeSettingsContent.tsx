"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createInrBadgeQrMatrix } from "@/lib/inrBadgeQr";
import type { InrBadgeProfileSummary } from "@/lib/inrBadge";
import {
  DEFAULT_INRBADGE_APPOINTMENT_SETTINGS,
  DEFAULT_INRBADGE_SHARE_SETTINGS,
  normalizeInrBadgeAppointmentSettings,
  normalizeInrBadgeShareSettings,
  type InrBadgeAppointmentSettings,
  type InrBadgeShareKey,
  type InrBadgeShareSettings,
} from "@/lib/inrBadgeSettings";

type InrBadgeChannelStatus = {
  connected: boolean;
  url?: string | null;
};

type InrBadgeSettingsChannels = {
  siteInrcy: InrBadgeChannelStatus;
  siteWeb: InrBadgeChannelStatus;
  googleBusiness: InrBadgeChannelStatus;
  facebook: InrBadgeChannelStatus;
  instagram: InrBadgeChannelStatus;
  linkedin: InrBadgeChannelStatus;
  mails: InrBadgeChannelStatus;
  tiktok: InrBadgeChannelStatus;
};

type Props = {
  profile: InrBadgeProfileSummary;
  publicUrl: string;
  profileReady: boolean;
  channels: InrBadgeSettingsChannels;
  onOpenProfile: () => void;
  onOpenActivity: () => void;
};

type ShareKey = InrBadgeShareKey;
type ShareSettings = InrBadgeShareSettings;
type AppointmentSettings = InrBadgeAppointmentSettings;

function trim(value: unknown) {
  return String(value || "").trim();
}

function getDisplayName(profile: InrBadgeProfileSummary) {
  return [profile.firstName, profile.lastName].map(trim).filter(Boolean).join(" ") || "Votre nom";
}

function getStorageKey(profile: InrBadgeProfileSummary, publicUrl: string) {
  const id = trim(profile.userId) || publicUrl || "anonymous";
  return `inrcy_inrbadge_share_settings_v1:${id}`;
}

function loadShareSettings(storageKey: string): ShareSettings {
  if (typeof window === "undefined") return DEFAULT_INRBADGE_SHARE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_INRBADGE_SHARE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Record<ShareKey, unknown>>;
    return normalizeInrBadgeShareSettings(parsed);
  } catch {
    return DEFAULT_INRBADGE_SHARE_SETTINGS;
  }
}

function loadAppointmentSettings(storageKey: string): AppointmentSettings {
  if (typeof window === "undefined") return DEFAULT_INRBADGE_APPOINTMENT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(`${storageKey}:rdv`);
    if (!raw) return DEFAULT_INRBADGE_APPOINTMENT_SETTINGS;
    return normalizeInrBadgeAppointmentSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_INRBADGE_APPOINTMENT_SETTINGS;
  }
}

function saveBadgeSettings(storageKey: string, settings: ShareSettings, appointmentSettings: AppointmentSettings) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    window.localStorage.setItem(`${storageKey}:rdv`, JSON.stringify(appointmentSettings));
  } catch {
    // stockage navigateur indisponible : on garde l'état en mémoire
  }
}

async function persistBadgeSettings(settings: ShareSettings, appointmentSettings: AppointmentSettings) {
  try {
    await fetch("/api/inrbadge/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, appointmentSettings }),
    });
  } catch {
    // Le localStorage garde une copie instantanée si le réseau est indisponible.
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
}

function safeFilename(value: string) {
  return trim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "inrbadge";
}

function drawQrOnCanvas(ctx: CanvasRenderingContext2D, matrix: boolean[][], x: number, y: number, size: number) {
  const moduleSize = size / matrix.length;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#111827";
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, colIndex) => {
      if (!dark) return;
      ctx.fillRect(x + colIndex * moduleSize, y + rowIndex * moduleSize, Math.ceil(moduleSize), Math.ceil(moduleSize));
    });
  });
}

async function downloadQrPng(publicUrl: string, profile: InrBadgeProfileSummary) {
  const matrix = createInrBadgeQrMatrix(publicUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111827";
  ctx.font = "700 72px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("iNr'Badge", canvas.width / 2, 130);

  ctx.fillStyle = "#4b5563";
  ctx.font = "400 36px Arial, sans-serif";
  ctx.fillText("Mon entreprise en QR Code", canvas.width / 2, 190);

  drawQrOnCanvas(ctx, matrix, 220, 300, 760);

  ctx.fillStyle = "#111827";
  ctx.font = "700 46px Arial, sans-serif";
  ctx.fillText(trim(profile.companyLegalName) || "Votre entreprise", canvas.width / 2, 1165);

  ctx.fillStyle = "#4b5563";
  ctx.font = "400 32px Arial, sans-serif";
  ctx.fillText(getDisplayName(profile), canvas.width / 2, 1220);

  ctx.font = "400 28px Arial, sans-serif";
  const urlText = publicUrl.length > 52 ? `${publicUrl.slice(0, 49)}...` : publicUrl;
  ctx.fillText(urlText, canvas.width / 2, 1295);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  downloadBlob(blob, `${safeFilename(trim(profile.companyLegalName) || getDisplayName(profile))}-inrbadge.png`);
}

function escapePdfText(value: string) {
  return trim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createPdfBlob(publicUrl: string, profile: InrBadgeProfileSummary) {
  const matrix = createInrBadgeQrMatrix(publicUrl);
  const pageWidth = 595;
  const pageHeight = 842;
  const qrSize = 330;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 245;
  const moduleSize = qrSize / matrix.length;
  const company = escapePdfText(trim(profile.companyLegalName) || "Votre entreprise");
  const name = escapePdfText(getDisplayName(profile));
  const url = escapePdfText(publicUrl);

  const rects = matrix.flatMap((row, rowIndex) => row.map((dark, colIndex) => {
    if (!dark) return "";
    const x = qrX + colIndex * moduleSize;
    const y = qrY + (matrix.length - rowIndex - 1) * moduleSize;
    return `${x.toFixed(2)} ${y.toFixed(2)} ${Math.ceil(moduleSize).toFixed(2)} ${Math.ceil(moduleSize).toFixed(2)} re f`;
  })).filter(Boolean).join("\n");

  const stream = [
    "1 1 1 rg 0 0 595 842 re f",
    "0.07 0.09 0.16 rg",
    "BT /F1 26 Tf 246 760 Td (iNr'Badge) Tj ET",
    "0.29 0.33 0.42 rg",
    "BT /F1 14 Tf 204 735 Td (Mon entreprise en QR Code) Tj ET",
    "1 1 1 rg",
    `${(qrX - 18).toFixed(2)} ${(qrY - 18).toFixed(2)} ${(qrSize + 36).toFixed(2)} ${(qrSize + 36).toFixed(2)} re f`,
    "0.07 0.09 0.16 rg",
    rects,
    "0.07 0.09 0.16 rg",
    `BT /F1 20 Tf 70 190 Td (${company}) Tj ET`,
    "0.29 0.33 0.42 rg",
    `BT /F1 13 Tf 70 166 Td (${name}) Tj ET`,
    `BT /F1 10 Tf 70 140 Td (${url}) Tj ET`,
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += obj;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function FieldToggle({
  label,
  checked,
  disabled,
  helper,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  helper?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ ...toggleRowStyle, opacity: disabled ? 0.55 : 1 }}>
      <span style={{ minWidth: 0 }}>
        <strong style={toggleTitleStyle}>{label}</strong>
        {helper ? <small style={toggleHelperStyle}>{helper}</small> : null}
      </span>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 18, height: 18, accentColor: "#8b5cf6" }}
      />
    </label>
  );
}

function FieldSelect({
  label,
  value,
  options,
  helper,
  onChange,
}: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  helper?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={selectRowStyle}>
      <span style={{ minWidth: 0 }}>
        <strong style={toggleTitleStyle}>{label}</strong>
        {helper ? <small style={toggleHelperStyle}>{helper}</small> : null}
      </span>
      <select value={String(value)} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function InrBadgeSettingsContent({
  profile,
  publicUrl,
  profileReady,
  channels,
  onOpenProfile,
  onOpenActivity,
}: Props) {
  const storageKey = useMemo(() => getStorageKey(profile, publicUrl), [profile, publicUrl]);
  const [settings, setSettings] = useState<ShareSettings>(() => loadShareSettings(storageKey));
  const [appointmentSettings, setAppointmentSettings] = useState<AppointmentSettings>(() => loadAppointmentSettings(storageKey));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const localSettings = loadShareSettings(storageKey);
    const localAppointmentSettings = loadAppointmentSettings(storageKey);
    setSettings(localSettings);
    setAppointmentSettings(localAppointmentSettings);

    const loadServerSettings = async () => {
      try {
        const res = await fetch("/api/inrbadge/settings", { cache: "no-store" });
        const json = await res.json().catch(() => null) as { settings?: unknown; appointmentSettings?: unknown } | null;
        if (!res.ok || cancelled) return;
        const serverSettings = normalizeInrBadgeShareSettings(json?.settings);
        const serverAppointmentSettings = normalizeInrBadgeAppointmentSettings(json?.appointmentSettings);
        setSettings(serverSettings);
        setAppointmentSettings(serverAppointmentSettings);
        saveBadgeSettings(storageKey, serverSettings, serverAppointmentSettings);
      } catch {
        // On garde les réglages locaux en secours.
      }
    };

    void loadServerSettings();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const updateSetting = (key: ShareKey, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveBadgeSettings(storageKey, next, appointmentSettings);
    void persistBadgeSettings(next, appointmentSettings);
    setNotice("Réglages iNr'Badge enregistrés.");
    window.setTimeout(() => setNotice(null), 1800);
  };

  const updateAppointmentSettings = (patch: Partial<AppointmentSettings>) => {
    const next = normalizeInrBadgeAppointmentSettings({ ...appointmentSettings, ...patch });
    setAppointmentSettings(next);
    saveBadgeSettings(storageKey, settings, next);
    void persistBadgeSettings(settings, next);
    setNotice("Réglages de prise de RDV enregistrés.");
    window.setTimeout(() => setNotice(null), 1800);
  };

  const toggleWeekday = (day: number) => {
    const exists = appointmentSettings.weekdays.includes(day);
    const nextWeekdays = exists
      ? appointmentSettings.weekdays.filter((item) => item !== day)
      : [...appointmentSettings.weekdays, day];
    updateAppointmentSettings({ weekdays: nextWeekdays });
  };

  const company = trim(profile.companyLegalName) || "Votre entreprise";
  const displayName = getDisplayName(profile);
  const phone = trim(profile.phone);
  const email = trim(profile.contactEmail);

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setNotice("Lien copié.");
    } catch {
      setNotice("Impossible de copier automatiquement. Sélectionnez le lien manuellement.");
    }
    window.setTimeout(() => setNotice(null), 1800);
  };

  const downloadPdf = () => {
    if (!publicUrl) return;
    const blob = createPdfBlob(publicUrl, profile);
    downloadBlob(blob, `${safeFilename(company)}-inrbadge.pdf`);
  };

  const downloadPng = () => {
    if (!publicUrl) return;
    void downloadQrPng(publicUrl, profile);
  };

  const channelItems: Array<{ key: ShareKey; label: string; connected: boolean; helper: string }> = [
    { key: "siteInrcy", label: "Site iNrCy", connected: channels.siteInrcy.connected, helper: "Disponible si le site iNrCy est actif." },
    { key: "siteWeb", label: "Site web", connected: channels.siteWeb.connected, helper: "Disponible si le site web est renseigné." },
    { key: "googleBusiness", label: "Google Business", connected: channels.googleBusiness.connected, helper: "Disponible si Google Business est connecté." },
    { key: "facebook", label: "Facebook", connected: channels.facebook.connected, helper: "Disponible si la page Facebook est connectée." },
    { key: "instagram", label: "Instagram", connected: channels.instagram.connected, helper: "Disponible si Instagram est connecté." },
    { key: "linkedin", label: "LinkedIn", connected: channels.linkedin.connected, helper: "Disponible si LinkedIn est connecté." },
    { key: "mails", label: "Mails", connected: channels.mails.connected, helper: "Disponible si au moins une boîte mail est connectée." },
    { key: "tiktok", label: "TikTok", connected: channels.tiktok.connected, helper: "Arrive bientôt." },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={heroCardStyle}>
        <div style={heroIconStyle}>{profile.logoUrl ? <img src={profile.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>iNr</span>}</div>
        <div style={{ minWidth: 0 }}>
          <h2 style={heroTitleStyle}>iNr'Badge</h2>
          <p style={heroTextStyle}>Mon entreprise en QR Code</p>
          <p style={heroSubTextStyle}>Le QR reste permanent. Les informations partagées peuvent évoluer sans réimprimer vos supports.</p>
        </div>
      </div>

      {!profileReady ? (
        <div style={warningCardStyle}>
          <strong>Profil incomplet</strong>
          <span>Complétez Mon profil pour activer votre iNr'Badge et générer le QR Code.</span>
          <button type="button" onClick={onOpenProfile} style={primarySmallButtonStyle}>compléter mon profil</button>
        </div>
      ) : null}

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>QR Code</h3>
        <p style={mutedStyle}>{publicUrl || "Le lien sera généré dès que Mon profil sera complété."}</p>
        <div style={buttonGridStyle}>
          <button type="button" style={smallButtonStyle} onClick={copyLink} disabled={!publicUrl}>copier le lien</button>
          <button type="button" style={smallButtonStyle} onClick={downloadPng} disabled={!publicUrl}>télécharger png</button>
          <button type="button" style={smallButtonStyle} onClick={downloadPdf} disabled={!publicUrl}>télécharger pdf</button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Informations partagées</h3>
        <div style={twoColumnsGridStyle}>
          <FieldToggle label="Logo" checked={settings.logo} disabled={!profile.logoUrl} helper={profile.logoUrl ? "Affiché en haut du badge." : "Ajoutez un logo dans Mon profil."} onChange={(value) => updateSetting("logo", value)} />
          <FieldToggle label="Nom du professionnel" checked={settings.name} onChange={(value) => updateSetting("name", value)} />
          <FieldToggle label="Entreprise" checked={settings.company} onChange={(value) => updateSetting("company", value)} />
          <FieldToggle label="Téléphone" checked={settings.phone} disabled={!phone} helper={!phone ? "À compléter dans Mon profil." : undefined} onChange={(value) => updateSetting("phone", value)} />
          <FieldToggle label="Email" checked={settings.email} disabled={!email} helper={!email ? "À compléter dans Mon profil." : undefined} onChange={(value) => updateSetting("email", value)} />
          <FieldToggle label="Enregistrer le contact" checked={settings.saveContact} helper="Prépare la fiche contact vCard pour l'étape publique." onChange={(value) => updateSetting("saveContact", value)} />
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Canaux disponibles au partage</h3>
        <div style={twoColumnsGridStyle}>
          {channelItems.map((item) => (
            <FieldToggle
              key={item.key}
              label={item.label}
              checked={settings[item.key]}
              disabled={!item.connected}
              helper={item.connected ? "Activé sur votre badge si coché." : item.helper}
              onChange={(value) => updateSetting(item.key, value)}
            />
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Prise de RDV</h3>
        <div style={twoColumnsGridStyle}>
          <FieldToggle label="Afficher Prendre RDV" checked={settings.appointment} helper="Ajoute le bouton sur la fiche publique." onChange={(value) => updateSetting("appointment", value)} />
          <FieldSelect label="Durée d'un RDV" value={appointmentSettings.durationMinutes} options={[15, 30, 45, 60, 90, 120].map((value) => ({ value, label: `${value} min` }))} onChange={(value) => updateAppointmentSettings({ durationMinutes: Number(value) })} />
          <FieldSelect label="Proposer sur" value={appointmentSettings.daysAhead} options={[7, 14, 21, 30, 45, 60].map((value) => ({ value, label: `${value} jours` }))} onChange={(value) => updateAppointmentSettings({ daysAhead: Number(value) })} />
          <FieldSelect label="Délai minimum" value={appointmentSettings.minNoticeHours} options={[0, 2, 4, 12, 24, 48, 72].map((value) => ({ value, label: value === 0 ? "Immédiat" : `${value}h avant` }))} onChange={(value) => updateAppointmentSettings({ minNoticeHours: Number(value) })} />
          <FieldSelect label="Début des créneaux" value={appointmentSettings.startTime} options={["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"].map((value) => ({ value, label: value }))} onChange={(value) => updateAppointmentSettings({ startTime: value })} />
          <FieldSelect label="Fin des créneaux" value={appointmentSettings.endTime} options={["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"].map((value) => ({ value, label: value }))} onChange={(value) => updateAppointmentSettings({ endTime: value })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <strong style={toggleTitleStyle}>Jours ouverts à la réservation</strong>
          <div style={weekdayGridStyle}>
            {[{ d: 1, l: "Lun" }, { d: 2, l: "Mar" }, { d: 3, l: "Mer" }, { d: 4, l: "Jeu" }, { d: 5, l: "Ven" }, { d: 6, l: "Sam" }, { d: 0, l: "Dim" }].map((item) => {
              const active = appointmentSettings.weekdays.includes(item.d);
              return (
                <button key={item.d} type="button" onClick={() => toggleWeekday(item.d)} style={active ? weekdayActiveStyle : weekdayButtonStyle}>
                  {item.l}
                </button>
              );
            })}
          </div>
        </div>
        <p style={{ ...mutedStyle, marginTop: 12, marginBottom: 0 }}>Le client choisit un créneau libre. Vous recevez la demande par mail puis vous validez l'enregistrement dans iNr'Calendar.</p>
      </div>

      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>Aperçu rapide</h3>
        <div style={previewCardStyle}>
          {settings.logo && profile.logoUrl ? <img src={profile.logoUrl} alt="" style={previewLogoStyle} /> : <div style={previewLogoFallbackStyle}>iNr</div>}
          {settings.company ? <strong>{company}</strong> : null}
          {settings.name ? <span>{displayName}</span> : null}
          <div style={previewPillsStyle}>
            {settings.phone && phone ? <span>Appeler</span> : null}
            {settings.email && email ? <span>Email</span> : null}
            {channelItems.filter((item) => item.connected && settings[item.key]).slice(0, 5).map((item) => <span key={item.key}>{item.label}</span>)}
            {settings.appointment ? <span>Prendre RDV</span> : null}
          </div>
        </div>
      </div>

      {notice ? <div style={noticeStyle}>{notice}</div> : null}
    </div>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(15,23,42,0.72)",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
};

const heroCardStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  gap: 14,
  alignItems: "center",
  background: "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(14,165,233,0.10)), rgba(15,23,42,0.76)",
};

const heroIconStyle: CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: 999,
  overflow: "hidden",
  flex: "0 0 auto",
  display: "grid",
  placeItems: "center",
  color: "#fff",
  fontWeight: 900,
  background: "linear-gradient(135deg, rgba(139,92,246,0.95), rgba(14,165,233,0.75))",
  border: "1px solid rgba(255,255,255,0.22)",
};

const heroTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontSize: 19 };
const heroTextStyle: CSSProperties = { margin: "4px 0 0", color: "rgba(255,255,255,0.88)", fontWeight: 700 };
const heroSubTextStyle: CSSProperties = { margin: "6px 0 0", color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.45 };
const sectionTitleStyle: CSSProperties = { margin: "0 0 10px", color: "#fff", fontSize: 15 };
const mutedStyle: CSSProperties = { margin: "0 0 12px", color: "rgba(226,232,240,0.70)", fontSize: 12, overflowWrap: "anywhere" };
const gridStyle: CSSProperties = { display: "grid", gap: 10 };
const twoColumnsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const buttonGridStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const smallButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.92)",
  borderRadius: 999,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const primarySmallButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  width: "fit-content",
  background: "linear-gradient(135deg, rgba(139,92,246,0.95), rgba(14,165,233,0.78))",
  border: "none",
};

const warningCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: 8,
  color: "rgba(255,255,255,0.88)",
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(245,158,11,0.28)",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.045)",
  borderRadius: 14,
  padding: "10px 12px",
  color: "#fff",
};

const selectRowStyle: CSSProperties = {
  ...toggleRowStyle,
  alignItems: "stretch",
  flexDirection: "column",
  gap: 8,
};

const selectStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(2,6,23,0.45)",
  color: "#fff",
  borderRadius: 10,
  padding: "8px 9px",
  fontSize: 12,
  fontWeight: 800,
};

const weekdayGridStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 };
const weekdayButtonStyle: CSSProperties = { ...smallButtonStyle, padding: "8px 10px", borderRadius: 12 };
const weekdayActiveStyle: CSSProperties = { ...weekdayButtonStyle, background: "linear-gradient(135deg, rgba(139,92,246,0.95), rgba(14,165,233,0.78))", border: "1px solid rgba(255,255,255,0.18)" };

const toggleTitleStyle: CSSProperties = { display: "block", fontSize: 13, color: "rgba(255,255,255,0.94)" };
const toggleHelperStyle: CSSProperties = { display: "block", marginTop: 3, fontSize: 11, color: "rgba(226,232,240,0.62)", lineHeight: 1.35 };
const previewCardStyle: CSSProperties = { display: "grid", gap: 7, justifyItems: "center", textAlign: "center", padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.06)", color: "#fff" };
const previewLogoStyle: CSSProperties = { width: 62, height: 62, borderRadius: 999, objectFit: "cover", border: "1px solid rgba(255,255,255,0.22)" };
const previewLogoFallbackStyle: CSSProperties = { ...heroIconStyle, width: 62, height: 62 };
const previewPillsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.82)" };
const noticeStyle: CSSProperties = { position: "sticky", bottom: 10, justifySelf: "center", padding: "9px 12px", borderRadius: 999, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.32)", color: "#d1fae5", fontSize: 12, fontWeight: 800 };
