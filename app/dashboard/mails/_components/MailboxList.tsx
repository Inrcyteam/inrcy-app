import React from "react";
import styles from "../mails.module.css";
import {
  MAILBOX_PAGE_SIZE,
  formatCampaignProgress,
  formatChannelLabel,
  historyEmptyState,
  isGroupedActionFolder,
  listGridTemplateColumns,
  renderPublicationChannelsWithFailures,
  getPublicationChannelStatuses,
  extractChannelPublications,
  extractAttachmentsFromPayload,
  isVideoAttachment,
  folderLabel,
  workflowActionLabelForItem,
  type Folder,
  type BoxView,
  type MailAccount,
  type OutboxItem,
} from "../_lib/mailboxPhase1";

type Props = {
  folder: Folder;
  boxView: BoxView;
  loading: boolean;
  visibleItems: OutboxItem[];
  selectedId: string | null;
  openItem: (item: OutboxItem) => void;
  openDetails: (item: OutboxItem) => void;
  mailAccounts: MailAccount[];
  itemMailAccountId: (item: OutboxItem) => string | null | undefined;
  filteredItemsLength: number;
  historyPage: number;
  historyTotalCount: number | null;
  historyHasMorePotential: boolean;
  historyPageCount: number;
  loadHistory: (opts?: { page?: number }) => Promise<unknown> | void;
  refreshHistory: () => Promise<unknown> | void;
  historyQuery: string;
};


function formatListDate(value: string | null | undefined) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function simpleStatusLabel(item: OutboxItem) {
  const rawStatus = String((item.raw as any)?.status || item.status || "").toLowerCase();
  if (rawStatus === "draft") return "Brouillon";
  if (rawStatus === "queued") return "En attente";
  if (rawStatus === "processing") return "En cours";
  if (rawStatus === "paused") return "En pause";
  if (rawStatus === "partial") return "Partiel";
  if (rawStatus === "failed" || rawStatus === "error") return "Erreur";
  if (rawStatus === "completed" || rawStatus === "sent") return "Envoyé";
  return rawStatus || "Historique";
}


function stripWorkflowPrefix(value: string) {
  return String(value || "")
    .replace(/^(Valoriser|Récolter|Récolte|Offrir|Informer|Information|Suivre|Suivi|Enquêter|Enquête|Propulsion|Fidélisation)\s*[—–·-]\s*/i, "")
    .trim();
}

function isWorkflowLabel(value: string, label: string) {
  return value.trim().toLowerCase() === label.trim().toLowerCase();
}

function rowHeaderLabels(folder: Folder) {
  if (folder === "publications") return { title: "Publication", meta: "Canaux" };
  if (folder === "stats") return { title: "Bilan", meta: "Destinataire" };
  if (isGroupedActionFolder(folder)) return { title: "Objet", meta: "Cible" };
  if (folder === "factures") return { title: "Facture", meta: "Statut / destinataire" };
  if (folder === "devis") return { title: "Devis", meta: "Statut / destinataire" };
  if (folder === "mails") return { title: "Objet", meta: "Destinataire" };
  return { title: folderLabel(folder), meta: "Cible" };
}

function publicationChannelCount(item: OutboxItem): number {
  const payload = item.source === "app_events" ? (item.raw as any)?.payload : item.raw;
  const statuses = getPublicationChannelStatuses(payload || null, item.channels && item.channels.length ? item.channels : [item.target || ""]);
  return statuses.length || 0;
}

function formatChannelCountLabel(count: number): string {
  if (count <= 0) return "Canal non renseigné";
  return count === 1 ? "1 canal" : `${count} canaux`;
}

function isPublicationVideoItem(item: OutboxItem): boolean {
  const payload = item.source === "app_events" ? (item.raw as any)?.payload : item.raw;
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, any>;
  if (String(record.mediaType || record.media_type || "").toLowerCase() === "video") return true;
  return extractAttachmentsFromPayload(record).some((attachment) => isVideoAttachment(attachment));
}

function getRowTitle(item: OutboxItem, folder: Folder) {
  if (folder === "publications") {
    const payload = item.source === "app_events" ? (item.raw as any)?.payload : item.raw;
    const channelTitle = extractChannelPublications(payload)?.find((entry) => String(entry.parts?.title || "").trim())?.parts?.title || "";
    return item.subTitle || channelTitle || item.subject || item.title || "Publication";
  }
  if (folder === "factures") {
    const docNumber = String((item.raw as any)?.source_doc_number || "").trim();
    if (docNumber && !String(item.title || "").includes(docNumber)) return `Facture ${docNumber} — ${item.title || "sans objet"}`;
  }
  if (folder === "devis") {
    const docNumber = String((item.raw as any)?.source_doc_number || "").trim();
    if (docNumber && !String(item.title || "").includes(docNumber)) return `Devis ${docNumber} — ${item.title || "sans objet"}`;
  }
  if (isGroupedActionFolder(folder)) {
    const actionLabel = workflowActionLabelForItem(item);
    let cleaned = stripWorkflowPrefix(item.title || item.subject || item.subTitle || "");
    if (isWorkflowLabel(cleaned, actionLabel)) cleaned = stripWorkflowPrefix(item.subject || item.subTitle || "");
    // Ne pas basculer sur item.preview : c'est souvent le corps du message.
    return cleaned || item.subject || item.subTitle || "(sans objet)";
  }
  return item.title || item.subject || "(sans objet)";
}

