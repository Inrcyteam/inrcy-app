import type { Dispatch, RefObject, SetStateAction } from "react";
import styles from "../crm.module.css";
import {
  buildDisplayName,
  categoryBadgeClass,
  CATEGORY_LABEL,
  CATEGORY_LABEL_SHORT,
  getDepartmentCode,
  typeBadgeClass,
  TYPE_LABEL,
  TYPE_LABEL_SHORT,
} from "../crm.shared";
import type { Category, ContactType, CrmContact } from "../crm.types";

type Props = {
  isResponsive: boolean;
  visibleContacts: CrmContact[];
  emptyMessage: string;
  selectedContactIds: Set<string>;
  expandedMobileContactId: string | null;
  setExpandedMobileContactId: Dispatch<SetStateAction<string | null>>;
  toggleSelect: (id: string) => void;
  sendMailToContact: (contact: CrmContact) => void;
  goPlanifierIntervention: (contact: CrmContact) => void;
  goNewDevis: (contact: CrmContact) => void;
  goNewFacture: (contact: CrmContact) => void;
  startEdit: (contact: CrmContact) => void;
  toggleImportant: (id: string) => void;
  remove: (id: string) => Promise<void> | void;
  mobileLoadMoreRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  page: number;
  mobileHasMore: boolean;
  allVisibleSelected: boolean;
  toggleSelectAllVisible: () => void;
  showDesktopEmptyMessage: boolean;
  desktopRowHeight: number;
  desktopPlaceholderRows: unknown[];
};

