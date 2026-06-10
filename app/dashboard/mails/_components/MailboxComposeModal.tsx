import React from "react";
import styles from "../mails.module.css";
import { normalizeMailSubject, normalizeMailSubjectDraft } from "@/lib/mailEncoding";
import { pill } from "../_lib/mailboxPhase1";
import { normalizeEmails } from "../_lib/mailboxPhase25";
import { inputStyle, textareaStyle } from "./mailboxInlineStyles";
import RichMailEditor from "@/app/dashboard/_components/RichMailEditor";
import { confirmInrcy } from "@/lib/inrcyDialog";
import { extractTemplatePlaceholders, textToRichMailHtml } from "@/lib/mailRichText";
import { useUnsavedExitGuard } from "@/app/dashboard/_hooks/useUnsavedExitGuard";
import TemplateSubjectInlineEditor from "@/app/dashboard/_components/TemplateSubjectInlineEditor";

type MailboxComposeModalProps = {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenAiConfiguration: () => void;
  draftId: string | null;
  currentComposeSnapshot: string;
  lastSavedComposeSnapshot: string | null;
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
  html: string;
  setHtml: React.Dispatch<React.SetStateAction<string>>;
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
  crmDepartment: string;
  setCrmDepartment: React.Dispatch<React.SetStateAction<string>>;
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
  signaturePreview: string;
  signatureImageUrl: string;
  signatureImageWidth: number;
  saveDraft: () => Promise<void>;
  doSend: () => Promise<void>;
  sendBusy: boolean;
  toast: string | null;
  setToast: React.Dispatch<React.SetStateAction<string | null>>;
};


const MAIL_WRITING_TYPE_OPTIONS = [
  { value: "auto", label: "Automatique" },
  { value: "presentation", label: "Présentation" },
  { value: "prospection", label: "Prospection" },
  { value: "relance", label: "Relance" },
  { value: "thanks", label: "Remerciement" },
  { value: "info", label: "Information" },
  { value: "offer", label: "Offre commerciale" },
  { value: "reply", label: "Réponse client" },
  { value: "meeting", label: "Invitation / RDV" },
] as const;

type MailWritingType = (typeof MAIL_WRITING_TYPE_OPTIONS)[number]["value"];

