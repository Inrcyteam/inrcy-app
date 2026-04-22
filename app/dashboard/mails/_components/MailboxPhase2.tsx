"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "../mails.module.css";
import SettingsDrawer from "../../SettingsDrawer";
import HelpButton from "../../_components/HelpButton";
import HelpModal from "../../_components/HelpModal";
import MailsSettingsContent from "../../settings/_components/MailsSettingsContent";
import ResponsiveActionButton from "../../_components/ResponsiveActionButton";
import {
  ALL_FOLDERS,
  MAILBOX_PAGE_SIZE,
  folderLabel,
  folderTheme,
  historyEmptyState,
  toolbarActionTheme,
  type BoxView,
  type Folder,
  type FolderCounts,
  type MailAccount,
} from "../_lib/mailboxPhase1";

type MailboxHeaderProps = {
  helpOpen: boolean;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onOpenFolders: () => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
};

export function MailboxHeader({
  helpOpen,
  onOpenHelp,
  onCloseHelp,
  onOpenFolders,
  settingsOpen,
  onOpenSettings,
  onCloseSettings,
}: MailboxHeaderProps) {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.brand}>
          <Image
            src="/inrsend-logo.png"
            alt="iNr’Send"
            width={154}
            height={64}
            priority
            className={styles.brandIcon}
          />

          <div className={styles.brandText}>
            <div className={styles.brandRow}>
              <span className={styles.tagline}>
                Toutes vos communications, depuis une seule et même machine.
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <HelpButton onClick={onOpenHelp} title="Aide iNr’Send" />

          <button
            className={`${styles.btnGhost} ${styles.iconOnlyBtn} ${styles.hamburgerBtn}`}
            onClick={onOpenFolders}
            type="button"
            aria-label="Dossiers"
            title="Dossiers"
          >
            <span aria-hidden>☰</span>
            <span className={styles.srOnly}>Dossiers</span>
          </button>

          <ResponsiveActionButton
            desktopLabel="Réglages"
            mobileIcon="⚙️"
            onClick={onOpenSettings}
          />

          <SettingsDrawer
            title="Réglages iNr’Send"
            isOpen={settingsOpen}
            onClose={onCloseSettings}
          >
            <MailsSettingsContent />
          </SettingsDrawer>

          <ResponsiveActionButton
            desktopLabel="Fermer"
            mobileIcon="✕"
            href="/dashboard"
            title="Fermer iNr’Send"
          />
        </div>
      </div>

      <HelpModal open={helpOpen} title="iNr’Send" onClose={onCloseHelp}>
        <p style={{ marginTop: 0 }}>
          iNr’Send est le centre d’envoi de votre communication.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Centralisez vos échanges et vos messages.</li>
          <li>Gagnez du temps pour communiquer sur vos canaux.</li>
          <li>Utilisez les réglages pour connecter/configurer les envois.</li>
        </ul>
      </HelpModal>
    </>
  );
}

type MailboxMobileFoldersMenuProps = {
  open: boolean;
  folder: Folder;
  counts: FolderCounts;
  onClose: () => void;
  onSelectFolder: (folder: Folder) => void;
};

