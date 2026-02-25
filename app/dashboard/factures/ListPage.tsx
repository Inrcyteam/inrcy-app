"use client";

import { useEffect, useMemo, useState } from "react";
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

function ListPage({ kind, title, ctaLabel, ctaHref }: Props) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRecord[]>([]);

  const refresh = () => setDocs(loadDocs().filter((d) => d.kind === kind));

  useEffect(() => {
    refresh();
  }, [kind]);

  const rows = useMemo(() => {
    return docs.map((d) => {
      const totals = calcTotalsWithDiscount(d.lines, !!d.vatDispense, d.discountKind, d.discountValue);
      return { ...d, totals };
    });
  }, [docs]);

  const onDuplicate = (id: string) => {
    duplicateDoc(id);
    refresh();
  };

  const onMarkPaid = (id: string) => {
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
        <button
          type="button"
          onClick={() => router.push(ctaHref)}
          className={styles.primaryBtn}
        >
          {ctaLabel}
        </button>
      </div>

      <div className={styles.tableCard}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            Aucun document pour l’instant.
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => router.push(ctaHref)}
                className={styles.primaryBtn}
              >
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
                <th style={{ width: 280 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 650 }}>{d.number}</td>
                  <td>{d.clientName}</td>
                  <td>{new Date(d.createdAtISO).toLocaleDateString("fr-FR")}</td>
                  <td>{d.status}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatEuro((d.totals as any).totalDue ?? d.totals.totalTTC)}
                  </td>
                  <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => onDuplicate(d.id)} className={styles.ghostBtn}>
                      Dupliquer
                    </button>

                    {kind === "facture" ? (
                      <button
                        type="button"
                        onClick={() => onMarkPaid(d.id)}
                        className={styles.ghostBtn}
                        disabled={d.status === "paye"}
                        style={d.status === "paye" ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default ListPage;
