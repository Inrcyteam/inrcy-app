import React from "react";
import { useRouter } from "next/navigation";
import styles from "../mails.module.css";
import { ChannelImageRetouchCardsPanel } from "@/app/dashboard/_components/ChannelImageRetouchTool";
import {
  MAILBOX_RECIPIENTS_PAGE_SIZE,
  type CampaignRecipientsFilterId,
  type PublicationEditForm,
  campaignCounts,
  canDeleteHistoryItem,
  extractAttachmentsFromPayload,
  extractChannelPublications,
  extractPublicationParts,
  firstNonEmpty,
  folderLabel,
  formatCampaignFilterLabel,
  formatCampaignProgress,
  formatChannelLabel,
  formatOutboxStatusLabel,
  getCampaignRecipientStatusLabel,
  getChannelIndicatorMeta,
  getFailedChannelMessage,
  getPublicationBackgroundMode,
  isDeletedChannelResult,
  isFailedChannelResult,
  isImageAttachment,
  isRetryableCampaignItem,
  isVideoAttachment,
  orderChannelKeys,
  pill,
  splitList,
} from "../_lib/mailboxPhase1";
import { pillBtn, pillBtnActive } from "./mailboxInlineStyles";

type MailboxDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  detailsItem: any | null;
  detailsAccountLabel: string | null;
  detailsChannelKey: string | null;
  setDetailsChannelKey: React.Dispatch<React.SetStateAction<string | null>>;
  detailsEditMode: boolean;
  setDetailsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  detailsActionBusy: boolean;
  detailsActionError: string | null;
  detailsActionSuccess: string | null;
  setDetailsActionError: React.Dispatch<React.SetStateAction<string | null>>;
  setDetailsActionSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  detailsSourceDocPayload: any | null;
  deletingHistoryItemId: string | null;
  deletingHistorySelection: boolean;
  campaignRecipients: any[];
  campaignRecipientsLoading: boolean;
  campaignRecipientsPage: number;
  setCampaignRecipientsPage: React.Dispatch<React.SetStateAction<number>>;
  campaignRecipientsPageCount: number;
  campaignRecipientsTotal: number;
  campaignRecipientsFilter: CampaignRecipientsFilterId;
  setCampaignRecipientsFilter: React.Dispatch<React.SetStateAction<CampaignRecipientsFilterId>>;
  campaignHealth: any | null;
  campaignHealthLoading: boolean;
  campaignActionBusyId: string | null;
  publicationEditForm: PublicationEditForm;
  setPublicationEditForm: React.Dispatch<React.SetStateAction<PublicationEditForm>>;
  publicationEditFileInputId: string;
  activePublicationEditChannelKey: string;
  activePublicationEditPreset: any;
  activePublicationEditAssets: any[];
  togglePublicationImage: (channel: string, imageKey: string) => void;
  openPublicationRetouch: (channel: string, imageKey: string) => void;
  removePublicationImage: (channel: string, imageKey: string) => void;
  addPublicationFiles: (fileList: FileList | null) => void;
  saveChannelPublication: () => Promise<void>;
  deleteChannelPublication: () => Promise<void>;
  retryCampaignFailedRecipients: (campaignId: string) => Promise<void>;
  openCampaignComposeFromHistory: (item: any, mode: "reuse" | "resend") => Promise<void>;
  deleteHistoryEntry: (item: any) => Promise<void>;
  loadCampaignRecipients: (campaignId: string, targetPage?: number, targetFilter?: CampaignRecipientsFilterId) => Promise<void>;
  loadCampaignHealth: (campaignId: string, raw?: any) => Promise<void>;
};

