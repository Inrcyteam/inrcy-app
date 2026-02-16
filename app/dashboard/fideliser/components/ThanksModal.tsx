import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import stylesDash from "../../dashboard/dashboard.module.css";
import { getTemplates, type TemplateDef } from "@/lib/messageTemplates";

export default function ThanksModal({
  styles,
  onClose,
}: {
  styles: typeof stylesDash;
  onClose: () => void;
}) {
  const router = useRouter();

  const templates = useMemo(() => getTemplates("suivis"), []);
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
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!selected) return;
    const subj = selected.subject;
    const txt = selected.body;
    setSubject(subj);
    setBody(txt);

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
      } catch {}
    })();
  }, [selected?.key]);

  const onNext = async () => {
    const q = new URLSearchParams();
    q.set("folder", "suivis");
    if (selected?.key) q.set("template_key", selected.key);
    // URLSearchParams encode déjà correctement : pas besoin de encodeURIComponent ici
    q.set("prefill_subject", subject);
    q.set("prefill_text", body);
    q.set("compose", "1");

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
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className={styles.blockCard} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className={styles.blockTitle} style={{ marginBottom: 10, fontSize: 20 }}>
          Modèle d’email — Suivre
        </div>

        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Choisissez un email préconçu, modifiez si besoin, puis cliquez sur Suivant.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {categories.map((t) => {
            const isActive = selected?.category === t.category;
            return (
              <button
                key={t.category}
                type="button"
                onClick={() => setSelectedKey(t.key)}
                className={styles.pill}
                style={{
                  opacity: isActive ? 1 : 0.8,
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.25)"
                    : "1px solid rgba(255,255,255,0.12)",
                }}
                title={t.title}
              >
                {t.title}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>Objet</div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Objet"
              className={styles.input}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ ...sectionStyle, flex: 1, minHeight: 0 }}>
            <div style={sectionHeaderStyle}>Message (texte)</div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Votre message…"
              className={styles.textarea}
              style={{ width: "100%", flex: 1, minHeight: 340, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
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
