import React from "react";
import styles from "../mails.module.css";
import {
  MAILBOX_PAGE_SIZE,
  canBulkDeleteHistoryItem,
  formatCampaignProgress,
  formatChannelLabel,
  historyEmptyState,
  historySelectionKey,
  isVisibleInFolder,
  listGridTemplateColumns,
  pill,
  renderPublicationChannelsWithFailures,
  canDeleteHistoryItem,
  folderLabel,
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
  selectedHistoryKeySet: Set<string>;
  deletingHistorySelection: boolean;
  deletingDraftId: string | null;
  deletingHistoryItemId: string | null;
  openItem: (item: OutboxItem) => void;
  openDetails: (item: OutboxItem) => void;
  toggleHistorySelection: (item: OutboxItem) => void;
  mailAccounts: MailAccount[];
  itemMailAccountId: (item: OutboxItem) => string | null | undefined;
  filteredItemsLength: number;
  historyPage: number;
  historyTotalCount: number | null;
  historyHasMorePotential: boolean;
  historyPageCount: number;
  loadHistory: (opts?: { page?: number }) => Promise<void> | void;
  selectedBulkCount: number;
  historyQuery: string;
};

export default function MailboxList(props: Props) {
  const {
    folder,
    boxView,
    loading,
    visibleItems,
    selectedId,
    selectedHistoryKeySet,
    deletingHistorySelection,
    deletingDraftId,
    deletingHistoryItemId,
    openItem,
    openDetails,
    toggleHistorySelection,
    mailAccounts,
    itemMailAccountId,
    filteredItemsLength,
    historyPage,
    historyTotalCount,
    historyHasMorePotential,
    historyPageCount,
    loadHistory,
    selectedBulkCount,
    historyQuery,
  } = props;

  return (
    <>
      <div className={styles.scrollArea}>
        {loading ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>Chargement…</div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHeader}>
              <div className={styles.listHeaderGrid} style={{ gridTemplateColumns: listGridTemplateColumns(folder) }}>
                <div className={styles.listHeaderCell}>Objet</div>
                <div className={`${styles.listHeaderCell} ${styles.listHeaderCellCenter} ${folder === "publications" ? styles.listHeaderCellPublications : ""}`}>
                  {folder === "publications" ? "Canaux" : "Boîte d’envoi"}
                </div>
                <div className={`${styles.listHeaderCell} ${styles.listHeaderCellRight}`}>Date · Heure</div>
              </div>
            </div>
            {visibleItems.length === 0 ? (
              <div style={{ padding: 14, color: "rgba(255,255,255,0.65)" }}>{historyEmptyState(folder, boxView, historyQuery)}</div>
            ) : visibleItems.map((it) => {
              const active = it.id === selectedId;
              const p = pill(it.provider);
              const historyKey = historySelectionKey(it);
              const bulkDeletable = canBulkDeleteHistoryItem(it);
              const checked = bulkDeletable && selectedHistoryKeySet.has(historyKey);

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
                      {bulkDeletable ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 10 }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={deletingHistorySelection || deletingDraftId === it.id || deletingHistoryItemId === it.id}
                            aria-label={`Sélectionner ${it.title || "cet élément"}`}
                            onChange={() => toggleHistorySelection(it)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                      ) : null}
                      <div className={styles.from} title={it.title || "(sans objet)"}>{it.title || "(sans objet)"}</div>
                      <span className={`${styles.badge} ${p.cls}`}>{p.label}</span>
                    </div>

                    <div className={styles.itemMid} title={midLabel || it.target}>
                      {midLabelNode}
                    </div>

                    <div className={styles.itemRight}>
                      <div className={styles.date}>{new Date(it.created_at).toLocaleString()}</div>

                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={`${styles.iconBtnSmall} ${styles.iconBtnSmallGhost}`}
                          title="Ouvrir"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openDetails(it);
                          }}
                        >
                          ↗
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.listFooter}>
        <div className={styles.listFooterMeta}>
          <div>
            {filteredItemsLength > 0
              ? (() => {
                  const start = (historyPage - 1) * MAILBOX_PAGE_SIZE + 1;
                  const end = start + filteredItemsLength - 1;
                  if (historyTotalCount != null) {
                    return `Affichage ${start}–${end} sur ${historyTotalCount}`;
                  }
                  return historyHasMorePotential
                    ? `Affichage ${start}–${end} (autres éléments disponibles)`
                    : `Affichage ${start}–${end}`;
                })()
              : historyEmptyState(folder, boxView, historyQuery)}
          </div>
          {selectedBulkCount > 0 ? <div style={{ color: "rgba(196,181,253,0.95)" }}>{selectedBulkCount} élément{selectedBulkCount > 1 ? "s" : ""} sélectionné{selectedBulkCount > 1 ? "s" : ""} sur cette page.</div> : null}
          {loading ? <div style={{ color: "rgba(125,211,252,0.92)" }}>Actualisation de la liste…</div> : null}
        </div>
        <div className={styles.listFooterPager}>
          <div className={styles.listFooterPagerRow}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                const prevPage = Math.max(1, historyPage - 1);
                void loadHistory({ page: prevPage });
              }}
              disabled={historyPage <= 1 || loading}
            >
              ← Précédent
            </button>
            <div className={styles.listFooterPageText}>
              Page {historyPage}{historyTotalCount != null ? ` / ${historyPageCount}` : historyHasMorePotential ? " / …" : ""}
            </div>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                const nextPage = historyPage + 1;
                void loadHistory({ page: nextPage });
              }}
              disabled={!historyHasMorePotential || loading}
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