export default function MailboxDetailsModal(props: MailboxDetailsModalProps) {
  const {
    open,
    onClose,
    detailsItem,
    detailsAccountLabel,
    detailsChannelKey,
    setDetailsChannelKey,
    detailsEditMode,
    setDetailsEditMode,
    detailsActionBusy,
    detailsActionError,
    detailsActionSuccess,
    setDetailsActionError,
    setDetailsActionSuccess,
    detailsSourceDocPayload,
    deletingHistoryItemId,
    deletingHistorySelection,
    campaignRecipients,
    campaignRecipientsLoading,
    campaignRecipientsPage,
    setCampaignRecipientsPage,
    campaignRecipientsPageCount,
    campaignRecipientsTotal,
    campaignRecipientsFilter,
    setCampaignRecipientsFilter,
    campaignHealth,
    campaignHealthLoading,
    campaignActionBusyId,
    publicationEditForm,
    setPublicationEditForm,
    publicationEditFileInputId,
    activePublicationEditChannelKey,
    activePublicationEditPreset,
    activePublicationEditAssets,
    togglePublicationImage,
    openPublicationRetouch,
    removePublicationImage,
    addPublicationFiles,
    saveChannelPublication,
    deleteChannelPublication,
    retryCampaignFailedRecipients,
    openCampaignComposeFromHistory,
    deleteHistoryEntry,
    loadCampaignRecipients,
    loadCampaignHealth,
  } = props;
  const router = useRouter();

  if (!open) return null;

  return (
          <div className={styles.modalOverlay} onClick={() => onClose()}>
            <div className={`${styles.modalCard} ${styles.detailsModalCard}`} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div className={styles.modalTitle}>Détails</div>
                  {detailsItem ? (
                    <>
                      <span className={`${styles.badge} ${pill(detailsItem.provider).cls}`}>{pill(detailsItem.provider).label}</span>
                      {detailsItem.source !== "app_events" && detailsAccountLabel ? (
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>• {detailsAccountLabel}</span>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Trash removed intentionally */}
                  <button className={styles.btnGhost} onClick={() => onClose()} type="button">
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.modalBody}>
                {!detailsItem ? (
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
                ) : (() => {
                  const payload = detailsItem.source === "app_events" ? ((detailsItem as any)?.raw?.payload || null) : null;
                  const channelPublications = detailsItem.source === "app_events" ? extractChannelPublications(payload) : [];
                  const defaultParts = detailsItem.source === "app_events" ? extractPublicationParts(payload) : {};
                  const publicationChannelEntries = detailsItem.source === "app_events"
                    ? channelPublications.length
                      ? channelPublications
                      : orderChannelKeys((detailsItem.channels && detailsItem.channels.length ? detailsItem.channels : [detailsItem.target]).filter(Boolean).map((channel: unknown) => String(channel))).map((channel) => ({
                          key: channel,
                          label: formatChannelLabel(channel),
                          parts: defaultParts,
                        }))
                    : [];
                  const activePublicationEntry = detailsItem.source === "app_events"
                    ? (publicationChannelEntries.find((entry) => entry.key === detailsChannelKey) || publicationChannelEntries[0] || null)
                    : null;
                  const activePublicationResult = detailsItem.source === "app_events" && activePublicationEntry
                    ? ((payload?.results && typeof payload.results === "object" ? (payload.results as any)[activePublicationEntry.key] : null) || null)
                    : null;
                  const activePublicationDeleted = isDeletedChannelResult(activePublicationResult);
                  const activePublicationFailed = isFailedChannelResult(activePublicationResult);
                  const activePublicationFailureMessage = getFailedChannelMessage(activePublicationResult);
                  const activeParts = activePublicationEntry?.parts || defaultParts;
                  const sourceDocAttachments = detailsItem.source === "send_items"
                    ? extractAttachmentsFromPayload(detailsSourceDocPayload)
                    : [];
                  const attachmentCandidates = detailsItem.source === "send_items"
                    ? [...(detailsItem.attachments || []), ...sourceDocAttachments]
                    : detailsItem.source === "app_events"
                    ? [...(activeParts.attachments || [])]
                    : [];
                  const dedupedAttachments = attachmentCandidates.filter((att, idx, arr) => {
                    const key = `${att.url || ""}|${att.name || ""}`;
                    return arr.findIndex((x) => `${x.url || ""}|${x.name || ""}` === key) === idx;
                  });
                  const imageAttachments = dedupedAttachments.filter((att) => att?.url && isImageAttachment(att));
                  const videoAttachments = dedupedAttachments.filter((att) => att?.url && isVideoAttachment(att));
                  const fileAttachments = dedupedAttachments.filter((att) => !imageAttachments.includes(att) && !videoAttachments.includes(att));
                  const hasAttachments = imageAttachments.length > 0 || videoAttachments.length > 0 || fileAttachments.length > 0;
                  const showFallbackMessage = (() => {
                    if (detailsItem.source !== "app_events") return true;
                    const activeHasStructured = !!(activeParts.title || activeParts.content || activeParts.cta || activeParts.hashtags?.length || activeParts.attachments?.length);
                    const fallbackTitle = firstNonEmpty(payload?.post?.title, payload?.subject, payload?.title);
                    const fallbackContent = firstNonEmpty(payload?.post?.content, payload?.post?.text, payload?.content, payload?.text, payload?.message);
                    const fallbackCta = firstNonEmpty(payload?.post?.cta, payload?.cta);
                    const fallbackHashtags = Array.isArray(payload?.post?.hashtags || payload?.hashtags)
                      ? (payload?.post?.hashtags || payload?.hashtags).map((x: any) => String(x || "").trim()).filter(Boolean)
                      : [];
                    const fallbackAttachments = extractAttachmentsFromPayload(payload);
                    return !(activeHasStructured || fallbackTitle || fallbackContent || fallbackCta || fallbackHashtags.length || fallbackAttachments.length);
                  })();

                  return (
                    <>
                      <div className={styles.detailsStack}>
                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div>
                              <div className={styles.detailsTitle}>{detailsItem.title || "(sans objet)"}</div>
                              <div className={styles.detailsSub}>{formatOutboxStatusLabel(detailsItem)}</div>
                            </div>
                          </div>

                          {detailsItem.source === "send_items" ? (
                            <>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{splitList(detailsItem.to || detailsItem.target).join(", ") || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Document source</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.source_doc_number || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {detailsItem.reopenHref ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                  >
                                    Réouvrir dans l’outil
                                  </button>
                                ) : null}
                                {(detailsItem as any).raw?.source_doc_type === "devis" && (detailsItem as any).raw?.source_doc_save_id ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(`/dashboard/factures/new?fromDevisSaveId=${encodeURIComponent((detailsItem as any).raw.source_doc_save_id)}`)}
                                  >
                                    Créer la facture
                                  </button>
                                ) : null}
                                {canDeleteHistoryItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : detailsItem.source === "mail_campaigns" ? (
                            <>
                              <div className={styles.metaGrid}>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Boîte d’envoi</div>
                                  <div className={styles.metaVal}>{detailsAccountLabel || "—"}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Destinataires</div>
                                  <div className={styles.metaVal}>{(detailsItem as any).raw?.total_count || 0} contact{Number((detailsItem as any).raw?.total_count || 0) > 1 ? "s" : ""}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Progression</div>
                                  <div className={styles.metaVal}>{formatCampaignProgress((detailsItem as any).raw || {})}</div>
                                </div>
                                <div className={styles.metaRow}>
                                  <div className={styles.metaKey}>Objet</div>
                                  <div className={styles.metaVal}>{detailsItem.subject || detailsItem.title || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                                {isRetryableCampaignItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => void retryCampaignFailedRecipients(detailsItem.id)}
                                    disabled={campaignActionBusyId === detailsItem.id}
                                  >
                                    {campaignActionBusyId === detailsItem.id ? "Relance…" : "Relancer les échecs"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => {
                                    void Promise.all([
                                      loadCampaignRecipients(detailsItem.id, campaignRecipientsPage, campaignRecipientsFilter),
                                      loadCampaignHealth(detailsItem.id, (detailsItem as any).raw || {}),
                                    ]);
                                  }}
                                  disabled={campaignRecipientsLoading || campaignHealthLoading || campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignRecipientsLoading || campaignHealthLoading ? "Actualisation…" : "Rafraîchir le suivi"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void openCampaignComposeFromHistory(detailsItem, "reuse")}
                                  disabled={campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignActionBusyId === detailsItem.id ? "Préparation…" : "Réutiliser"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnGhost}
                                  onClick={() => void openCampaignComposeFromHistory(detailsItem, "resend")}
                                  disabled={campaignActionBusyId === detailsItem.id}
                                >
                                  {campaignActionBusyId === detailsItem.id ? "Préparation…" : "Renvoyer"}
                                </button>
                                {detailsItem.reopenHref ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => router.push(detailsItem.reopenHref || "/dashboard/mails")}
                                  >
                                    Réouvrir dans l’outil
                                  </button>
                                ) : null}
                                {canDeleteHistoryItem(detailsItem) ? (
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div className={styles.detailPillsWrap}>
                                {publicationChannelEntries.length ? (
                                  publicationChannelEntries.map((entry, idx) => {
                                    const entryResult = detailsItem.source === "app_events" && payload?.results && typeof payload.results === "object"
                                      ? ((payload.results as any)[entry.key] || null)
                                      : null;
                                    const entryIndicator = getChannelIndicatorMeta(entryResult);
                                    return (
                                      <button
                                        key={`${entry.key}-${idx}`}
                                        type="button"
                                        className={`${styles.channelBubbleBtn} ${activePublicationEntry?.key === entry.key ? styles.channelBubbleBtnActive : ""}`}
                                        onClick={() => setDetailsChannelKey(entry.key)}
                                      >
                                        <span className={styles.channelBubble}>
                                          <span>{entry.label}</span>
                                          {entryIndicator ? (
                                            <span
                                              className={entryIndicator.className}
                                              title={entryIndicator.title}
                                              aria-label={entryIndicator.title}
                                            />
                                          ) : null}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className={styles.metaVal}>—</span>
                                )}
                              </div>
                              {activePublicationEntry ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  {detailsActionSuccess ? (
                                    <div className={styles.detailsSuccessInline}>
                                      <b>Action :</b> {detailsActionSuccess}
                                    </div>
                                  ) : null}
                                  {detailsEditMode ? (
                                    <button
                                      type="button"
                                      className={styles.btnPrimary}
                                      onClick={saveChannelPublication}
                                      disabled={detailsActionBusy}
                                    >
                                      {detailsActionBusy ? "Enregistrement…" : "Enregistrer"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => { setDetailsEditMode(true); setDetailsActionError(null); setDetailsActionSuccess(null); }}
                                      disabled={detailsActionBusy}
                                    >
                                      Modifier
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.btnDangerSmall}
                                    onClick={deleteChannelPublication}
                                    disabled={detailsActionBusy}
                                  >
                                    {detailsActionBusy && !detailsEditMode ? "Suppression…" : "Supprimer"}
                                  </button>
                                  {canDeleteHistoryItem(detailsItem) ? (
                                    <button
                                      type="button"
                                      className={styles.btnGhost}
                                      onClick={() => void deleteHistoryEntry(detailsItem)}
                                      disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id || detailsActionBusy}
                                    >
                                      {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                    </button>
                                  ) : null}
                                </div>
                              ) : canDeleteHistoryItem(detailsItem) ? (
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => void deleteHistoryEntry(detailsItem)}
                                    disabled={deletingHistorySelection || deletingHistoryItemId === detailsItem.id}
                                  >
                                    {deletingHistoryItemId === detailsItem.id ? "Suppression…" : `Supprimer de l’historique ${folderLabel(detailsItem.folder)}`}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {detailsActionError ? (
                            <div className={styles.detailsError}>
                              <b>Action :</b> {detailsActionError}
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && !activePublicationDeleted ? (
                            <div className={styles.detailsError}>
                              <b>Statut :</b> Publication échouée
                            </div>
                          ) : null}

                          {detailsItem.source === "app_events" && activePublicationFailed && activePublicationFailureMessage ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {activePublicationFailureMessage}
                            </div>
                          ) : null}

                          {detailsItem.error ? (
                            <div className={styles.detailsError}>
                              <b>Détail :</b> {detailsItem.error}
                            </div>
                          ) : null}
                        </section>

                        <section className={styles.detailSectionCard}>
                          <div className={styles.detailSectionHeader}>
                            <div className={styles.messageHeaderTitle}>Message</div>
                          </div>

                          {detailsItem.source !== "app_events" ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : activePublicationEntry ? (
                            (() => {
                              const parts = activeParts;
                              const showInstagramHashtags = activePublicationEntry.key === "instagram";
                              const deletedAt = activePublicationResult?.deleted_at ? new Date(String(activePublicationResult.deleted_at)).toLocaleString() : null;
                              const hasAny = !!(parts.title || parts.content || parts.cta || (showInstagramHashtags && parts.hashtags?.length));
                              if (!hasAny && showFallbackMessage) {
                                return (
                                  <div className={styles.messageBody}>
                                    {detailsItem.detailHtml ? (
                                      <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                                    ) : (
                                      <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                                    )}
                                  </div>
                                );
                              }
                              if (!hasAny && !detailsEditMode) return <div className={styles.emptyDetailText}>Aucun message disponible pour ce canal.</div>;
                              return (
                                <article key={activePublicationEntry.key} className={styles.channelPublicationCard}>
                                  {activePublicationDeleted ? (
                                    <div className={styles.detailsError} style={{ marginBottom: 12 }}>
                                      <b>Statut :</b> Supprimé{deletedAt ? ` le ${deletedAt}` : ""}
                                    </div>
                                  ) : null}
                                  <div className={styles.publicationParts}>
                                    {detailsEditMode && !activePublicationDeleted ? (
                                      <>
                                        <div>
                                          <div className={styles.publicationLabel}>Titre</div>
                                          <input
                                            type="text"
                                            value={publicationEditForm.title}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, title: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="Titre"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>Contenu</div>
                                          <textarea
                                            value={publicationEditForm.content}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, content: e.target.value }))}
                                            className={styles.publicationFieldTextarea}
                                            placeholder="Contenu"
                                            rows={8}
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        <div>
                                          <div className={styles.publicationLabel}>CTA</div>
                                          <input
                                            type="text"
                                            value={publicationEditForm.cta}
                                            onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, cta: e.target.value }))}
                                            className={styles.publicationFieldInput}
                                            placeholder="CTA"
                                            disabled={detailsActionBusy}
                                          />
                                        </div>
                                        {activePublicationEntry.key === "instagram" ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <input
                                              type="text"
                                              value={publicationEditForm.hashtags}
                                              onChange={(e) => setPublicationEditForm((prev) => ({ ...prev, hashtags: e.target.value }))}
                                              className={styles.publicationFieldInput}
                                              placeholder="maçonnerie lens btp"
                                              disabled={detailsActionBusy}
                                            />
                                          </div>
                                        ) : null}
                                        <div style={{ display: "grid", gap: 12 }}>
                                          <div className={styles.publicationLabel}>Pièces jointes</div>
                                          <input
                                            id={publicationEditFileInputId}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className={styles.hiddenFileInput}
                                            onChange={(e) => {
                                              const input = e.currentTarget;
                                              const files = input?.files ?? null;
                                              addPublicationFiles(files);
                                              if (input) input.value = "";
                                            }}
                                          />
                                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            <label htmlFor={publicationEditFileInputId} className={styles.btnAttach}>📎 Ajouter des images</label>
                                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                                              {activePublicationEditAssets.length} image(s) pour {activePublicationEntry?.label || "ce canal"}
                                            </span>
                                          </div>


                                          <div style={{ display: "grid", gap: 8 }}>
                                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                              Cochez les images à publier puis ouvrez la retouche uniquement quand vous voulez recadrer une image.
                                            </div>
                                            <ChannelImageRetouchCardsPanel
                                              tabs={[{ key: activePublicationEditChannelKey, label: activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey) }]}
                                              activeChannel={activePublicationEditChannelKey}
                                              onActiveChannelChange={() => {}}
                                              channelTitle={activePublicationEntry?.label || formatChannelLabel(activePublicationEditChannelKey)}
                                              formatLabel={`Format final : ${activePublicationEditPreset.width}×${activePublicationEditPreset.height}`}
                                              aspectRatio={`${activePublicationEditPreset.width} / ${activePublicationEditPreset.height}`}
                                              items={activePublicationEditAssets.map((asset, index) => ({
                                                key: asset.key,
                                                previewUrl: asset.previewUrl,
                                                included: asset.selected,
                                                title: `Image ${index + 1}`,
                                                subtitle: asset.selected ? "Publiée sur ce canal" : "Non publiée sur ce canal",
                                                fitLabel: asset.transform.fit === "cover" ? "Remplir" : "Adapter",
                                                backgroundMode: getPublicationBackgroundMode(asset.transform),
                                                onToggle: () => togglePublicationImage(activePublicationEditChannelKey, asset.key),
                                                onRetouch: () => openPublicationRetouch(activePublicationEditChannelKey, asset.key),
                                                onRemove: () => removePublicationImage(activePublicationEditChannelKey, asset.key),
                                              }))}
                                              buttonClassName={styles.btnGhost}
                                              pillButtonStyle={pillBtn}
                                              pillButtonActiveStyle={pillBtnActive}
                                              showTabs={false}
                                              emptyMessage="Aucune image pour ce canal."
                                            />
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        {parts.title ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Titre</div>
                                            <div className={styles.publicationValue}>{parts.title}</div>
                                          </div>
                                        ) : null}
                                        {parts.content ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Contenu</div>
                                            <pre className={styles.publicationPre}>{parts.content}</pre>
                                          </div>
                                        ) : null}
                                        {parts.cta ? (
                                          <div>
                                            <div className={styles.publicationLabel}>CTA</div>
                                            <div className={styles.publicationCtaBox}>{parts.cta}</div>
                                          </div>
                                        ) : null}
                                        {activePublicationEntry.key === "instagram" && parts.hashtags && parts.hashtags.length ? (
                                          <div>
                                            <div className={styles.publicationLabel}>Hashtags</div>
                                            <div className={styles.publicationTagRow}>
                                              {parts.hashtags.map((t, idx) => (
                                                <span key={idx} className={styles.publicationTag}>#{t.replace(/^#/, "")}</span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                </article>
                              );
                            })()
                          ) : showFallbackMessage ? (
                            <div className={styles.messageBody}>
                              {detailsItem.detailHtml ? (
                                <div className={styles.messageHtml} dangerouslySetInnerHTML={{ __html: detailsItem.detailHtml }} />
                              ) : (
                                <pre className={styles.messageText}>{detailsItem.detailText || ""}</pre>
                              )}
                            </div>
                          ) : (
                            <div className={styles.emptyDetailText}>Aucun message disponible.</div>
                          )}
                        </section>

                        {detailsItem.source === "mail_campaigns" ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Suivi destinataires</div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
                              {[
                                { key: "sent", label: "Envoyés au provider", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
                                { key: "queued", label: "En attente", value: campaignHealth?.queued ?? campaignCounts((detailsItem as any).raw || {}).queued },
                                { key: "processing", label: "En cours", value: campaignHealth?.processing ?? campaignCounts((detailsItem as any).raw || {}).processing },
                                { key: "failed", label: "Échecs", value: campaignHealth?.failed ?? campaignCounts((detailsItem as any).raw || {}).failed },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "blacklist", label: "Blacklist", value: campaignHealth?.blacklist ?? 0 },
                              ].map((stat) => {
                                const isActive = campaignRecipientsFilter === stat.key;
                                return (
                                  <button
                                    key={stat.key}
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => {
                                      setCampaignRecipientsPage(1);
                                      setCampaignRecipientsFilter((prev) => (prev === stat.key ? "all" : (stat.key as CampaignRecipientsFilterId)));
                                    }}
                                    style={{
                                      textAlign: "left",
                                      padding: "12px 14px",
                                      borderRadius: 14,
                                      background: isActive ? "rgba(76,195,255,0.12)" : "rgba(255,255,255,0.03)",
                                      border: isActive ? "1px solid rgba(76,195,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                                    }}
                                  >
                                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", marginBottom: 4 }}>{stat.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                              {([
                                { key: "all", label: "Tous", value: campaignHealth?.total ?? Number((detailsItem as any).raw?.total_count || 0) },
                                { key: "sent", label: "Envoyés", value: campaignHealth?.sent ?? campaignCounts((detailsItem as any).raw || {}).sent },
                                { key: "queued", label: "En attente", value: campaignHealth?.queued ?? campaignCounts((detailsItem as any).raw || {}).queued },
                                { key: "processing", label: "En cours", value: campaignHealth?.processing ?? campaignCounts((detailsItem as any).raw || {}).processing },
                                { key: "failed", label: "Échecs", value: campaignHealth?.failed ?? campaignCounts((detailsItem as any).raw || {}).failed },
                                { key: "blocked", label: "Bloqués", value: campaignHealth?.blocked ?? 0 },
                                { key: "opt_out", label: "Désinscrits", value: campaignHealth?.opt_out ?? 0 },
                                { key: "blacklist", label: "Blacklist", value: campaignHealth?.blacklist ?? 0 },
                              ] as Array<{ key: CampaignRecipientsFilterId | "all"; label: string; value: number }>).map((chip) => {
                                const active = campaignRecipientsFilter === chip.key;
                                return (
                                  <button
                                    key={chip.key}
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => {
                                      setCampaignRecipientsPage(1);
                                      setCampaignRecipientsFilter(chip.key as CampaignRecipientsFilterId);
                                    }}
                                    style={{
                                      ...(active ? pillBtnActive : {}),
                                      minHeight: 34,
                                      padding: "0 12px",
                                      borderRadius: 999,
                                      background: active ? "rgba(76,195,255,0.10)" : "rgba(255,255,255,0.03)",
                                    }}
                                  >
                                    {chip.label} • {chip.value}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, marginBottom: 12 }}>
                              {campaignHealthLoading ? "Actualisation des statuts campagne…" : `Filtre actif : ${formatCampaignFilterLabel(campaignRecipientsFilter)}.`}
                              {campaignHealth && campaignHealth.retryable > 0 ? ` Relançables : ${campaignHealth.retryable}.` : ""}
                            </div>
                            {campaignRecipientsLoading ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Chargement des destinataires…</div>
                            ) : campaignRecipients.length === 0 ? (
                              <div style={{ color: "rgba(255,255,255,0.68)" }}>Aucun destinataire chargé.</div>
                            ) : (
                              <>
                                <div className={styles.attachmentsList}>
                                {campaignRecipients.map((recipient) => {
                                  const attemptLabel = recipient.attempt_count != null && recipient.max_attempts != null
                                    ? `Tentative ${recipient.attempt_count}/${recipient.max_attempts}`
                                    : null;
                                  const statusLabel = getCampaignRecipientStatusLabel(recipient);
                                  return (
                                    <div key={recipient.id} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{recipient.display_name ? `${recipient.display_name} — ${recipient.email}` : recipient.email}</span>
                                      <span className={styles.attachmentMeta}>{statusLabel}</span>
                                      {attemptLabel ? <span className={styles.attachmentMeta}>{attemptLabel}</span> : null}
                                      {recipient.last_error || recipient.error ? (
                                        <span className={styles.attachmentMeta} style={{ color: "#ffb0b0" }}>{recipient.last_error || recipient.error}</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                                <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                                  {campaignRecipientsTotal > 0
                                    ? `Affichage ${(campaignRecipientsPage - 1) * MAILBOX_RECIPIENTS_PAGE_SIZE + 1}–${Math.min(campaignRecipientsPage * MAILBOX_RECIPIENTS_PAGE_SIZE, campaignRecipientsTotal)} sur ${campaignRecipientsTotal} (${formatCampaignFilterLabel(campaignRecipientsFilter).toLowerCase()})`
                                    : `Aucun destinataire (${formatCampaignFilterLabel(campaignRecipientsFilter).toLowerCase()})`}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.max(1, prev - 1))}
                                    disabled={campaignRecipientsPage <= 1 || campaignRecipientsLoading}
                                  >
                                    ← Précédent
                                  </button>
                                  <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                                    Page {campaignRecipientsPage} / {campaignRecipientsPageCount}
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.btnGhost}
                                    onClick={() => setCampaignRecipientsPage((prev) => Math.min(campaignRecipientsPageCount, prev + 1))}
                                    disabled={campaignRecipientsPage >= campaignRecipientsPageCount || campaignRecipientsLoading}
                                  >
                                    Suivant →
                                  </button>
                                </div>
                                </div>
                              </>
                            )}
                          </section>
                        ) : null}

                        {hasAttachments ? (
                          <section className={styles.detailSectionCard}>
                            <div className={styles.detailSectionHeader}>
                              <div className={styles.messageHeaderTitle}>Pièces jointes</div>
                            </div>

                            <div className={styles.attachmentsPanel}>
                              {imageAttachments.length ? (
                                <div className={styles.attachmentGallery}>
                                  {imageAttachments.map((a, idx) => (
                                    <a
                                      key={`${a.url || a.name}-${idx}`}
                                      className={styles.attachmentPreviewCard}
                                      href={a.url || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img src={a.url || ""} alt={a.name || `Pièce jointe ${idx + 1}`} className={styles.attachmentPreviewImage} />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                    </a>
                                  ))}
                                </div>
                              ) : null}

                              {videoAttachments.length ? (
                                <div className={styles.attachmentGallery}>
                                  {videoAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentPreviewCard}>
                                      <video
                                        src={a.url || ""}
                                        className={styles.attachmentPreviewImage}
                                        controls
                                        preload="metadata"
                                      />
                                      <div className={styles.attachmentPreviewCaption}>{a.name}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {fileAttachments.length ? (
                                <div className={styles.attachmentsList}>
                                  {fileAttachments.map((a, idx) => (
                                    <div key={`${a.url || a.name}-${idx}`} className={styles.attachmentItem}>
                                      <span className={styles.attachmentName}>{a.name}</span>
                                      {a.type ? <span className={styles.attachmentMeta}>{a.type}</span> : null}
                                      {typeof a.size === "number" ? <span className={styles.attachmentMeta}>{Math.round(a.size / 1024)} Ko</span> : null}
                                      {a.url ? (
                                        <a className={styles.attachmentLink} href={a.url} target="_blank" rel="noreferrer">
                                          Ouvrir
                                        </a>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </section>
                        ) : null}
                      </div>

                      {detailsItem.source === "send_items" && (detailsItem as any).raw?.status === "draft" ? (
                        <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                          Astuce : clique sur ce brouillon dans la liste pour l’ouvrir en édition.
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
  );
}
