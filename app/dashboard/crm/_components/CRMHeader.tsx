import HelpButton from "../../_components/HelpButton";
import type { MutableRefObject, RefObject } from "react";
import styles from "../crm.module.css";

type StatItem = { label: string; value: number };

type Props = {
  isResponsive: boolean;
  isCompactUi: boolean;
  saving: boolean;
  importing: boolean;
  total: number;
  exportingFormat: "" | "csv" | "xlsx";
  exportOpen: boolean;
  setExportOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  statsOpen: boolean;
  setStatsOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  headerSearchOpen: boolean;
  setHeaderSearchOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setHelpOpen: (value: boolean) => void;
  query: string;
  setQuery: (value: string) => void;
  triggerImport: () => void;
  exportExcel: () => Promise<void>;
  exportCsv: () => Promise<void>;
  startNew: () => void;
  openAddModal: () => void;
  statsItems: StatItem[];
  exportRef: RefObject<HTMLDivElement | null>;
  statsRef: RefObject<HTMLDivElement | null>;
  headerSearchRef: RefObject<HTMLDivElement | null>;
  headerSearchInputRef: RefObject<HTMLInputElement | null>;
  onCloseDashboard: () => void;
};

export default function CRMHeader({
  isResponsive,
  isCompactUi,
  saving,
  importing,
  total,
  exportingFormat,
  exportOpen,
  setExportOpen,
  statsOpen,
  setStatsOpen,
  headerSearchOpen,
  setHeaderSearchOpen,
  setHelpOpen,
  query,
  setQuery,
  triggerImport,
  exportExcel,
  exportCsv,
  startNew,
  openAddModal,
  statsItems,
  exportRef,
  statsRef,
  headerSearchRef,
  headerSearchInputRef,
  onCloseDashboard,
}: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.titleBlock}>
        <div className={styles.titleWrap}>
          <img src="/inrcrm-logo.png" alt="iNr’CRM" style={{ width: 154, height: 64, display: "block" }} />
          {!isResponsive ? <p className={styles.subInline}>La centrale de tous vos contacts</p> : null}
        </div>
        {isResponsive ? <p className={styles.mobileTagline}>La centrale de tous vos contacts</p> : null}
      </div>

      <div className={styles.headerRight}>
        {!isResponsive ? <HelpButton onClick={() => setHelpOpen(true)} title="Aide iNr’CRM" /> : null}

        {isResponsive ? (
          <>
            <div className={styles.headerSearchWrap} ref={headerSearchRef}>
              <button
                type="button"
                className={`${styles.headerIconBtn} ${styles.searchBtn}`.trim()}
                onClick={() => {
                  setStatsOpen(false);
                  setHeaderSearchOpen((prev) => !prev);
                }}
                aria-expanded={headerSearchOpen ? "true" : "false"}
                aria-label="Rechercher un contact"
                title="Rechercher"
              >
                🔍
              </button>

              {headerSearchOpen ? (
                <div className={styles.headerSearchDropdown}>
                  <div className={styles.searchWrap}>
                    <input
                      ref={headerSearchInputRef}
                      className={`${styles.search} ${styles.headerSearchActive}`.trim()}
                      placeholder="Rechercher un contact..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.statsWrap} ref={statsRef}>
              <button
                type="button"
                className={styles.headerIconBtn}
                onClick={() => {
                  setHeaderSearchOpen(false);
                  setStatsOpen((v) => !v);
                }}
                aria-expanded={statsOpen ? "true" : "false"}
                aria-label="Ouvrir le menu CRM"
                title="Menu CRM"
              >
                ☰
              </button>

              {statsOpen ? (
                <div className={`${styles.statsDropdown} ${styles.mobileMenuDropdown}`.trim()} role="menu">
                  <div className={styles.statsTitle}>Menu CRM</div>

                  <div className={styles.mobileMenuActions}>
                    <button
                      className={styles.mobileMenuItem}
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        startNew();
                        openAddModal();
                      }}
                      disabled={saving}
                    >
                      Ajouter un contact
                    </button>
                    <button
                      className={styles.mobileMenuItem}
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        triggerImport();
                      }}
                      disabled={saving || importing}
                    >
                      {importing ? "Import…" : "Importer"}
                    </button>
                    <button
                      className={styles.mobileMenuItem}
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        void exportExcel();
                      }}
                      disabled={saving || Boolean(exportingFormat) || total === 0}
                    >
                      Export Excel
                    </button>
                    <button
                      className={styles.mobileMenuItem}
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        void exportCsv();
                      }}
                      disabled={saving || Boolean(exportingFormat) || total === 0}
                    >
                      Export CSV
                    </button>
                    <button
                      className={styles.mobileMenuItem}
                      type="button"
                      onClick={() => {
                        setStatsOpen(false);
                        setHelpOpen(true);
                      }}
                    >
                      Aide
                    </button>
                  </div>

                  <div className={styles.mobileMenuStats}>
                    {statsItems.map((item) => (
                      <div key={item.label} className={styles.statsItem}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.closeWrap}>
              <button type="button" className={styles.backBtn} onClick={onCloseDashboard} aria-label="Fermer" title="Fermer">
                <span className={styles.closeIcon}>✕</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.headerActionBtn}`}
              onClick={() => {
                startNew();
                openAddModal();
              }}
              disabled={saving}
            >
              + Ajouter
            </button>

            <button
              type="button"
              className={`${styles.ghostBtn} ${styles.headerActionBtn}`}
              onClick={triggerImport}
              disabled={saving || importing}
              title="Importer un fichier CSV, JSON ou Excel (.xlsx, .xls)"
            >
              {importing ? "Import…" : "Importer"}
            </button>

            <div className={styles.exportWrap} ref={exportRef}>
              <button
                className={`${styles.ghostBtn} ${styles.headerActionBtn}`}
                type="button"
                onClick={() => setExportOpen((prev) => !prev)}
                disabled={saving || Boolean(exportingFormat) || total === 0}
                aria-expanded={exportOpen ? "true" : "false"}
                title={total === 0 ? "Aucun contact à exporter" : "Choisir le format d’export"}
              >
                {exportingFormat ? "Export…" : "Exporter"} <span className={styles.caret}>▾</span>
              </button>

              {exportOpen ? (
                <div className={styles.exportMenu} role="menu">
                  <button
                    className={styles.exportItem}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      void exportExcel();
                    }}
                    disabled={Boolean(exportingFormat)}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    className={styles.exportItem}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      void exportCsv();
                    }}
                    disabled={Boolean(exportingFormat)}
                  >
                    CSV (.csv)
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.statsWrap} ref={statsRef}>
              <button
                type="button"
                className={`${styles.ghostBtn} ${styles.headerActionBtn} ${styles.headerStatsBtn}`}
                onClick={() => {
                  setHeaderSearchOpen(false);
                  setExportOpen(false);
                  setStatsOpen((v) => !v);
                }}
                aria-expanded={statsOpen ? "true" : "false"}
                title="Statistiques"
              >
                Stats
              </button>

              {statsOpen ? (
                <div className={styles.statsDropdown} role="menu">
                  <div className={styles.statsTitle}>Statistiques</div>
                  <div className={styles.statsGrid}>
                    {statsItems.map((item) => (
                      <div key={item.label} className={styles.statsItem}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.closeWrap}>
              <button type="button" className={styles.backBtn} onClick={onCloseDashboard} aria-label="Fermer" title="Fermer">
                {isCompactUi ? <span className={styles.closeIcon}>✕</span> : <span className={styles.closeText}>Fermer</span>}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
