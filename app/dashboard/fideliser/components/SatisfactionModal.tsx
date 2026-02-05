import { useEffect, useMemo, useState } from "react";
import stylesDash from "../../dashboard/dashboard.module.css";

export default function SatisfactionModal({ styles, onClose, trackEvent }: { styles: typeof stylesDash; onClose: () => void; trackEvent: (type: "satisfaction_mail", payload: Record<string, any>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"survey" | "review">("survey");

  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [isOpen, setIsOpen] = useState(false);

useEffect(() => {
  fetch("/api/crm/contacts")
    .then((r) => r.json())
    .then((d) => setContacts(d.contacts ?? []))
    .catch(() => setContacts([]));
}, []);

  const recipients = selectedIds.length;

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return contacts;
    return contacts.filter((c) => {
      const name = `${c.company_name ?? ""} ${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""}`.toLowerCase();
      return name.includes(qq);
    });
  }, [contacts, q]);

  const selectAll = () => {
    const ids = filtered.map((c) => String(c.id)).filter(Boolean);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearAll = () => setSelectedIds([]);
  const onSend = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await trackEvent("satisfaction_mail", { recipients, kind });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Contacts (CRM iNrCy)
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Choisissez les destinataires.
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          style={dropdownBtn}
          aria-expanded={isOpen}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>Sélectionner des contacts</div>
            <div className={styles.subtitle} style={{ opacity: 0.85 }}>
              ({recipients} sélectionné{recipients > 1 ? "s" : ""})
            </div>
          </div>
          <div style={{ opacity: 0.75 }}>{isOpen ? "▲" : "▼"}</div>
        </button>

        {isOpen && (
          <div style={dropdownPanel}>
            <div style={dropdownTop}>
              <button type="button" className={styles.secondaryBtn} onClick={selectAll}>
                Tout sélectionner
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={clearAll}>
                Tout désélectionner
              </button>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher..."
                style={searchInput}
              />
            </div>

            <div style={contactBox}>
              {filtered.length === 0 ? (
                <div className={styles.subtitle} style={{ opacity: 0.8 }}>
                  Aucun contact.
                </div>
              ) : (
                filtered.slice(0, 200).map((c) => {
                  const id = String(c.id);
                  const label = c.company_name
                    ? `${c.company_name} — ${(c.first_name ?? "")} ${(c.last_name ?? "")}`.trim()
                    : `${(c.first_name ?? "")} ${(c.last_name ?? "")}`.trim();

                  return (
                    <label key={id} style={contactRow}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={(e) => {
                          setSelectedIds((prev) =>
                            e.target.checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                          );
                        }}
                      />
                      <div style={{ display: "grid" }}>
                        <div style={{ fontWeight: 600 }}>{label || "Contact"}</div>
                        <div style={{ opacity: 0.8, fontSize: 12 }}>{c.email || c.phone || ""}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Modèle d’email
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Choisissez un email préconçu.
        </div>

                <div style={{ display: "grid", gap: 10, marginBottom: 10 }}>
          <div className={styles.subtitle} style={{ opacity: 0.9 }}>Type d'envoi</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setKind("survey")} style={{ opacity: kind === "survey" ? 1 : 0.7 }}>
              Enquête satisfaction
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => setKind("review")} style={{ opacity: kind === "review" ? 1 : 0.7 }}>
              Demande d’avis
            </button>
          </div>
        </div>
        <div style={fakeSelect}>Choisir un modèle d’email</div>
      </div>

      <div className={styles.blockCard}>
        <div className={styles.blockTitle} style={{ marginBottom: 8 }}>
          Détails de l’offre
        </div>
        <div className={styles.subtitle} style={{ marginBottom: 10 }}>
          Décrivez la promo en 1 phrase.
        </div>

        <textarea
          placeholder="Ex : -10% sur l’entretien chaudière jusqu’au 15/02"
          style={textAreaStyle}
        />

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className={styles.secondaryBtn}>
            Aperçu
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onSend} disabled={saving}>
            {saving ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const fakeSelect: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px dashed rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.03)",
  padding: "12px 12px",
  opacity: 0.9,
};

const textAreaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 130,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "12px 12px",
  outline: "none",
};

const dropdownBtn: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "12px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
};

const dropdownPanel: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  padding: "10px 10px",
};

const dropdownTop: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "10px 12px",
  outline: "none",
};

const contactBox: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
  padding: "10px 10px",
  maxHeight: 220,
  overflow: "auto",
};

const contactRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "18px 1fr",
  gap: 10,
  alignItems: "center",
  padding: "10px 8px",
  borderRadius: 12,
};