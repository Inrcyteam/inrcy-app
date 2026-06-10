"use client";

import React, { type CSSProperties } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { ComposeAttachmentRef } from "@/app/dashboard/mails/_lib/mailboxPhase1";
import { makeAttachmentPath } from "@/app/dashboard/mails/_lib/mailboxPhase25";

const ATTACH_BUCKET = "inrbox_attachments";

type TemplateAttachmentPickerProps = {
  styles: { secondaryBtn?: string };
  attachments: ComposeAttachmentRef[];
  setAttachments: React.Dispatch<React.SetStateAction<ComposeAttachmentRef[]>>;
  isMobile?: boolean;
  inputIdPrefix: string;
};

export default function TemplateAttachmentPicker({
  styles,
  attachments,
  setAttachments,
  isMobile = false,
  inputIdPrefix,
}: TemplateAttachmentPickerProps) {
  const generatedId = React.useId().replace(/:/g, "");
  const inputId = `${inputIdPrefix}-${generatedId}`;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from<File>(input.files || []);
    if (!files.length || busy) return;

    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      const uploaded: ComposeAttachmentRef[] = [];

      for (const file of files) {
        const path = makeAttachmentPath(file.name || "piece-jointe", userId);
        const { error: uploadError } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (uploadError) throw uploadError;
        uploaded.push({
          bucket: ATTACH_BUCKET,
          path,
          name: file.name || "piece-jointe",
          type: file.type || "application/octet-stream",
          size: file.size || 0,
        });
      }

      setAttachments((prev) => {
        const merged = [...prev];
        for (const item of uploaded) {
          const exists = merged.some((current) => current.bucket === item.bucket && current.path === item.path);
          if (!exists) merged.push(item);
        }
        return merged;
      });
    } catch (err) {
      console.error("Template attachment upload failed", err);
      setError("Pièce jointe impossible à préparer.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto", minWidth: 0 }}>
      <input id={inputId} type="file" multiple onChange={handleFiles} style={{ display: "none" }} />
      <label
        htmlFor={inputId}
        className={styles.secondaryBtn}
        aria-disabled={busy}
        style={{
          ...attachButtonStyle,
          opacity: busy ? 0.72 : 1,
          cursor: busy ? "wait" : "pointer",
          width: isMobile ? "100%" : undefined,
        }}
      >
        <span aria-hidden>📎</span>
        <span>{busy ? "Préparation…" : attachments.length > 0 ? `${attachments.length} fichier${attachments.length > 1 ? "s" : ""}` : "Joindre"}</span>
      </label>

      {attachments.length > 0 ? (
        <div style={chipsWrapStyle} aria-label="Pièces jointes du modèle">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.bucket}:${attachment.path}:${index}`} style={chipStyle} title={attachment.name}>
              <span style={chipNameStyle}>{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`Retirer ${attachment.name}`}
                style={chipRemoveStyle}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? <div style={errorStyle}>{error}</div> : null}
    </div>
  );
}

const attachButtonStyle: CSSProperties = {
  minHeight: 46,
  padding: "10px 16px",
  borderRadius: 999,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  userSelect: "none",
};

const chipsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 7,
  maxWidth: 260,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: 230,
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.88)",
  fontSize: 12,
  fontWeight: 800,
};

const chipNameStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const chipRemoveStyle: CSSProperties = {
  border: 0,
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  width: 18,
  height: 18,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  lineHeight: 1,
  fontWeight: 900,
  padding: 0,
};

const errorStyle: CSSProperties = {
  marginTop: 6,
  color: "#fecaca",
  fontSize: 12,
  fontWeight: 800,
};