export default function MailboxComposeModal(props: MailboxComposeModalProps) {
  const {
    open,
    onClose,
    onOpenSettings,
    onOpenAiConfiguration,
    draftId,
    currentComposeSnapshot,
    lastSavedComposeSnapshot,
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
    html,
    setHtml,
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
    crmDepartment,
    setCrmDepartment,
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
    signaturePreview,
    signatureImageUrl,
    signatureImageWidth,
    saveDraft,
    doSend,
    sendBusy,
    toast,
    setToast,
  } = props;

  const hasComposeWork = React.useMemo(() => {
    return Boolean(
      to.trim() ||
      subject.trim() ||
      text.trim() ||
      html.trim() ||
      selectedCrmCount > 0 ||
      composeAttachments.length > 0
    );
  }, [composeAttachments.length, html, selectedCrmCount, subject, text, to]);

  const hasUnsavedComposeChanges = React.useMemo(() => {
    if (!hasComposeWork) return false;
    return currentComposeSnapshot !== lastSavedComposeSnapshot;
  }, [currentComposeSnapshot, hasComposeWork, lastSavedComposeSnapshot]);

  const requestClose = React.useCallback(async () => {
    if (!hasUnsavedComposeChanges) {
      onClose();
      return;
    }

    const confirmed = await confirmInrcy({
      title: "Fermer le message ?",
      message: "Vous avez un message en cours. Voulez-vous vraiment fermer cette fenêtre sans l’envoyer ni sauvegarder le brouillon ?",
      confirmLabel: "Fermer sans sauvegarder",
      cancelLabel: "Continuer l’édition",
      variant: "warning",
    });

    if (confirmed) onClose();
  }, [hasUnsavedComposeChanges, onClose]);

  useUnsavedExitGuard({
    active: open,
    shouldBlock: hasUnsavedComposeChanges,
    onConfirmExit: onClose,
    title: "Fermer le message ?",
    message: "Vous avez un message en cours. Voulez-vous vraiment fermer cette fenêtre sans l’envoyer ni sauvegarder le brouillon ?",
    confirmLabel: "Fermer sans sauvegarder",
    cancelLabel: "Continuer l’édition",
    variant: "warning",
  });

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const [crmFiltersOpen, setCrmFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    if (!crmPickerOpen) setCrmFiltersOpen(false);
  }, [crmPickerOpen]);

  const activeCrmFiltersCount = React.useMemo(() => {
    let count = 0;
    if ((crmCategory ?? "all") !== "all") count += 1;
    if ((crmContactType ?? "all") !== "all") count += 1;
    if (crmDepartment.trim()) count += 1;
    if (crmImportantOnly) count += 1;
    return count;
  }, [crmCategory, crmContactType, crmDepartment, crmImportantOnly]);

  const requestSend = React.useCallback(async () => {
    const placeholders = extractTemplatePlaceholders(`${subject}\n${text}`);
    if (placeholders.length > 0) {
      const preview = placeholders.slice(0, 6).join(", ");
      const more = placeholders.length > 6 ? ` et ${placeholders.length - 6} autre(s)` : "";
      const confirmed = await confirmInrcy({
        title: "Éléments à compléter",
        message: `Votre message contient encore des éléments entre crochets : ${preview}${more}. Voulez-vous quand même l’envoyer ?`,
        confirmLabel: "Envoyer quand même",
        cancelLabel: "Corriger le message",
        variant: "warning",
      });
      if (!confirmed) return;
    }
    await doSend();
  }, [doSend, subject, text]);

  const [isMobileViewport, setIsMobileViewport] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  const [aiGenerating, setAiGenerating] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [mailWritingType, setMailWritingType] = React.useState<MailWritingType>("auto");

  const generateMailWithAi = React.useCallback(async () => {
    const mailSubject = normalizeMailSubject(subject).trim();
    if (!mailSubject) {
      setAiError("Renseignez d’abord un objet pour générer votre mail avec iNrCy.");
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setToast(null);

    try {
      const response = await fetch("/api/mails/generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: mailSubject, body: text, writingType: mailWritingType }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || "La génération IA a échoué."));
      const nextText = String(payload?.body_text || "").trim();
      if (!nextText) throw new Error("iNrCy n’a pas retourné de message exploitable.");
      setText(nextText);
      setHtml(textToRichMailHtml(nextText));
      setToast("Message généré avec iNrCy.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "La génération IA a échoué.");
    } finally {
      setAiGenerating(false);
    }
  }, [mailWritingType, setHtml, setText, setToast, subject, text]);

  if (!open) return null;

  const composeInputStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 46,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(7,10,24,0.62)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    fontSize: 15,
  };

  const composeEditorStyle: React.CSSProperties = {
    ...textareaStyle,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(7,10,24,0.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    padding: "14px 14px",
  };


  const handleAttachmentInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  return (
          <div className={styles.modalOverlay} onClick={(e) => e.stopPropagation()}>
            <div className={`${styles.modalCard} ${styles.composeModalCard}`} onClick={(e) => e.stopPropagation()}>
              <div className={`${styles.modalHeader} ${styles.composeModalHeader}`}>
                <div className={styles.composeHeaderTitleWrap}>
                  <div className={styles.composeTitleRow}>
                    <div className={styles.composeTitleIcon}>✉️</div>
                    <div className={styles.composeTitleText}>
                      {draftId ? "Éditer le brouillon" : "Nouveau message"}
                    </div>
                    <span className={`${styles.badge} ${styles.composeTypeBadge}`}>Mail</span>
                  </div>
                  <div className={styles.composeSubtitle}>Préparez un message clair, choisissez vos contacts CRM et envoyez depuis votre boîte connectée.</div>
                </div>

                <div className={styles.composeHeaderActions}>
                  <button
                    className={`${styles.btnGhost} ${styles.composeHeaderIconBtn}`}
                    onClick={() => void saveDraft()}
                    type="button"
                    aria-label="Sauvegarder le brouillon"
                    title="Sauvegarder le brouillon"
                    disabled={sendBusy || attachBusy}
                  >
                    {attachBusy ? "…" : "💾"}
                  </button>
                  <button
                    className={`${styles.btnGhost} ${styles.composeHeaderIconBtn} ${styles.aiHeaderBtn}`}
                    onClick={onOpenAiConfiguration}
                    type="button"
                    aria-label="Configuration IA"
                    title="Configuration IA"
                  >
                    IA
                  </button>
                  <button
                    className={`${styles.btnGhost} ${styles.composeHeaderIconBtn}`}
                    onClick={onOpenSettings}
                    type="button"
                    aria-label="Ouvrir les réglages iNr’Send"
                    title="Réglages Mails"
                  >
                    ⚙️
                  </button>
                  <button className={`${styles.btnGhost} ${styles.composeCloseBtn}`} onClick={() => void requestClose()} type="button" aria-label="Fermer" title="Fermer">
                    ✕
                  </button>
                </div>
              </div>

              <div className={`${styles.modalBody} ${styles.composeModalBody}`}>
                <div className={styles.composeFormStack}>
                  <section className={styles.composeSection}>
                    <div className={styles.composeSectionHeader}>
                      <div>
                        <div className={styles.composeSectionTitle}><span className={styles.composeSectionIcon}>➜</span>Boîte d’envoi</div>
                        <div className={styles.composeSectionHint}>Compte utilisé pour envoyer le message.</div>
                      </div>
                      {selectedAccount ? (
                        <span className={`${styles.badge} ${styles.composeProviderBadge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                      ) : null}
                    </div>

                    <select
                      className={`${styles.selectDark} ${styles.composeSelect}`}
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={composeInputStyle}
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
                  </section>

                  <section className={styles.composeSection}>
                    <div className={styles.composeSectionHeader}>
                      <div>
                        <div className={styles.composeSectionTitle}><span className={styles.composeSectionIcon}>👥</span>Destinataires</div>
                        <div className={styles.composeSectionHint}>Saisissez une adresse ou sélectionnez des contacts CRM. Séparez les adresses mails par un ";" pour ajouter plusieurs destinataires.</div>
                      </div>
                      {selectedCrmCount > 0 ? (
                        <span className={`${styles.badge} ${styles.composeCountBadge}`}>{selectedCrmCount} sélectionné{selectedCrmCount > 1 ? "s" : ""}</span>
                      ) : null}
                    </div>
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="email@exemple.com; autre@exemple.com"
                      style={composeInputStyle}
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
                        <span className={`${styles.badge} ${styles.crmPickerCountBadge}`}>
                          {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85 }}>{crmPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {crmPickerOpen ? (
                      <div className={styles.crmPickerPanel}>
                        <div className={styles.crmCompactToolbar}>
                          <div className={styles.crmSearchBox}>
                            <span className={styles.crmSearchPrefix} aria-hidden>🔎</span>
                            <input
                              ref={crmSearchRef}
                              value={crmFilter}
                              onChange={(e) => setCrmFilter(e.target.value)}
                              onFocus={() => setCrmSearchOpen(true)}
                              placeholder="Rechercher un contact…"
                              className={styles.crmSearchInlineInput}
                            />
                            {crmFilter.trim() ? (
                              <button
                                type="button"
                                className={styles.crmSearchClearInline}
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
                          </div>

                          <button
                            type="button"
                            className={`${styles.btnGhost} ${styles.crmToolbarBtn} ${activeCrmFiltersCount > 0 ? styles.crmToolbarBtnActive : ""}`}
                            onClick={() => setCrmFiltersOpen((v) => !v)}
                            aria-expanded={crmFiltersOpen}
                            title="Afficher les filtres"
                          >
                            <span aria-hidden>⚙️</span>
                            <span>Filtres{activeCrmFiltersCount > 0 ? ` (${activeCrmFiltersCount})` : ""}</span>
                          </button>

                          <button
                            type="button"
                            className={`${styles.btnGhost} ${styles.crmToolbarBtn}`}
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
                            title="Sélectionner tous les contacts affichés"
                          >
                            Tout
                          </button>

                          <button
                            type="button"
                            className={`${styles.btnGhost} ${styles.crmToolbarBtn}`}
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
                            title="Désélectionner tous les contacts affichés"
                          >
                            Aucun
                          </button>

                          <div className={styles.crmToolbarCount}>
                            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""}
                          </div>
                        </div>

                        {crmFiltersOpen ? (
                          <div className={styles.crmFiltersPanel}>
                            <label className={styles.crmFilterField}>
                              <span>Catégorie</span>
                              <select
                                value={crmCategory ?? "all"}
                                onChange={(e) => setCrmCategory(e.target.value as any)}
                                className={styles.crmSelect}
                              >
                                <option value="all">Toutes</option>
                                <option value="particulier">Particuliers</option>
                                <option value="professionnel">Professionnels</option>
                                <option value="collectivite_publique">Collectivités</option>
                              </select>
                            </label>

                            <label className={styles.crmFilterField}>
                              <span>Type</span>
                              <select
                                value={crmContactType ?? "all"}
                                onChange={(e) => setCrmContactType(e.target.value as any)}
                                className={styles.crmSelect}
                              >
                                <option value="all">Tous</option>
                                <option value="client">Clients</option>
                                <option value="prospect">Prospects</option>
                                <option value="fournisseur">Fournisseurs</option>
                                <option value="partenaire">Partenaires</option>
                                <option value="autre">Autres</option>
                              </select>
                            </label>

                            <label className={styles.crmFilterField}>
                              <span>Département</span>
                              <input
                                value={crmDepartment}
                                onChange={(e) => setCrmDepartment(e.target.value)}
                                className={styles.crmInput}
                                inputMode="text"
                                maxLength={3}
                                placeholder="62"
                                aria-label="Filtrer par département"
                              />
                            </label>

                            <button
                              type="button"
                              className={`${styles.crmImportantToggle} ${crmImportantOnly ? styles.crmImportantToggleActive : ""}`}
                              onClick={() => setCrmImportantOnly((v) => !v)}
                              aria-pressed={crmImportantOnly}
                            >
                              <span aria-hidden>{crmImportantOnly ? "★" : "☆"}</span>
                              <span>Important uniquement</span>
                            </button>
                          </div>
                        ) : null}

                        <div className={styles.crmContactsList}>
                          {crmLoading ? (
                            <div className={styles.crmStateText}>Chargement des contacts…</div>
                          ) : crmError ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div className={styles.crmStateText}>{crmError}</div>
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
                            <div className={styles.crmStateText}>Aucun contact.</div>
                          ) : (
                            <div className={styles.crmContactsGrid}>
                              {filteredContacts.slice(0, 200).map((c) => {
                                const email = c.email ? String(c.email) : "";
                                const checked = email ? selectedToSet.has(email.toLowerCase()) : false;
                                return (
                                  <label
                                    key={c.id}
                                    className={`${styles.crmContactRow} ${checked ? styles.crmContactRowChecked : ""}`}
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
                                    <div className={styles.crmContactText}>
                                      <div className={styles.crmContactName}>
                                        {c.full_name || "(Sans nom)"}
                                        {c.important ? <span className={styles.crmImportantMark}>★</span> : null}
                                      </div>
                                      <div className={styles.crmContactEmail}>{email}</div>
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
                  </section>

                  <section className={`${styles.composeSection} ${styles.composeSubjectSection}`}>
                    <div className={`${styles.composeSectionHeader} ${styles.composeSubjectHeader}`}>
                      <div className={styles.composeSubjectHeaderGrid}>
                        <div className={styles.composeSubjectHeaderMain}>
                          <div className={styles.composeSectionTitle}><span className={styles.composeSectionIcon}>🏷️</span>Objet</div>
                          <div className={styles.composeSectionHint}>Titre visible dans la boîte mail du destinataire.</div>
                        </div>
                        <div className={styles.composeWritingTypeLabel}>Typologie</div>
                        <div aria-hidden="true" />
                      </div>
                    </div>
                    <div className={styles.composeSubjectInlineAiRow}>
                      <div className={styles.composeSubjectInputStack}>
                        {isMobileViewport ? (
                          <TemplateSubjectInlineEditor
                            value={subject}
                            onChange={(next) => setSubject(normalizeMailSubjectDraft(next))}
                            placeholder="Ex : Relance devis, présentation de nos services..."
                          />
                        ) : (
                          <input
                            value={subject}
                            onChange={(e) => setSubject(normalizeMailSubjectDraft(e.target.value))}
                            onBlur={(e) => setSubject(normalizeMailSubject(e.target.value))}
                            placeholder="Ex : Relance devis, présentation de nos services..."
                            style={composeInputStyle}
                          />
                        )}
                        {!subject.trim() ? (
                          <span className={styles.composeWarning}>Le message partira avec “(sans objet)” si vous laissez ce champ vide.</span>
                        ) : null}
                      </div>
                      <div className={styles.composeWritingTypeStack}>
                        <select
                          aria-label="Typologie du mail"
                          className={styles.composeWritingTypeSelect}
                          value={mailWritingType}
                          onChange={(e) => setMailWritingType(e.target.value as MailWritingType)}
                        >
                          {MAIL_WRITING_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.composeSubjectAiInline}>
                        <button
                          type="button"
                          className={`${styles.btnGhost} ${styles.aiGenerateBtn}`}
                          onClick={() => void generateMailWithAi()}
                          disabled={aiGenerating || !subject.trim()}
                          title={!subject.trim() ? "Renseignez d’abord un objet pour générer votre mail." : "Générer le message avec iNrCy"}
                        >
                          {aiGenerating ? "Génération…" : "✨ Générer avec iNrCy"}
                        </button>
                        {aiError ? <span className={styles.composeAiError}>{aiError}</span> : null}
                      </div>
                    </div>
                  </section>

                  <section className={`${styles.composeSection} ${styles.composeMessageSection}`}>
                    <RichMailEditor
                      text={text}
                      html={html}
                      onChange={({ text: nextText, html: nextHtml }) => {
                        setText(nextText);
                        setHtml(nextHtml);
                      }}
                      placeholder="Votre message…"
                      toolbarTitle={
                        <div>
                          <div className={styles.composeSectionTitle}><span className={styles.composeSectionIcon}>✍️</span>Message</div>
                          <div className={styles.composeSectionHint}>Ajoutez la touche finale avant l’envoi.</div>
                        </div>
                      }
                      compactToolbar
                      minHeight={"clamp(260px, 38vh, 430px)"}
                      editorStyle={composeEditorStyle}
                    />
                    <div className={styles.composeSignaturePreview}>
                      <div className={styles.composeSignaturePreviewHeader}>
                        <div>
                          <div className={styles.composeSignaturePreviewTitle}><span className={styles.composeSectionIcon}>✅</span>Signature automatique</div>
                          <div className={styles.composeSignaturePreviewHint}>Elle sera ajoutée automatiquement en bas du mail à l’envoi.</div>
                        </div>
                        <div className={styles.composeSignatureActions}>
                          <span className={`${styles.badge} ${signatureEnabled ? styles.composeSignatureOn : styles.composeSignatureOff}`}>
                            {signatureEnabled ? "Activée" : "Désactivée"}
                          </span>
                        </div>
                      </div>

                      {signatureEnabled ? (
                        <div className={styles.composeSignaturePreviewBox}>
                          <pre className={styles.composeSignaturePreviewText}>{signaturePreview?.trim() || "Aperçu indisponible pour le moment."}</pre>
                          {signatureImageUrl ? (
                            <div className={styles.composeSignatureImageWrap}>
                              <img
                                src={signatureImageUrl}
                                alt="Signature automatique"
                                style={{ width: `${signatureImageWidth}px`, maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, display: "block" }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className={styles.composeSignaturePreviewEmpty}>Aucune signature ne sera ajoutée à cet envoi.</div>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              <input
                id={fileInputId}
                type="file"
                multiple
                onChange={handleAttachmentInputChange}
                className={styles.hiddenFileInput}
              />

              <div className={`${styles.modalFooter} ${styles.composeModalFooter}`}>
                <div className={styles.composeAttachmentDock}>
                  <label htmlFor={fileInputId} className={styles.btnAttach} aria-disabled={attachBusy}>
                    <span aria-hidden>📎</span>
                    <span>Joindre</span>
                  </label>
                  <span className={styles.composeAttachmentStatus}>
                    {composeAttachments.length > 0 ? `${composeAttachments.length} fichier${composeAttachments.length > 1 ? "s" : ""}` : attachBusy ? "Préparation…" : "Aucun fichier"}
                  </span>
                  {composeAttachments.length > 0 ? (
                    <div className={styles.composeAttachmentChips} aria-label="Pièces jointes ajoutées">
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
                </div>

                <div className={styles.composeFooterActions}>
                  <button className={`${styles.btnPrimary} ${styles.composeSendBtn}`} onClick={() => void requestSend()} type="button" disabled={sendBusy || attachBusy}>
                    {attachBusy ? "Préparation…" : sendBusy ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </div>

              {toast ? (
                <div className={styles.composeToast}>
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
