import type { Dispatch, RefObject, SetStateAction } from "react";
import styles from "../crm.module.css";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, sanitizeDepartmentFilter } from "../crm.shared";
import type { Category, ContactType, CrmContact } from "../crm.types";

type Props = {
  isResponsive: boolean;
  saving: boolean;
  importing: boolean;
  selectedCount: number;
  visibleContacts: CrmContact[];
  actionsOpen: boolean;
  setActionsOpen: Dispatch<SetStateAction<boolean>>;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: Dispatch<SetStateAction<boolean>>;
  desktopFiltersOpen: boolean;
  setDesktopFiltersOpen: Dispatch<SetStateAction<boolean>>;
  activeFiltersCount: number;
  activeFilterChips: string[];
  actionEmails: string[];
  primaryContact: CrmContact | null;
  clearSelection: () => void;
  selectAllVisible: () => void;
  removeSelected: () => void;
  sendMailToAction: () => void;
  goNewDevis: (contact: CrmContact) => void;
  goNewFacture: (contact: CrmContact) => void;
  goPlanifierIntervention: (contact: CrmContact) => void;
  actionsRef: RefObject<HTMLDivElement | null>;
  desktopFiltersRef: RefObject<HTMLDivElement | null>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  pageSize: number;
  setPage: Dispatch<SetStateAction<number>>;
  setPageSize: Dispatch<SetStateAction<number>>;
  categoryFilter: Category;
  setCategoryFilter: Dispatch<SetStateAction<Category>>;
  typeFilter: ContactType;
  setTypeFilter: Dispatch<SetStateAction<ContactType>>;
  departmentFilter: string;
  setDepartmentFilter: Dispatch<SetStateAction<string>>;
  importantOnly: boolean;
  setImportantOnly: Dispatch<SetStateAction<boolean>>;
};