function getRowMetaText(opts: { item: OutboxItem; folder: Folder; accountLabel: string; midLabel: string }) {
  const { item, folder, accountLabel, midLabel } = opts;
  if (folder === "publications") return midLabel || "Canal non renseigné";

  if (folder === "factures" || folder === "devis") {
    return [simpleStatusLabel(item), item.target].filter(Boolean).join(" · ") || simpleStatusLabel(item);
  }

  if (folder === "stats") {
    return [simpleStatusLabel(item), item.target].filter(Boolean).join(" · ") || simpleStatusLabel(item);
  }

  if (isGroupedActionFolder(folder)) {
    const actionLabel = workflowActionLabelForItem(item);
    // Important : ne jamais utiliser item.preview ici, car preview = extrait du corps du message.
    // Les colonnes "Cible" / "Destinataire" doivent rester vides ou explicites si aucune cible n'existe.
    const target = stripWorkflowPrefix(String(item.target || midLabel || ""));
    return target && !isWorkflowLabel(target, actionLabel) ? target : "Cible non renseignée";
  }

  if (item.source === "mail_campaigns") {
    return String(item.target || "").trim();
  }

  if (folder === "mails") {
    return String(item.target || "").trim();
  }

  return [accountLabel || item.provider || "Mail", item.target || midLabel].filter(Boolean).join(" · ");
}


