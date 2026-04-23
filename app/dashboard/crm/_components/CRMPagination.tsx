import type { Dispatch, SetStateAction } from "react";
import styles from "../crm.module.css";

type Props = {
  isResponsive: boolean;
  total: number;
  visibleCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  loading: boolean;
  setPage: Dispatch<SetStateAction<number>>;
};

export default function CRMPagination({ isResponsive, total, visibleCount, page, pageSize, pageCount, loading, setPage }: Props) {
  if (!isResponsive) {
    return (
      <div className={styles.paginationBar}>
        <div className={styles.paginationMeta}>
          {total > 0 ? `Affichage ${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} sur ${total}` : "0 contact"}
        </div>
        <div className={styles.paginationControls}>
          <button type="button" className={styles.ghostBtn} onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1 || loading}>
            ← Précédent
          </button>
          <span className={styles.paginationStatus}>Page {Math.min(page, pageCount)} / {Math.max(pageCount, 1)}</span>
          <button type="button" className={styles.ghostBtn} onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))} disabled={page >= pageCount || loading || total === 0}>
            Suivant →
          </button>
        </div>
      </div>
    );
  }

  return <div className={styles.mobileListSummary}>{total > 0 ? `${visibleCount} / ${total} contact${total > 1 ? "s" : ""}` : "0 contact"}</div>;
}