export default function CRMToolbar({
  isResponsive,
  saving,
  selectedCount,
  visibleContacts,
  actionsOpen,
  setActionsOpen,
  mobileFiltersOpen,
  setMobileFiltersOpen,
  desktopFiltersOpen,
  setDesktopFiltersOpen,
  activeFiltersCount,
  activeFilterChips,
  actionEmails,
  primaryContact,
  clearSelection,
  selectAllVisible,
  removeSelected,
  sendMailToAction,
  goNewDevis,
  goNewFacture,
  goPlanifierIntervention,
  actionsRef,
  desktopFiltersRef,
  query,
  setQuery,
  pageSize,
  setPage,
  setPageSize,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  departmentFilter,
  setDepartmentFilter,
  importantOnly,
  setImportantOnly,
}: Props) {
  const resetFilters = () => {
    setCategoryFilter("");
    setTypeFilter("");
    setDepartmentFilter("");
    setImportantOnly(false);
  };

  return (
    <>
      <div className={styles.secondaryToolbar}>
        {!isResponsive ? (
          <div className={styles.selectionMeta}>
            {selectedCount > 0 ? `${selectedCount} contact${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""}` : "Aucune sélection"}
          </div>
        ) : null}

        <div className={`${styles.bulkActions} ${isResponsive ? styles.mobileBulkActions : ""}`.trim()}>
          {isResponsive ? (
            <>
              <button aria-label="Tout sélectionner" className={`${styles.ghostBtn} ${styles.iconOnlyBtn}`.trim()} type="button" onClick={selectAllVisible} disabled={visibleContacts.length === 0 || saving} title="Tout sélectionner">
                ☑
              </button>

              <button
                aria-label="Désélectionner"
                className={`${styles.ghostBtn} ${styles.iconOnlyBtn}`.trim()}
                type="button"
                onClick={clearSelection}
                disabled={selectedCount === 0 || saving}
                title={selectedCount === 0 ? "Aucun contact sélectionné" : "Désélectionner"}
              >
                ⊟
              </button>
            </>
          ) : (
            <button
              aria-label="Désélectionner"
              className={styles.ghostBtn}
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0 || saving}
              title={selectedCount === 0 ? "Aucun contact sélectionné" : "Vider la sélection"}
            >
              Désélectionner
            </button>
          )}

          <div className={styles.actionsWrap} ref={actionsRef}>
            <button
              className={`${styles.actionsBtn} ${isResponsive ? styles.mobileActionsBtn : ""}`.trim()}
              type="button"
              onClick={() => {
                if (isResponsive) setMobileFiltersOpen(false);
                setDesktopFiltersOpen(false);
                setActionsOpen((v) => !v);
              }}
              disabled={(actionEmails.length === 0 && !primaryContact) || saving}
              aria-expanded={actionsOpen ? "true" : "false"}
              title={primaryContact ? "Actions sur ce contact" : selectedCount > 0 ? "Actions sur la sélection" : "Sélectionnez un contact"}
            >
              Actions <span className={styles.caret}>▾</span>
            </button>

            {actionsOpen ? (
              <div className={styles.actionsMenu} role="menu">
                <button
                  className={styles.actionsItem}
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    sendMailToAction();
                  }}
                  disabled={actionEmails.length === 0 || saving}
                >
                  ✉️ Envoyer un mail
                </button>

                <div className={styles.actionsSep} />

                <button
                  className={styles.actionsItem}
                  type="button"
                  onClick={() => {
                    if (!primaryContact) return;
                    setActionsOpen(false);
                    goNewDevis(primaryContact);
                  }}
                  disabled={!primaryContact || saving}
                >
                  📄 Devis
                </button>

                <button
                  className={styles.actionsItem}
                  type="button"
                  onClick={() => {
                    if (!primaryContact) return;
                    setActionsOpen(false);
                    goNewFacture(primaryContact);
                  }}
                  disabled={!primaryContact || saving}
                >
                  🧾 Factures
                </button>

                <div className={styles.actionsSep} />

                <button
                  className={styles.actionsItem}
                  type="button"
                  onClick={() => {
                    if (!primaryContact) return;
                    setActionsOpen(false);
                    goPlanifierIntervention(primaryContact);
                  }}
                  disabled={!primaryContact || saving}
                >
                  📅 Planifier un Rendez-vous
                </button>
              </div>
            ) : null}
          </div>

          {isResponsive ? (
            <button
              type="button"
              className={`${styles.ghostBtn} ${styles.mobileFilterActionBtn}`.trim()}
              onClick={() => {
                setActionsOpen(false);
                setMobileFiltersOpen((prev) => !prev);
              }}
              aria-expanded={mobileFiltersOpen ? "true" : "false"}
            >
              Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
            </button>
          ) : null}

          <button
            aria-label="Supprimer"
            className={`${styles.smallBtn} ${styles.dangerBtn} ${isResponsive ? styles.mobileDeleteBtn : ""}`.trim()}
            type="button"
            onClick={removeSelected}
            disabled={selectedCount === 0 || saving}
            title={selectedCount === 0 ? "Sélectionne 1 ou plusieurs contacts" : `Supprimer ${selectedCount} contact(s)`}
          >
            🗑️
          </button>
        </div>

        {!isResponsive ? (
          <div className={styles.filtersWrap} ref={desktopFiltersRef}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => {
                setActionsOpen(false);
                setDesktopFiltersOpen((prev) => !prev);
              }}
              aria-expanded={desktopFiltersOpen ? "true" : "false"}
            >
              Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
            </button>

            {desktopFiltersOpen ? (
              <div className={styles.desktopFiltersPanel}>
                <label className={styles.label}>
                  <span>Catégorie</span>
                  <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category)}>
                    <option value="">Toutes</option>
                    <option value="particulier">Particulier</option>
                    <option value="professionnel">Professionnel</option>
                    <option value="collectivite_publique">Institution</option>
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Type</span>
                  <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ContactType)}>
                    <option value="">Tous</option>
                    <option value="client">Client</option>
                    <option value="prospect">Prospect</option>
                    <option value="fournisseur">Fournisseur</option>
                    <option value="partenaire">Partenaire</option>
                    <option value="autre">Autre</option>
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Département</span>
                  <input className={styles.input} inputMode="numeric" placeholder="62" maxLength={3} value={departmentFilter} onChange={(e) => setDepartmentFilter(sanitizeDepartmentFilter(e.target.value))} />
                </label>

                <label className={`${styles.label} ${styles.desktopImportantToggle}`.trim()}>
                  <span>Important</span>
                  <button type="button" className={`${styles.ghostBtn} ${importantOnly ? styles.mobileImportantActive : ""}`.trim()} onClick={() => setImportantOnly((prev) => !prev)}>
                    {importantOnly ? "Uniquement les importants" : "Tous les contacts"}
                  </button>
                </label>

                <button type="button" className={styles.mobileFiltersReset} onClick={resetFilters}>
                  Réinitialiser
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isResponsive ? (
          <div className={styles.tableSearchWrap}>
            <div className={styles.searchWrap}>
              <input className={styles.search} placeholder="Rechercher..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        ) : null}

        {!isResponsive ? (
          <label className={styles.pageSizeWrap}>
            <span>Par page</span>
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value) || DEFAULT_PAGE_SIZE);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isResponsive ? (
        <div className={styles.mobileControls}>
          {activeFilterChips.length > 0 ? (
            <div className={styles.mobileFilterChips}>
              {activeFilterChips.map((chip) => (
                <span key={chip} className={styles.mobileFilterChip}>{chip}</span>
              ))}
              <button type="button" className={styles.mobileFiltersReset} onClick={resetFilters}>
                Réinitialiser
              </button>
            </div>
          ) : null}

          {mobileFiltersOpen ? (
            <div className={styles.mobileFiltersPanel}>
              <label className={styles.label}>
                <span>Catégorie</span>
                <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category)}>
                  <option value="">Toutes</option>
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel</option>
                  <option value="collectivite_publique">Institution</option>
                </select>
              </label>

              <label className={styles.label}>
                <span>Type</span>
                <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ContactType)}>
                  <option value="">Tous</option>
                  <option value="client">Client</option>
                  <option value="prospect">Prospect</option>
                  <option value="fournisseur">Fournisseur</option>
                  <option value="partenaire">Partenaire</option>
                  <option value="autre">Autre</option>
                </select>
              </label>

              <label className={styles.label}>
                <span>Département</span>
                <input className={styles.input} inputMode="numeric" placeholder="62" maxLength={3} value={departmentFilter} onChange={(e) => setDepartmentFilter(sanitizeDepartmentFilter(e.target.value))} />
              </label>

              <label className={`${styles.label} ${styles.mobileImportantToggle}`.trim()}>
                <span>Important</span>
                <button type="button" className={`${styles.ghostBtn} ${importantOnly ? styles.mobileImportantActive : ""}`.trim()} onClick={() => setImportantOnly((prev) => !prev)}>
                  {importantOnly ? "Uniquement les importants" : "Tous les contacts"}
                </button>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
