"use client";

import styles from "./adminOrders.module.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type OrderStatus = "pending" | "processed";
type OrderMethod = "EUR" | "UI";

type BoutiqueOrderRow = {
  id: string;
  created_at: string;
  user_id: string;
  account_email: string | null;
  admin_email: string | null;
  product_key: string;
  product_name: string;
  method: OrderMethod;
  amount_eur: number | null;
  amount_ui: number | null;
  status: OrderStatus;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(s: OrderStatus) {
  return s === "processed" ? "Traitée" : "En cours";
}

export default function AdminOrdersClient() {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<BoutiqueOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("pending");
  const [q, setQ] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        let query = supabase
          .from("boutique_orders")
          .select(
            "id,created_at,user_id,account_email,admin_email,product_key,product_name,method,amount_eur,amount_ui,status"
          )
          .order("created_at", { ascending: false })
          .limit(200);

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const needle = q.trim();
        if (needle) {
          // Search by email / user_id / product
          // Note: Supabase doesn't support OR across columns with the fluent API in a super clean way;
          // we use `or` filter string.
          const esc = needle.replaceAll(",", " ");
          query = query.or(
            `account_email.ilike.%${esc}%,admin_email.ilike.%${esc}%,user_id.ilike.%${esc}%,product_name.ilike.%${esc}%`
          );
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;

        setRows((data as any) ?? []);
      } catch (e: any) {
        setError(e?.message || "Impossible de charger les commandes");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [supabase, statusFilter, q]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const markProcessed = useCallback(
    async (id: string) => {
      setSavingId(id);
      setError(null);
      try {
        const { error: upErr } = await supabase
          .from("boutique_orders")
          .update({ status: "processed" })
          .eq("id", id);

        if (upErr) throw upErr;

        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "processed" } : r)));
      } catch (e: any) {
        setError(e?.message || "Impossible de mettre à jour le statut");
      } finally {
        setSavingId(null);
      }
    },
    [supabase]
  );

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Dashboard admin</div>
            <h1 className={styles.title}>Commandes Boutique</h1>
            <p className={styles.subtitle}>Toutes les commandes (users + staff). Filtre et traitement en 1 clic.</p>
          </div>

          <div className={styles.headerActions}>
            <Link className={styles.back} href="/dashboard">
              Retour
            </Link>
            <button
              type="button"
              onClick={() => load(true)}
              className={styles.refresh}
              disabled={refreshing}
            >
              {refreshing ? "Rafraîchissement…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.filters}>
            <label className={styles.label}>
              Statut
              <select
                className={styles.select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="pending">En cours</option>
                <option value="processed">Traitée</option>
                <option value="all">Toutes</option>
              </select>
            </label>

            <label className={styles.label}>
              Recherche
              <input
                className={styles.input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="email, user_id, produit…"
              />
            </label>

            <button type="button" className={styles.apply} onClick={() => load(true)}>
              Appliquer
            </button>
          </div>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loading}>Chargement…</div>
          ) : rows.length === 0 ? (
            <div className={styles.empty}>Aucune commande.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produit</th>
                    <th>Méthode</th>
                    <th>Montant</th>
                    <th>Statut</th>
                    <th>Compte</th>
                    <th>User ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const amount = r.method === "EUR" ? `${r.amount_eur ?? "—"} €` : `${r.amount_ui ?? "—"} UI`;
                    return (
                      <tr key={r.id}>
                        <td className={styles.mono}>{fmtDate(r.created_at)}</td>
                        <td>
                          <div className={styles.productName}>{r.product_name}</div>
                          <div className={styles.productKey}>{r.product_key}</div>
                        </td>
                        <td>
                          <span className={r.method === "EUR" ? styles.badgeEur : styles.badgeUi}>{r.method}</span>
                        </td>
                        <td className={styles.mono}>{amount}</td>
                        <td>
                          <span className={r.status === "processed" ? styles.badgeOk : styles.badgePending}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.email}>{r.account_email || "—"}</div>
                          <div className={styles.emailSub}>Admin: {r.admin_email || "—"}</div>
                        </td>
                        <td className={styles.mono}>{r.user_id}</td>
                        <td className={styles.actions}>
                          {r.status !== "processed" ? (
                            <button
                              type="button"
                              className={styles.process}
                              onClick={() => markProcessed(r.id)}
                              disabled={savingId === r.id}
                            >
                              {savingId === r.id ? "…" : "Marquer traitée"}
                            </button>
                          ) : (
                            <span className={styles.done}>✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.hint}>
          <div>
            <strong>Astuce :</strong> pour autoriser un compte staff, mets <span className={styles.mono}>profiles.role</span> à
            <span className={styles.mono}> staff</span> (ou <span className={styles.mono}>admin</span>).
          </div>
        </div>
      </div>
    </div>
  );
}
