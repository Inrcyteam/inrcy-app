"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "../_documents/documents.module.css";
import {
  DocRecord,
  calcTotalsWithDiscount,
  deleteDoc,
  duplicateDoc,
  formatEuro,
  loadDocs,
  setStatus,
  transformDevisToFacture,
} from "../_documents/docUtils";

type Props = {
  kind: "devis" | "facture";
  title: string;
  ctaLabel: string;
  ctaHref: string;
};

type Row = DocRecord & { totals: ReturnType<typeof calcTotalsWithDiscount> };

export default function ListPage({ kind, title, ctaLabel, ctaHref }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRecord[]>([]);

  const refresh = useCallback(() => {
    setDocs(loadDocs().filter((d) => d.kind === kind));
  }, [kind]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows: Row[] = useMemo(() => {
    return docs.map((d) => ({
      ...d,
      totals: calcTotalsWithDiscount(d.lines, !!d.vatDispense, d.discountKind, d.discountValue),
    }));
  }, [docs]);

  const onDuplicate = (id: string) => {
    duplicateDoc(id);
    refresh();
  };

  const onMarkPaid = (id: string, isAlreadyPaid: boolean) => {
    if (isAlreadyPaid) return;
    setStatus(id, "paye");
    refresh();
  };

  const onTransform = (id: string) => {
    const created = transformDevisToFacture(id);
    refresh();
    if (created) router.push("/dashboard/factures");
  };

  const onDelete = (id: string) => {
    deleteDoc(id);
    refresh();
  };

  return (
    <div className={styles.listWrap}>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.listTitle}>{title}</h1>
          <p className={styles.listSub}>
            Historique local (stocké dans le navigateur). On branchera Supabase ensuite.
          </p>
        </div>
        <button type="button" onClick={() => router.push(ctaHref)} className={styles.primaryBtn}>
          {ctaLabel}
        </button>
      </div>

      <div className={styles.tableCard}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            Aucun document pour l’instant.
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
                <th style={{ width: 300 }}></th>
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
                    <td
                      style={{
                        textAlign: "right",
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      <button type="button" onClick={() => onDuplicate(d.id)} className={styles.ghostBtn}>
                        Dupliquer
                      </button>

                      {kind === "facture" ? (
                        <button
                          type="button"
                          onClick={() => onMarkPaid(d.id, isPaid)}
                          className={styles.ghostBtn}
                          disabled={isPaid}
                          style={isPaid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                        >
                          Marquer payé
                        </button>
                      ) : (
                        <button type="button" onClick={() => onTransform(d.id)} className={styles.ghostBtn}>
                          → Facture
                        </button>
                      )}

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