export default function MailboxList(props: Props) {
  const {
    folder,
    boxView,
    loading,
    visibleItems,
    selectedId,
    openItem,
    openDetails,
    mailAccounts,
    itemMailAccountId,
    filteredItemsLength,
    historyPage,
    historyTotalCount,
    historyHasMorePotential,
    historyPageCount,
    loadHistory,
    refreshHistory,
    historyQuery,
  } = props;

  const historyPageTotalLabel = historyTotalCount != null
    ? String(historyPageCount)
    : historyHasMorePotential
      ? "…"
      : String(historyPageCount);
  const historyRangeLabel = (() => {
    if (filteredItemsLength <= 0) {
      return `0 / ${historyTotalCount ?? 0}`;
    }
    const start = (historyPage - 1) * MAILBOX_PAGE_SIZE + 1;
    const end = start + filteredItemsLength - 1;
    return `${start} – ${end} / ${historyTotalCount ?? "…"}`;
  })();
  const showInitialLoading = loading && visibleItems.length === 0;

  return (
    <>
      <div className={styles.scrollArea}>
        {showInitialLoading ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>Chargement…</div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHeader}>
              {(() => {
                const labels = rowHeaderLabels(folder);
                return (
                  <div className={styles.listHeaderGrid} style={{ gridTemplateColumns: listGridTemplateColumns(folder) }}>
                    <div className={styles.listHeaderCell}>{labels.title}</div>
                    {isGroupedActionFolder(folder) ? (
                      <div className={`${styles.listHeaderCell} ${styles.listHeaderCellCenter} ${styles.workflowActionHeader}`}>Action</div>
                    ) : null}
                    <div className={`${styles.listHeaderCell} ${styles.listHeaderCellCenter}`}>{labels.meta}</div>
                    <div className={`${styles.listHeaderCell} ${styles.listHeaderCellRight}`}>Date</div>
                    <div className={`${styles.listHeaderCell} ${styles.listHeaderCellAction}`}>Détails</div>
                  </div>
                );
              })()}
            </div>
            {visibleItems.length === 0 ? (
              <div style={{ padding: 14, color: "rgba(255,255,255,0.65)" }}>{historyEmptyState(folder, boxView, historyQuery)}</div>
            ) : visibleItems.map((it) => {
              const active = it.id === selectedId;
              const historyKey = `${it.source}:${it.id}`;

              const accountLabel = (() => {
                const acc = mailAccounts.find((a) => a.id === itemMailAccountId(it));
                if (!acc) return "";
                return (acc.display_name ? `${acc.display_name} — ` : "") + acc.email_address;
              })();

              const midLabel =
                it.source === "send_items" || it.source === "mail_campaigns"
                  ? [accountLabel, it.source === "mail_campaigns" ? formatCampaignProgress((it.raw || {}) as any) : ""].filter(Boolean).join(" • ")
                  : (it.channels && it.channels.length
                      ? it.channels.map((channel) => formatChannelLabel(channel)).join(" / ")
                      : formatChannelLabel(it.target || ""));
              const midLabelNode = folder === "publications" && it.source === "app_events"
                ? (renderPublicationChannelsWithFailures((it as any)?.raw?.payload || null, it.channels && it.channels.length ? it.channels : [it.target]) || (midLabel || ""))
                : (midLabel || "");
              const rowTitle = getRowTitle(it, folder);
              const rowMetaText = getRowMetaText({ item: it, folder, accountLabel, midLabel });
              const rowMetaNode = folder === "publications" ? midLabelNode : rowMetaText;
              const rowDate = formatListDate(it.created_at);
              const publicationMobileMeta = folder === "publications"
                ? `${formatChannelCountLabel(publicationChannelCount(it))} · ${rowDate}`
                : "";
              const showWorkflowAction = isGroupedActionFolder(folder);
              const workflowActionLabel = workflowActionLabelForItem(it);
              const isVideoPublication = folder === "publications" && it.source === "app_events" && isPublicationVideoItem(it);
              const isInrAgentOrigin = it.originSource === "inr_agent";
              const isScheduledOrigin = !isInrAgentOrigin && [
                "booster_scheduled",
                "inrsend_scheduled",
                "propulser_scheduled",
                "fideliser_scheduled",
              ].includes(String(it.originSource || ""));

              return (
                <div
                  key={historyKey}
                  className={`${styles.item} ${active ? styles.itemActive : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(it)}
                  onDoubleClick={() => openDetails(it)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(it);
                    }
                  }}
                >
                  <div className={styles.itemTop} style={{ gridTemplateColumns: listGridTemplateColumns(folder) }}>
                    <div className={styles.fromRow}>
                      <div className={styles.from} title={rowTitle}>{rowTitle}</div>
                      {isVideoPublication ? <span className={styles.publicationMediaBadge}>🎬 Vidéo</span> : null}
                    </div>

                    {showWorkflowAction ? (
                      <div className={styles.workflowActionCell} title={workflowActionLabel}>
                        <span className={styles.workflowActionBadge}>{workflowActionLabel}</span>
                      </div>
                    ) : null}

                    <div className={`${styles.itemMid} ${folder === "publications" ? styles.publicationChannelsCell : ""}`} title={rowMetaText || midLabel || it.target}>
                      <span className={`${styles.itemMidContent} ${showWorkflowAction || folder === "publications" ? styles.itemMidContentDesktopOnly : ""}`}>{rowMetaNode}</span>
                      {folder === "publications" ? (
                        <span className={styles.mobilePublicationMeta}>{publicationMobileMeta}</span>
                      ) : null}
                      {showWorkflowAction ? (
                        <span className={styles.mobileWorkflowMeta}>
                          {workflowActionLabel} · {rowMetaText}
                        </span>
                      ) : null}
                      {folder !== "publications" ? <span className={styles.mobileMetaDate}> · {rowDate}</span> : null}
                    </div>

                    <div className={styles.itemDateCell}>
                      <div className={styles.date}>{rowDate}</div>
                    </div>

                    <div className={styles.rowActions}>
                      {isInrAgentOrigin ? (
                        <span
                          className={styles.inrAgentOriginIcon}
                          title={it.originLabel || "Créé par iNr’Agent"}
                          aria-label={it.originLabel || "Créé par iNr’Agent"}
                          role="img"
                        >
                          <img src="/icons/inr-agent.png" alt="" aria-hidden="true" />
                        </span>
                      ) : isScheduledOrigin ? (
                        <span
                          className={styles.scheduledOriginIcon}
                          title={it.originLabel || "Action programmée"}
                          aria-label={it.originLabel || "Action programmée"}
                          role="img"
                        >
                          <span aria-hidden="true">🕒</span>
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost} ${styles.detailsBtn}`}
                        title="Détails"
                        aria-label={`Afficher les détails de ${rowTitle || "cet élément"}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openDetails(it);
                        }}
                      >
                        <span className={styles.detailsBtnIcon} aria-hidden="true">↗</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.listFooter}>
        <div className={styles.listFooterPagerRow}>
          <button
            type="button"
            className={styles.listFooterArrowButton}
            onClick={() => {
              const prevPage = Math.max(1, historyPage - 1);
              void loadHistory({ page: prevPage });
            }}
            disabled={historyPage <= 1 || loading}
            aria-label="Page précédente"
            title="Page précédente"
          >
            {"<"}
          </button>
          <div className={styles.listFooterPageText} aria-live="polite">
            {historyPage} / {historyPageTotalLabel}
          </div>
          <button
            type="button"
            className={styles.listFooterArrowButton}
            onClick={() => {
              const nextPage = historyPage + 1;
              void loadHistory({ page: nextPage });
            }}
            disabled={!historyHasMorePotential || loading}
            aria-label="Page suivante"
            title="Page suivante"
          >
            {">"}
          </button>
        </div>
        <div className={styles.listFooterMetaRow}>
          <span>{historyRangeLabel}</span>
          <button
            type="button"
            className={styles.listFooterRefreshButton}
            onClick={() => void refreshHistory()}
            disabled={loading}
            aria-label={loading ? "Actualisation en cours" : "Actualiser la liste"}
            title={loading ? "Actualisation en cours" : "Actualiser la liste"}
          >
            <span
              className={loading ? styles.listFooterRefreshIconActive : styles.listFooterRefreshIcon}
              aria-hidden="true"
            >
              ↻
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
