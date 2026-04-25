import React from "react";
import styles from "../mails.module.css";
import { normalizeMailSubject } from "@/lib/mailEncoding";
import { pill } from "../_lib/mailboxPhase1";
import { normalizeEmails } from "../_lib/mailboxPhase25";
import { inputStyle, textareaStyle } from "./mailboxInlineStyles";

type MailboxComposeModalProps = {
  open: boolean;
  onClose: () => void;
  draftId: string | null;
  mailAccounts: any[];
  selectedAccountId: string;
  setSelectedAccountId: React.Dispatch<React.SetStateAction<string>>;
  selectedAccount: any | null;
  to: string;
  setTo: React.Dispatch<React.SetStateAction<string>>;
  subject: string;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
  composeRecipientList: string[];
  isBulkCampaignCompose: boolean;
  bulkCampaignNotice: { tone: "strong" | "danger" | "warning" | "info"; title: string; text: string } | null;
  crmPickerOpen: boolean;
  setCrmPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  crmSearchOpen: boolean;
  setCrmSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  crmSearchRef: React.RefObject<HTMLInputElement | null>;
  crmFilter: string;
  setCrmFilter: React.Dispatch<React.SetStateAction<string>>;
  crmCategory: any;
  setCrmCategory: React.Dispatch<React.SetStateAction<any>>;
  crmContactType: any;
  setCrmContactType: React.Dispatch<React.SetStateAction<any>>;
  crmImportantOnly: boolean;
  setCrmImportantOnly: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCrmCount: number;
  filteredContacts: any[];
  selectedToSet: Set<string>;
  crmLoading: boolean;
  crmError: string | null;
  loadCrmContacts: () => Promise<void>;
  toggleEmailInTo: (email: string) => void;
  fileInputId: string;
  attachBusy: boolean;
  composeAttachments: any[];
  setComposeAttachments: React.Dispatch<React.SetStateAction<any[]>>;
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  uploadComposeFiles: (files: File[]) => Promise<any[]>;
  signatureEnabled: boolean;
  signatureImageUrl: string;
  signatureImageWidth: number;
  saveDraft: () => Promise<void>;
  doSend: () => Promise<void>;
  sendBusy: boolean;
  toast: string | null;
  setToast: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function MailboxComposeModal(props: MailboxComposeModalProps) {
  const {
    open,
    onClose,
    draftId,
    mailAccounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    to,
    setTo,
    subject,
    setSubject,
    text,
    setText,
    composeRecipientList,
    isBulkCampaignCompose,
    bulkCampaignNotice,
    crmPickerOpen,
    setCrmPickerOpen,
    crmSearchOpen,
    setCrmSearchOpen,
    crmSearchRef,
    crmFilter,
    setCrmFilter,
    crmCategory,
    setCrmCategory,
    crmContactType,
    setCrmContactType,
    crmImportantOnly,
    setCrmImportantOnly,
    selectedCrmCount,
    filteredContacts,
    selectedToSet,
    crmLoading,
    crmError,
    loadCrmContacts,
    toggleEmailInTo,
    fileInputId,
    attachBusy,
    composeAttachments,
    setComposeAttachments,
    setFiles,
    uploadComposeFiles,
    signatureEnabled,
    signatureImageUrl,
    signatureImageWidth,
    saveDraft,
    doSend,
    sendBusy,
    toast,
    setToast,
  } = props;

  if (!open) return null;

  return (
          <div className={styles.modalOverlay} onClick={() => onClose()}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                    {draftId ? "Éditer le brouillon" : "Nouveau message"}
                  </div>
                  <span className={styles.badge} style={{ opacity: 0.9 }}>Mail</span>
                </div>

                <button className={styles.btnGhost} onClick={() => onClose()} type="button">
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Boîte d’envoi :</div>
                    <select
                      className={styles.selectDark}
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={{
                        width: "min(520px, 100%)",
                        flex: "1 1 280px",
                        minWidth: 0,
                        paddingRight: 36,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      {mailAccounts.map((a) => {
                        const needsUpdate = a.connection_status === "needs_update" || a.requires_update;
                        return (
                          <option key={a.id} value={a.id} disabled={needsUpdate} style={{ background: "#ffffff", color: "#0b1020" }}>
                            {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider}${needsUpdate ? " — à actualiser" : ""})`}
                          </option>
                        );
                      })}
                    </select>
                    {selectedAccount ? (
                      <span className={`${styles.badge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>À</span>
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="email@exemple.com, autre@exemple.com"
                      style={inputStyle}
                    />
                    {isBulkCampaignCompose ? (
                      <span style={{ fontSize: 12, color: "rgba(125,211,252,0.95)" }}>
                        {composeRecipientList.length} destinataires détectés : iNr’SEND lancera une campagne avec un envoi individuel par contact.
                      </span>
                    ) : null}
                    {bulkCampaignNotice ? (
                      <div
                        style={{
                          marginTop: 4,
                          borderRadius: 12,
                          padding: "10px 12px",
                          border: bulkCampaignNotice.tone === "strong"
                            ? "1px solid rgba(251,146,60,0.40)"
                            : bulkCampaignNotice.tone === "warning"
                              ? "1px solid rgba(250,204,21,0.34)"
                              : "1px solid rgba(56,189,248,0.26)",
                          background: bulkCampaignNotice.tone === "strong"
                            ? "rgba(251,146,60,0.12)"
                            : bulkCampaignNotice.tone === "warning"
                              ? "rgba(250,204,21,0.10)"
                              : "rgba(56,189,248,0.10)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{bulkCampaignNotice.title}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>{bulkCampaignNotice.text}</div>
                      </div>
                    ) : null}
                  </label>

                  {/* CRM picker (dropdown + checkboxes) */}
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setCrmPickerOpen((v) => !v)}
                      style={{
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>Contacts CRM</span>
                        <span className={styles.badge} style={{ opacity: 0.9 }}>
                          {selectedCrmCount} sélectionné{selectedCrmCount > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85 }}>{crmPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {crmPickerOpen ? (
                      <div
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(0,0,0,0.16)",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                          
                          <div className={styles.crmFilterRow}>
                            <select
                              value={crmCategory ?? "all"}
                              onChange={(e) => setCrmCategory(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par catégorie"
                            >
                              <option value="all">Catégories</option>
                              <option value="particulier">Particuliers</option>
                              <option value="professionnel">Professionnels</option>
                              <option value="collectivite_publique">Collectivités</option>
                            </select>

                            <select
                              value={crmContactType ?? "all"}
                              onChange={(e) => setCrmContactType(e.target.value as any)}
                              className={styles.crmSelect}
                              title="Filtrer par type"
                            >
                              <option value="all">Types</option>
                              <option value="client">Clients</option>
                              <option value="prospect">Prospects</option>
                              <option value="fournisseur">Fournisseurs</option>
                              <option value="partenaire">Partenaires</option>
                              <option value="autre">Autres</option>
                            </select>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn}`}
                              onClick={() => {
                                setCrmSearchOpen((v) => !v);
                                // focus next tick (after render)
                                setTimeout(() => crmSearchRef.current?.focus(), 0);
                              }}
                              title="Rechercher"
                              aria-label="Rechercher"
                            >
                              <span className={styles.iconWrap}>
                                🔎
                                {!crmSearchOpen && crmFilter.trim() ? <span className={styles.searchDot} /> : null}
                              </span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.crmIconBtn} ${styles.starToggleBtn} ${
                                crmImportantOnly ? styles.starActive : styles.starInactive
                              }`}
                              onClick={() => setCrmImportantOnly((v) => !v)}
                              title={crmImportantOnly ? "Important uniquement" : "Tous les contacts"}
                              aria-label="Important"
                            >
                              {crmImportantOnly ? "★" : "☆"}
                            </button>
                          </div>

                          {crmSearchOpen ? (
                            <div className={styles.crmSearchRow}>
                              <input
                                ref={crmSearchRef}
                                value={crmFilter}
                                onChange={(e) => setCrmFilter(e.target.value)}
                                placeholder="Rechercher…"
                                className={styles.crmSearchInput}
                              />
                              {crmFilter.trim() ? (
                                <button
                                  type="button"
                                  className={styles.searchClearBtn}
                                  onClick={() => {
                                    setCrmFilter("");
                                    setTimeout(() => crmSearchRef.current?.focus(), 0);
                                  }}
                                  aria-label="Effacer la recherche"
                                  title="Effacer"
                                >
                                  ×
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={() => setCrmSearchOpen(false)}
                                style={{ padding: "8px 10px" }}
                                aria-label="Fermer la recherche"
                                title="Fermer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : null}

                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const current = normalizeEmails(to);
                              const setLower = new Set(current.map((e) => e.toLowerCase()));
                              const add = filteredContacts
                                .map((c) => c.email)
                                .filter(Boolean)
                                .map((e) => String(e));
                              const next = [...current];
                              for (const e of add) {
                                if (!setLower.has(e.toLowerCase())) {
                                  next.push(e);
                                  setLower.add(e.toLowerCase());
                                }
                              }
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const removeSet = new Set(
                                filteredContacts
                                  .map((c) => c.email)
                                  .filter(Boolean)
                                  .map((e) => String(e).toLowerCase())
                              );
                              const current = normalizeEmails(to);
                              const next = current.filter((e) => !removeSet.has(e.toLowerCase()));
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout désélectionner
                          </button>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""} (filtrés)
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 12,
                            padding: 8,
                            maxHeight: 190,
                            overflow: "auto",
                          }}
                        >
                          {crmLoading ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Chargement des contacts…</div>
                          ) : crmError ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{crmError}</div>
                              <button
                                className={styles.btnPrimary}
                                type="button"
                                onClick={() => void loadCrmContacts()}
                                style={{ width: "fit-content" }}
                              >
                                Réessayer
                              </button>
                            </div>
                          ) : filteredContacts.length === 0 ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Aucun contact.</div>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {filteredContacts.slice(0, 200).map((c) => {
                                const email = c.email ? String(c.email) : "";
                                const checked = email ? selectedToSet.has(email.toLowerCase()) : false;
                                return (
                                  <label
                                    key={c.id}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "center",
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: checked ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.10)",
                                      cursor: email ? "pointer" : "not-allowed",
                                      opacity: email ? 1 : 0.6,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!email}
                                      checked={checked}
                                      onChange={() => {
                                        if (!email) return;
                                        toggleEmailInTo(email);
                                      }}
                                    />
                                    <div style={{ display: "grid", lineHeight: 1.15 }}>
                                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>
                                        {c.full_name || "(Sans nom)"}
                                        {c.important ? <span style={{ marginLeft: 8, opacity: 0.75 }}>★</span> : null}
                                      </div>
                                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>{email}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Objet</span>
                    <input value={subject} onChange={(e) => setSubject(normalizeMailSubject(e.target.value))} placeholder="Objet" style={inputStyle} />
                    {!subject.trim() ? (
                      <span style={{ fontSize: 12, color: "rgba(251,191,36,0.92)" }}>Le message partira avec “(sans objet)” si tu laisses ce champ vide.</span>
                    ) : null}
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Message (texte)</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={textareaStyle} />
                    {signatureEnabled && signatureImageUrl ? (
                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.04)",
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)", marginBottom: 8 }}>
                          Image de signature ajoutée automatiquement au mail :
                        </div>
                        <img
                          src={signatureImageUrl}
                          alt="Signature automatique"
                          style={{ width: `${signatureImageWidth}px`, maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, display: "block" }}
                        />
                      </div>
                    ) : null}
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Pièces jointes</span>
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        const next = Array.from<File>(input.files || []);
                        setFiles(next);
                        if (!next.length) return;
                        try {
                          const uploaded = await uploadComposeFiles(next);
                          setComposeAttachments((prev) => {
                            const merged = [...prev];
                            for (const item of uploaded) {
                              const exists = merged.some((x) => x.bucket === item.bucket && x.path === item.path);
                              if (!exists) merged.push(item);
                            }
                            return merged;
                          });
                        } catch (err) {
                          console.error("Attachment upload failed", err);
                          setToast("Impossible de préparer cette pièce jointe. Veuillez vérifier son format ou sa taille.");
                        } finally {
                          input.value = "";
                          setFiles([]);
                        }
                      }}
                      className={styles.hiddenFileInput}
                    />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label htmlFor={fileInputId} className={styles.btnAttach}>
                        📎 Joindre
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                        {composeAttachments.length > 0 ? `${composeAttachments.length} fichier(s)` : attachBusy ? "Préparation des fichiers..." : "Aucun fichier"}
                      </span>
                    </div>

                    {composeAttachments.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {composeAttachments.map((f, idx) => (
                          <span key={`${f.bucket}:${f.path}:${idx}`} className={styles.fileChip} title={f.name}>
                            {f.name}
                            <button
                              type="button"
                              className={styles.fileChipRemove}
                              onClick={() => setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label={`Retirer ${f.name}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} onClick={saveDraft} type="button" disabled={sendBusy}>
                  💾 Sauvegarder brouillon
                </button>
                <button className={styles.btnPrimary} onClick={doSend} type="button" disabled={sendBusy}>
                  {sendBusy ? "Envoi…" : "Envoyer"}
                </button>
              </div>

              {toast ? (
                <div style={{ padding: "10px 14px", color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  {toast}{" "}
                  <button className={styles.btnGhost} onClick={() => setToast(null)} type="button">
                    OK
                  </button>
                </div>
              ) : null}
            </div>
          </div>
  );
}