export function MailboxMobileFoldersMenu({
  open,
  folder,
  counts,
  onClose,
  onSelectFolder,
}: MailboxMobileFoldersMenuProps) {
  if (!open) return null;

  return (
    <div className={styles.mobileMenuOverlay} onClick={onClose}>
      <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
        <div className={styles.mobileMenuHeader}>
          <div className={styles.mobileMenuTitle}>Dossiers</div>
          <button className={styles.btnGhost} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className={styles.mobileMenuBody}>
          {ALL_FOLDERS.map((entry) => {
            const active = entry === folder;
            return (
              <button
                key={entry}
                className={`${styles.mobileFolderBtn} ${active ? styles.mobileFolderBtnActive : ""}`}
                style={folderTheme(entry)}
                onClick={() => {
                  onSelectFolder(entry);
                  onClose();
                }}
                type="button"
              >
                <span>{folderLabel(entry)}</span>
                <span className={styles.badgeCount}>{counts[entry] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type MailboxFolderTabsProps = {
  folder: Folder;
  counts: FolderCounts;
  onSelectFolder: (folder: Folder) => void;
};

export function MailboxFolderTabs({ folder, counts, onSelectFolder }: MailboxFolderTabsProps) {
  return (
    <div className={styles.folderTabs}>
      {ALL_FOLDERS.map((entry) => {
        const active = entry === folder;
        return (
          <button
            key={entry}
            className={`${styles.folderTabBtn} ${active ? styles.folderTabBtnActive : ""}`}
            style={folderTheme(entry)}
            onClick={() => onSelectFolder(entry)}
            type="button"
            title={folderLabel(entry)}
          >
            <span className={styles.folderTabLabel}>{folderLabel(entry)}</span>
            <span className={styles.badgeCount}>{counts[entry] || 0}</span>
          </button>
        );
      })}
    </div>
  );
}

type ToolbarConfig = {
  label: string;
  href?: string;
};

type MailboxToolbarProps = {
  filterAccountId: string;
  onFilterAccountChange: (value: string) => void;
  mailAccounts: MailAccount[];
  searchOpen: boolean;
  historyQuery: string;
  onToggleSearch: () => void;
  onReload: () => void;
  onSelectVisible: () => void;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  visibleBulkDeletableCount: number;
  selectedBulkCount: number;
  loading: boolean;
  deletingHistorySelection: boolean;
  deletingDraftId: string | null;
  deletingHistoryItemId: string | null;
  toolCfg: ToolbarConfig;
  folder: Folder;
  boxView: BoxView;
  onToggleDrafts: () => void;
  onPrimaryAction: () => void;
};

function formatMailAccountOptionLabel(account: MailAccount) {
  return `${account.display_name ? `${account.display_name} — ` : ""}${account.email_address} (${account.provider})`;
}

export function MailboxToolbar({
  filterAccountId,
  onFilterAccountChange,
  mailAccounts,
  searchOpen,
  historyQuery,
  onToggleSearch,
  onReload,
  onSelectVisible,
  onClearSelection,
  onDeleteSelection,
  visibleBulkDeletableCount,
  selectedBulkCount,
  loading,
  deletingHistorySelection,
  deletingDraftId,
  deletingHistoryItemId,
  toolCfg,
  folder,
  boxView,
  onToggleDrafts,
  onPrimaryAction,
}: MailboxToolbarProps) {
  const bulkBusy = loading || deletingHistorySelection || Boolean(deletingDraftId) || Boolean(deletingHistoryItemId);
  const hasSearchQuery = historyQuery.trim().length > 0;

  return (
    <div className={styles.toolbarRow}>
      <div className={styles.filterRow}>
        <div className={styles.toolbarInfo}>Filtrer</div>
        <select
          className={styles.filterSelect}
          value={filterAccountId}
          onChange={(e) => onFilterAccountChange(e.target.value)}
          title="Filtrer par boîte d’envoi"
        >
          <option value="">Toutes les boîtes</option>
          {mailAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {formatMailAccountOptionLabel(account)}
            </option>
          ))}
        </select>
        <div className={styles.mobileTopTools}>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.mobileOnlyBtn} ${
              !searchOpen && hasSearchQuery ? styles.toolbarIconBtnActive : ""
            }`}
            onClick={onToggleSearch}
            type="button"
            title={searchOpen ? "Fermer la recherche" : "Rechercher (Ctrl/Cmd+K)"}
            aria-label="Rechercher"
          >
            <span className={styles.toolbarIconGlyph}>⌕</span>
            {!searchOpen && hasSearchQuery ? <span className={styles.activeDot} /> : null}
          </button>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.mobileOnlyBtn}`}
            onClick={onReload}
            type="button"
            title="Actualiser"
            aria-label="Actualiser"
          >
            ↻
          </button>
        </div>
      </div>

      <div className={styles.toolbarActions}>
        <div className={styles.bulkToolbarActions}>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarIconBtn}`}
            onClick={onSelectVisible}
            type="button"
            title="Tout sélectionner la page"
            aria-label="Tout sélectionner la page"
            disabled={visibleBulkDeletableCount <= 0 || bulkBusy}
          >
            <span className={styles.toolbarIconGlyph}>☑</span>
          </button>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarIconBtn}`}
            onClick={onClearSelection}
            type="button"
            title="Tout désélectionner"
            aria-label="Tout désélectionner"
            disabled={selectedBulkCount <= 0 || bulkBusy}
          >
            <span className={styles.toolbarIconGlyph}>☐</span>
          </button>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${selectedBulkCount > 0 ? styles.toolbarBtnDanger : ""}`}
            onClick={onDeleteSelection}
            type="button"
            title={selectedBulkCount > 0 ? `Supprimer la sélection (${selectedBulkCount})` : "Supprimer la sélection"}
            aria-label="Supprimer la sélection"
            disabled={selectedBulkCount <= 0 || bulkBusy}
          >
            <span className={styles.toolbarIconGlyph}>🗑</span>
          </button>
        </div>

        <div className={styles.toolbarSpacer} />

        {toolCfg.href ? (
          <Link
            className={`${styles.toolbarBtn} ${styles.toolbarBtnCta}`}
            style={toolbarActionTheme(folder)}
            href={toolCfg.href}
            title={toolCfg.label}
          >
            {toolCfg.label}
          </Link>
        ) : (
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnCta}`}
            style={toolbarActionTheme(folder)}
            onClick={onPrimaryAction}
            type="button"
          >
            {toolCfg.label}
          </button>
        )}

        <button
          className={`${styles.toolbarBtn} ${boxView === "drafts" ? styles.toolbarBtnActive : ""}`}
          onClick={onToggleDrafts}
          type="button"
          title="Brouillons"
        >
          Brouillons
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.desktopToolbarIconBtn} ${
            !searchOpen && hasSearchQuery ? styles.toolbarIconBtnActive : ""
          }`}
          onClick={onToggleSearch}
          type="button"
          title={searchOpen ? "Fermer la recherche" : "Rechercher (Ctrl/Cmd+K)"}
          aria-label="Rechercher"
        >
          <span className={styles.toolbarIconGlyph}>⌕</span>
          {!searchOpen && hasSearchQuery ? <span className={styles.activeDot} /> : null}
        </button>

        <button
          className={`${styles.toolbarBtn} ${styles.toolbarIconBtn} ${styles.desktopToolbarIconBtn}`}
          onClick={onReload}
          type="button"
          title="Actualiser"
          aria-label="Actualiser"
        >
          ↻
        </button>
      </div>
    </div>
  );
}

type MailboxSearchPanelProps = {
  open: boolean;
  historySearchRef: React.RefObject<HTMLInputElement | null>;
  historyQuery: string;
  onHistoryQueryChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function MailboxSearchPanel({
  open,
  historySearchRef,
  historyQuery,
  onHistoryQueryChange,
  onClear,
  onClose,
}: MailboxSearchPanelProps) {
  if (!open) return null;

  return (
    <div className={styles.searchPanel}>
      <div className={styles.searchPanelInner}>
        <input
          ref={historySearchRef}
          className={styles.searchInputInline}
          placeholder="Rechercher un envoi…"
          value={historyQuery}
          onChange={(e) => onHistoryQueryChange(e.target.value)}
        />
        {historyQuery.trim() ? (
          <button
            className={styles.searchClearBtn}
            type="button"
            onClick={onClear}
            title="Effacer"
            aria-label="Effacer"
          >
            ×
          </button>
        ) : null}
        <button
          className={styles.searchCloseBtn}
          type="button"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

type MailboxListFooterProps = {
  filteredItemsLength: number;
  historyPage: number;
  historyTotalCount: number | null;
  historyHasMorePotential: boolean;
  historyPageCount: number;
  folder: Folder;
  boxView: BoxView;
  historyQuery: string;
  selectedBulkCount: number;
  loading: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function MailboxListFooter({
  filteredItemsLength,
  historyPage,
  historyTotalCount,
  historyHasMorePotential,
  historyPageCount,
  folder,
  boxView,
  historyQuery,
  selectedBulkCount,
  loading,
  onPrevPage,
  onNextPage,
}: MailboxListFooterProps) {
  const footerLabel =
    filteredItemsLength > 0
      ? (() => {
          const start = (historyPage - 1) * MAILBOX_PAGE_SIZE + 1;
          const end = start + filteredItemsLength - 1;
          if (historyTotalCount != null) return `Affichage ${start}–${end} sur ${historyTotalCount}`;
          return historyHasMorePotential
            ? `Affichage ${start}–${end} (autres éléments disponibles)`
            : `Affichage ${start}–${end}`;
        })()
      : historyEmptyState(folder, boxView, historyQuery);

  return (
    <div className={styles.listFooter}>
      <div className={styles.listFooterMeta}>
        <div>{footerLabel}</div>
        {selectedBulkCount > 0 ? (
          <div style={{ color: "rgba(196,181,253,0.95)" }}>
            {selectedBulkCount} élément{selectedBulkCount > 1 ? "s" : ""} sélectionné{selectedBulkCount > 1 ? "s" : ""} sur cette page.
          </div>
        ) : null}
        {loading ? <div style={{ color: "rgba(125,211,252,0.92)" }}>Actualisation de la liste…</div> : null}
      </div>
      <div className={styles.listFooterPager}>
        <div className={styles.listFooterPagerRow}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onPrevPage}
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
            onClick={onNextPage}
            disabled={!historyHasMorePotential || loading}
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>
  );
}