export default function CRMContactsView({
  isResponsive,
  visibleContacts,
  emptyMessage,
  selectedContactIds,
  expandedMobileContactId,
  setExpandedMobileContactId,
  toggleSelect,
  sendMailToContact,
  goPlanifierIntervention,
  goNewDevis,
  goNewFacture,
  startEdit,
  toggleImportant,
  remove,
  mobileLoadMoreRef,
  loading,
  page,
  mobileHasMore,
  allVisibleSelected,
  toggleSelectAllVisible,
  showDesktopEmptyMessage,
  desktopRowHeight,
  desktopPlaceholderRows,
}: Props) {
  if (isResponsive) {
    return (
      <div className={styles.mobileTable}>
        {visibleContacts.length === 0 ? (
          <div className={styles.mobileEmpty}>{emptyMessage}</div>
        ) : (
          visibleContacts.map((c) => {
            const isExpanded = expandedMobileContactId === c.id;
            return (
              <div key={c.id} className={styles.mobileContactBlock}>
                <div className={`${styles.mobileListRow} ${isExpanded ? styles.mobileListRowOpen : ""}`.trim()}>
                  <label className={styles.mobileCheckboxWrap} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={`Sélectionner ${buildDisplayName(c) || "ce contact"}`}
                    />
                  </label>

                  <button
                    type="button"
                    className={styles.mobileListMain}
                    onClick={() => setExpandedMobileContactId((prev) => (prev === c.id ? null : c.id))}
                    aria-expanded={isExpanded ? "true" : "false"}
                  >
                    <span className={`${styles.mobileListName} ${c.important ? styles.nameImportant : ""}`.trim()}>
                      {buildDisplayName(c) || "Contact sans nom"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={styles.mobileExpandBtn}
                    onClick={() => setExpandedMobileContactId((prev) => (prev === c.id ? null : c.id))}
                    aria-label={isExpanded ? "Réduire le détail" : "Afficher le détail"}
                    aria-expanded={isExpanded ? "true" : "false"}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                </div>

                {isExpanded ? (
                  <div className={styles.mobileRowDetails}>
                    <div className={styles.mobileDetailGrid}>
                      <div>
                        <span className={styles.mobileDetailLabel}>Mail</span>
                        <strong>{c.email || "—"}</strong>
                      </div>
                      <div>
                        <span className={styles.mobileDetailLabel}>Téléphone</span>
                        <strong>{c.phone || "—"}</strong>
                      </div>
                      <div>
                        <span className={styles.mobileDetailLabel}>Catégorie</span>
                        <strong>{c.category ? CATEGORY_LABEL[c.category as Exclude<Category, "">] : "—"}</strong>
                      </div>
                      <div>
                        <span className={styles.mobileDetailLabel}>Type</span>
                        <strong>{c.contact_type ? TYPE_LABEL[c.contact_type as Exclude<ContactType, "">] : "—"}</strong>
                      </div>
                      <div>
                        <span className={styles.mobileDetailLabel}>Département</span>
                        <strong>{getDepartmentCode(c.postal_code) || "—"}</strong>
                      </div>
                      <div>
                        <span className={styles.mobileDetailLabel}>Adresse</span>
                        <strong>{[c.address, c.postal_code, c.city].filter(Boolean).join(" ") || "—"}</strong>
                      </div>
                      {(c.notes || "").trim() ? (
                        <div className={styles.mobileDetailNotes}>
                          <span className={styles.mobileDetailLabel}>Notes</span>
                          <strong>{c.notes}</strong>
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.mobileDetailActions}>
                      <button type="button" className={styles.smallBtn} disabled={!c.email} onClick={(e) => { e.stopPropagation(); sendMailToContact(c); }}>
                        Mail
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.stopPropagation(); goPlanifierIntervention(c); }}>
                        Agenda
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.stopPropagation(); goNewDevis(c); }}>
                        Devis
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.stopPropagation(); goNewFacture(c); }}>
                        Facture
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.stopPropagation(); startEdit(c); }}>
                        Modifier
                      </button>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.stopPropagation(); toggleImportant(c.id); }}>
                        {c.important ? "Retirer ★" : "Mettre ★"}
                      </button>
                      <button type="button" className={`${styles.smallBtn} ${styles.dangerBtn}`.trim()} onClick={(e) => { e.stopPropagation(); void remove(c.id); }}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        <div ref={mobileLoadMoreRef} className={styles.mobileLoadSentinel} aria-hidden="true" />
        {loading && page > 1 ? <div className={styles.mobileLoadMore}>Chargement de plus de contacts...</div> : null}
        {!mobileHasMore && visibleContacts.length > 0 ? <div className={styles.mobileListEnd}>Tous les contacts sont affichés.</div> : null}
      </div>
    );
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.thSelect}>
            <input
              type="checkbox"
              className={styles.checkbox}
              onClick={(e) => e.stopPropagation()}
              onChange={toggleSelectAllVisible}
              checked={allVisibleSelected}
              aria-label="Sélectionner tous les contacts de la page"
            />
          </th>
          <th className={styles.thName}>Nom Prénom / RS</th>
          <th className={styles.thMail}>Mail</th>
          <th className={styles.thTel}>Téléphone</th>
          <th className={styles.thCp}>CP</th>
          <th className={styles.thCat}>Catégorie</th>
          <th className={styles.thType}>Type</th>
          <th className={styles.thStar}>⭐</th>
        </tr>
      </thead>
      <tbody>
        {showDesktopEmptyMessage ? (
          <tr className={styles.placeholderMessageRow} style={{ height: `${desktopRowHeight}px` }}>
            <td colSpan={8} className={styles.empty}>
              {emptyMessage}
            </td>
          </tr>
        ) : null}

        {visibleContacts.map((c) => (
          <tr
            key={c.id}
            className={selectedContactIds.has(c.id) ? styles.rowSelected : undefined}
            onClick={() => startEdit(c)}
            style={{ cursor: "pointer", height: `${desktopRowHeight}px` }}
          >
            <td className={styles.tdSelect}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedContactIds.has(c.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelect(c.id)}
                aria-label={`Sélectionner ${buildDisplayName(c)}`}
              />
            </td>
            <td className={`${styles.tdName} ${c.important ? styles.nameImportant : ""}`.trim()}>{buildDisplayName(c)}</td>
            <td className={`${styles.mono} ${styles.tdMail}`}>{c.email}</td>
            <td className={`${styles.mono} ${styles.tdTel}`}>{c.phone}</td>
            <td className={`${styles.mono} ${styles.tdCp}`}>{c.postal_code ?? ""}</td>
            <td className={styles.tdCat}>
              {c.category ? (
                <span className={categoryBadgeClass(c.category)}>
                  <span className={styles.badgeLabelFull}>{CATEGORY_LABEL[c.category as Exclude<Category, "">]}</span>
                  <span className={styles.badgeLabelShort}>{CATEGORY_LABEL_SHORT[c.category as Exclude<Category, "">]}</span>
                </span>
              ) : (
                <span className={styles.dash}>—</span>
              )}
            </td>
            <td>
              {c.contact_type ? (
                <span className={typeBadgeClass(c.contact_type)}>
                  <span className={styles.badgeLabelFull}>{TYPE_LABEL[c.contact_type as Exclude<ContactType, "">]}</span>
                  <span className={styles.badgeLabelShort}>{TYPE_LABEL_SHORT[c.contact_type as Exclude<ContactType, "">]}</span>
                </span>
              ) : (
                <span className={styles.dash}>—</span>
              )}
            </td>
            <td className={styles.tdStar}>
              {c.important ? <span className={styles.starStatic} title="Important" aria-label="Important">★</span> : null}
            </td>
          </tr>
        ))}

        {desktopPlaceholderRows.map((_, index) => (
          <tr key={`placeholder-row-${page}-${index}`} className={styles.placeholderRow} aria-hidden="true" style={{ height: `${desktopRowHeight}px` }}>
            <td className={styles.tdSelect}>&nbsp;</td>
            <td className={styles.tdName}>&nbsp;</td>
            <td className={`${styles.mono} ${styles.tdMail}`}>&nbsp;</td>
            <td className={`${styles.mono} ${styles.tdTel}`}>&nbsp;</td>
            <td className={`${styles.mono} ${styles.tdCp}`}>&nbsp;</td>
            <td className={styles.tdCat}>&nbsp;</td>
            <td>&nbsp;</td>
            <td className={styles.tdStar}>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
