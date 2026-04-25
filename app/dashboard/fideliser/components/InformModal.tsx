import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import stylesDash from "../../dashboard/dashboard.module.css";
import { getTemplates, type TemplateDef } from "@/lib/messageTemplates";
import { useBusinessTemplateContext } from "@/app/dashboard/_hooks/useBusinessTemplateContext";

export default function InformModal({
  styles,
  onClose,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
}) {
  const router = useRouter();
  const { sectorCategory, profession } = useBusinessTemplateContext();

  const templates = useMemo(() => getTemplates("informations", undefined, sectorCategory, profession), [sectorCategory, profession]);
  const categories = useMemo(() => {
    const map = new Map<string, TemplateDef>();
    for (const t of templates) {
      if (!map.has(t.category)) map.set(t.category, t);
    }
    return Array.from(map.values());
  }, [templates]);

  const [selectedKey, setSelectedKey] = useState<string>(() => templates[0]?.key ?? "");
  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) ?? templates[0],
    [templates, selectedKey]
  );

  const [subject, setSubject] = useState("");
  useEffect(() => {
    if (!templates.length) return;
    setSelectedKey((current) => (templates.some((t) => t.key === current) ? current : templates[0]?.key ?? ""));
  }, [templates]);

  const [body, setBody] = useState("");

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

    // Auto-remplissage (profil / activité / liens connectés)
    (async () => {
      try {
        const r = await fetch("/api/templates/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_override: subj, body_override: txt }),
        });
        const j = await r.json().catch(() => ({}));
        if (j?.subject) setSubject(String(j.subject));
        if (j?.body_text) setBody(String(j.body_text));
      } catch {
        // ignore
      }
    })();
  }, [selected?.key]);

  const onNext = async () => {
    const q = new URLSearchParams();
    q.set("folder", "informations");
    if (selected?.key) q.set("template_key", selected.key);
    // URLSearchParams encode déjà, pas besoin de encodeURIComponent
    q.set("prefill_subject", subject);
    q.set("prefill_text", body);
    q.set("compose", "1");

    // Track only after a real send (handled by iNr'Send).
    q.set("track_kind", "fideliser");
    q.set("track_type", "newsletter_mail");
    q.set(
      "track_payload",
      JSON.stringify({
        template_key: selected?.key ?? null,
        template_category: selected?.category ?? null,
      })
    );

    router.push(`/dashboard/mails?${q.toString()}`);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 }}>
      <div className={styles.blockCard} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, maxWidth: "100%", boxSizing: "border-box", height: "100%" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 10, fontSize: 20 }}>
          Modèle d’email — Informer
        </div>

        <div className={styles.subtitle} style={{ marginBottom: isMobile ? 0 : 10, display: isMobile ? "none" : "block" }}>
          Choisissez un email préconçu, modifiez si besoin, puis cliquez sur Suivant.
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.64)', marginBottom: 8, textTransform: 'uppercase' }}>
            Modèle dédié
          </div>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            aria-label="Choisir un modèle"
            style={{
              width: '100%',
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
              maxWidth: '100%',
            }}
          >
            {categories.map((tpl, index) => (
              <option key={tpl.category} value={tpl.key} style={{ color: '#111111' }}>
                {index + 1}. {tpl.title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Objet</div>
            <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet"
                className={styles.input}
                style={{ width: "100%", fontSize: 16, boxSizing: "border-box", display: "block", maxWidth: "100%" }}
              />
          </div>

          <div style={{ ...sectionStyle, ...messageSectionStyle }}>
            <div style={sectionHeaderStyle}>Message (texte)</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Votre message…"
              className={styles.textarea}
              style={messageTextareaStyle}
            />
          </div>

          <div style={footerStyle}>
            <button type="button" onClick={onClose} className={styles.secondaryBtn}>
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

const sectionHeaderStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.02em",
  color: "rgba(255,255,255,0.78)",
  marginBottom: 8,
};


const messageSectionStyle: CSSProperties = {
  ...sectionStyle,
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const messageTextareaStyle: CSSProperties = {
  width: "100%",
  flex: 1,
  minHeight: "clamp(180px, 30vh, 260px)",
  height: "100%",
  maxHeight: "100%",
  resize: "none",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
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
