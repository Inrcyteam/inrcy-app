"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../_documents/documents.module.css";
import { type DocRecord, calcTotalsWithDiscount, formatEuro, loadDocs } from "../_documents/docUtils";
import { deleteDocRecord, duplicateDocRecord, fetchDocRecords, updateDocRecordStatus } from "../_documents/docSaveStore";
import { PROFILE_VERSION_EVENT, type ProfileVersionChangeDetail } from "@/lib/profileVersioning";

type Props = {
  kind: "devis" | "facture";
  title: string;
  ctaLabel: string;
  ctaHref: string;
};

type Row = DocRecord & { totals: ReturnType<typeof calcTotalsWithDiscount> };

function ListPage({ kind, title, ctaLabel, ctaHref }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<"supabase" | "local">("supabase");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchDocRecords(kind);
      setDocs(next);
      setStorageMode("supabase");
    } catch (error) {
      console.error(error);
      setDocs(loadDocs().filter((d) => d.kind === kind));
      setStorageMode("local");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleProfileVersionChange = (event: Event) => {
      const detail = (event as CustomEvent<ProfileVersionChangeDetail>).detail;
      if (detail?.field !== "docs_version") return;
      void refresh();
    };

    window.addEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    return () => {
      window.removeEventListener(PROFILE_VERSION_EVENT, handleProfileVersionChange as EventListener);
    };
  }, [refresh]);

  const rows: Row[] = useMemo(() => {
    return docs.map((d) => ({
      ...d,
      totals: calcTotalsWithDiscount(d.lines, !!d.vatDispense, d.discountKind, d.discountValue),
    }));
  }, [docs]);

  const onOpen = (id: string) => {
    router.push(`/dashboard/factures/new?saveId=${encodeURIComponent(id)}`);
  };

  const onDuplicate = async (id: string) => {
    try {
      const duplicatedId = await duplicateDocRecord(kind, id);
      await refresh();
      if (duplicatedId) router.push(`/dashboard/factures/new?saveId=${encodeURIComponent(duplicatedId)}`);
    } catch (error) {
      console.error(error);
    }
  };

  const onMarkPaid = async (id: string, isAlreadyPaid: boolean) => {
    if (isAlreadyPaid) return;
    try {
      await updateDocRecordStatus(kind, id, "paye");
      await refresh();
    } catch (error) {
      console.error(error);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteDocRecord(kind, id);
      await refresh();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className={styles.listWrap}>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.listTitle}>{title}</h1>
          <p className={styles.listSub}>
            {storageMode === "supabase"
              ? "Brouillons et versions synchronisés via iNrSend."
              : "Affichage de secours depuis le navigateur."}
          </p>
        </div>
        <button type="button" onClick={() => router.push(ctaHref)} className={styles.primaryBtn}>
          {ctaLabel}
        </button>
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.empty}>Chargement…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            Aucune facture pour l’instant.
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => router.push(ctaHref)} className={styles.primaryBtn}>
                {ctaLabel}
              </button>
            </div>
          </div>
        ) : (
          <table className={styles.listTable}>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Date</th>
                <th>Statut</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ width: 380 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const isPaid = d.status === "paye";
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 650 }}>{d.number}</td>
                    <td>{d.clientName}</td>
                    <td>{new Date(d.createdAtISO).toLocaleDateString("fr-FR")}</td>
                    <td>{d.status}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatEuro(d.totals.totalDue ?? d.totals.totalTTC)}
                    </td>
                    <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onOpen(d.id)} className={styles.ghostBtn}>
                        Ouvrir
                      </button>
                      <button type="button" onClick={() => onDuplicate(d.id)} className={styles.ghostBtn}>
                        Dupliquer
                      </button>
                      <button
                        type="button"
                        onClick={() => onMarkPaid(d.id, isPaid)}
                        className={styles.ghostBtn}
                        disabled={isPaid}
                        style={isPaid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      >
                        Marquer payé
                      </button>
                      <button type="button" onClick={() => onDelete(d.id)} className={styles.ghostBtn}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ListPage;
