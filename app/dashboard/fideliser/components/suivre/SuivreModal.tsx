import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import stylesDash from "../../../dashboard.module.css";
import { getTemplates, type TemplateDef } from "@/lib/messageTemplates";
import { useBusinessTemplateContext } from "@/app/dashboard/_hooks/useBusinessTemplateContext";
import RichMailEditor from "@/app/dashboard/_components/RichMailEditor";
import TemplateSubjectInlineEditor from "@/app/dashboard/_components/TemplateSubjectInlineEditor";
import { extractTemplatePlaceholders, textToRichMailHtml } from "@/lib/mailRichText";
import { confirmInrcy } from "@/lib/inrcyDialog";
import TemplateAttachmentPicker from "@/app/dashboard/_components/TemplateAttachmentPicker";
import type { ComposeAttachmentRef } from "@/app/dashboard/mails/_lib/mailboxPhase1";
import { storeWorkflowMailPrefillAttachments } from "@/app/dashboard/_lib/workflowMailPrefillAttachments";

export default function SuivreModal({
  styles,
  onClose,
  onDone = onClose,
}: {
  styles: typeof stylesDash;
  onClose: () => void | Promise<void>;
  onDone?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { sectorCategory, profession } = useBusinessTemplateContext();

  const templates = useMemo(() => getTemplates("suivis", undefined, sectorCategory, profession), [sectorCategory, profession]);
  const categories = useMemo(() => {
    const map = new Map<string, TemplateDef>();
    for (const t of templates) {
      if (!map.has(t.category)) map.set(t.category, t);
    }
    return Array.from(map.values());
  }, [templates]);

  const [selectedKey, setSelectedKey] = useState<string>("");
  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? categories[0] ?? templates[0],
    [templates, categories, selectedKey]
  );

  const [subject, setSubject] = useState("");
  useEffect(() => {
    if (!categories.length) {
      setSelectedKey("");
      return;
    }
    setSelectedKey(categories[0]?.key ?? "");
  }, [categories]);

  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [attachments, setAttachments] = useState<ComposeAttachmentRef[]>([]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);


  useEffect(() => {
    if (!selected) return;
    const subj = selected.subject;
    const txt = selected.body;
    setSubject(subj);
    setBody(txt);
    setBodyHtml(textToRichMailHtml(txt));

    (async () => {
      try {
        const r = await fetch("/api/templates/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_override: subj, body_override: txt }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.subject) setSubject(String(j.subject));
        if (j?.body_text) {
          const renderedBody = String(j.body_text);
          setBody(renderedBody);
          setBodyHtml(textToRichMailHtml(renderedBody));
        }
      } catch {}
    })();
  }, [selected?.key]);


  const generateAiTemplateContent = async () => {
    if (!selected || aiGenerating) return;
    setAiError("");
    setAiGenerating(true);
    try {
      const r = await fetch("/api/templates/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "fideliser",
          mission: "Suivre",
          template_key: selected.key,
          template_title: selected.title,
          template_category: selected.category,
          subject,
          body,
          attachments,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j?.error || "La génération IA a échoué."));
      if (j?.subject) setSubject(String(j.subject));
      if (j?.body_text) {
        const nextBody = String(j.body_text);
        setBody(nextBody);
        setBodyHtml(textToRichMailHtml(nextBody));
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "La génération IA a échoué.");
    } finally {
      setAiGenerating(false);
    }
  };

  const onNext = async () => {
    const placeholders = extractTemplatePlaceholders(`${subject}\n${body}`);
    if (placeholders.length > 0) {
      const preview = placeholders.slice(0, 6).join(", ");
      const more = placeholders.length > 6 ? ` et ${placeholders.length - 6} autre(s)` : "";
      const shouldContinue = await confirmInrcy({
        title: "Éléments à compléter",
        message: `Votre message contient encore des éléments entre crochets : ${preview}${more}. Voulez-vous continuer quand même ?`,
        confirmLabel: "Continuer quand même",
        cancelLabel: "Corriger le message",
        variant: "warning",
      });
      if (!shouldContinue) return;
    }
    const q = new URLSearchParams();
    q.set("folder", "suivis");
    if (selected?.key) q.set("template_key", selected.key);
    // URLSearchParams encode déjà correctement : pas besoin de encodeURIComponent ici
    q.set("prefill_subject", subject);
    q.set("prefill_text", body);
    q.set("prefill_html", bodyHtml || textToRichMailHtml(body));
    if (attachments.length > 0) {
      const attachmentStorageKey = storeWorkflowMailPrefillAttachments(attachments, "fideliser-suivre");
      if (attachmentStorageKey) q.set("prefill_attachments_key", attachmentStorageKey);
      else q.set("prefill_attachments", JSON.stringify(attachments));
    }
    q.set("compose", "1");
    q.set("finalizer", "fideliser");

    // Track only after a real send (handled by iNr'Send).
    q.set("track_kind", "fideliser");
    q.set("track_type", "thanks_mail");
    q.set(
      "track_payload",
      JSON.stringify({
        template_key: selected?.key ?? null,
        template_category: selected?.category ?? null,
      })
    );

    router.push(`/dashboard/mails?${q.toString()}`);
    void onDone();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 }}>
      <div className={styles.blockCard} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", height: "100%" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 10, fontSize: 20, display: isMobile ? "none" : "block" }}>
          Modèle d’email — Suivre
        </div>

        <div className={styles.subtitle} style={{ marginBottom: isMobile ? 0 : 10, display: isMobile ? "none" : "block" }}>
          Choisissez un email préconçu, modifiez si besoin, puis cliquez sur Suivant.
        </div>

        <div style={{ marginBottom: isMobile ? 8 : 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.64)', marginBottom: 8, textTransform: 'uppercase', display: isMobile ? 'none' : 'block' }}>
            Modèle dédié
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              aria-label="Choisir un modèle"
              style={{
                width: '100%',
                flex: isMobile ? '1 1 100%' : '0 1 500px',
                maxWidth: isMobile ? '100%' : 500,
                minWidth: 0,
                borderRadius: 16,
                padding: '14px 16px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 100%)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.16)',
                outline: 'none',
                fontSize: 15,
                fontWeight: 700,
                boxShadow: '0 14px 28px rgba(0,0,0,0.18)',
                boxSizing: 'border-box',
                display: 'block',
              }}
            >
              {categories.map((tpl, index) => (
                <option key={tpl.category} value={tpl.key} style={{ color: '#111111' }}>
                  {index + 1}. {tpl.title}
                </option>
              ))}
            </select>
            <TemplateAttachmentPicker
              styles={styles}
              attachments={attachments}
              setAttachments={setAttachments}
              isMobile={isMobile}
              inputIdPrefix="suivre-template-attachments"
            />
            <button
              type="button"
              className={`${styles.secondaryBtn} ${styles.aiGenerateBtn}`}
              onClick={generateAiTemplateContent}
              disabled={aiGenerating || !selected}
              style={{ minHeight: 46, padding: "10px 16px", fontWeight: 900, borderRadius: 999, opacity: aiGenerating ? 0.7 : 1, flex: isMobile ? "1 1 100%" : "0 0 auto", whiteSpace: "nowrap" }}
            >
              {aiGenerating ? "Génération…" : "✨ Générer avec iNrCy"}
            </button>
          </div>
          {aiError ? <div style={{ marginTop: 8, width: "100%", color: "#fecaca", fontSize: 13, fontWeight: 700 }}>{aiError}</div> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={isMobile ? mobileSubjectSectionStyle : sectionStyle}>
            {isMobile ? (
              <TemplateSubjectInlineEditor value={subject} onChange={setSubject} />
            ) : (
              <>
                <div style={sectionHeaderStyle}>Objet</div>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Objet"
                  className={styles.input}
                  style={{ width: "100%", fontSize: 16, boxSizing: "border-box", display: "block", maxWidth: "100%" }}
                />
              </>
            )}
          </div>

          <div style={{ ...sectionStyle, ...messageSectionStyle }}>
            <RichMailEditor
              text={body}
              html={bodyHtml}
              onChange={({ text, html }) => {
                setBody(text);
                setBodyHtml(html);
              }}
              placeholder="Votre message…"
              toolbarTitle={<span style={{ ...sectionHeaderStyle, marginBottom: 0 }}>Message</span>}
              compactToolbar
              minHeight={0}
              className={styles.textarea}
              editorStyle={{
                ...messageTextareaStyle,
                minHeight: 0,
                height: "100%",
                maxHeight: "100%",
              }}
            />
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={() => void onClose()} className={styles.secondaryBtn}>
              Annuler
            </button>
            <button type="button" onClick={onNext} className={styles.primaryBtn}>
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const sectionStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  background:
    "linear-gradient(180deg, rgba(56,189,248,0.06) 0%, rgba(167,139,250,0.04) 60%, rgba(255,255,255,0.03) 100%)",
  borderRadius: 18,
  padding: 12,
};

const mobileSubjectSectionStyle: CSSProperties = {
  ...sectionStyle,
  padding: "10px 12px",
};


const sectionHeaderStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.02em",
  color: "rgba(255,255,255,0.78)",
  marginBottom: 8,
};


const messageSectionStyle: CSSProperties = {
  ...sectionStyle,
  flex: "1 1 0",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const messageTextareaStyle: CSSProperties = {
  width: "100%",
  flex: "1 1 auto",
  minHeight: "clamp(180px, 30vh, 260px)",
  height: "100%",
  maxHeight: "100%",
  resize: "none",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  fontSize: 16,
  boxSizing: "border-box",
  display: "block",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: "auto",
  paddingTop: 8,
  paddingBottom: "max(2px, env(safe-area-inset-bottom))",
  position: "sticky",
  bottom: 0,
  zIndex: 1,
  background: "transparent",
};
