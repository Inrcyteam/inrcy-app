"use client";

import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { BOUTIQUE_PRODUCTS, type BoutiqueProduct } from "@/lib/boutique/products";

type Props = {
  mode?: "drawer" | "page";
  onOpenInertia?: () => void;
};

type Method = "EUR" | "UI";

type OrderRow = {
  id: string;
  product_name: string;
  product_key: string;
  method: Method;
  status: "pending" | "processed";
  created_at: string;
};

const BOUTIQUE_TO = process.env.NEXT_PUBLIC_BOUTIQUE_EMAIL || "boutique@inrcy.com";

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function statusLabel(s: OrderRow["status"]) {
  return s === "processed" ? "Traitée" : "En cours";
}

export default function BoutiqueContent({ onOpenInertia }: Props) {
  const router = useRouter();
  const [uiBalance, setUiBalance] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [showUiHelp, setShowUiHelp] = useState<boolean>(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);

  const refreshOrders = async (uid?: string) => {
    const supabase = createClient();
    const userIdToUse = uid;
    if (!userIdToUse) return;

    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from("boutique_orders")
        .select("id, product_name, product_key, method, status, created_at")
        .eq("user_id", userIdToUse)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && Array.isArray(data)) {
        setOrders(data as any);
      }
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (!mounted) return;
          setUiBalance(0);
          return;
        }
        if (!mounted) return;
        setUserId(user.id);

        // role (si dispo)
        const profileRes = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        const role = String((profileRes.data as any)?.role ?? "").trim();
        setIsStaff(role === "staff" || role === "admin" || user.id === "670b527d-5e08-42b4-ba95-e58e812339eb");

        const balanceRes = await supabase
          .from("loyalty_balance")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();

        const bal = Number((balanceRes.data as any)?.balance ?? 0);
        if (!mounted) return;
        setUiBalance(Number.isFinite(bal) ? bal : 0);

        // Orders history
        await refreshOrders(user.id);
      } catch {
        if (!mounted) return;
        setUiBalance(0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const products: BoutiqueProduct[] = useMemo(() => BOUTIQUE_PRODUCTS, []);

  const canOrderUi = (p: BoutiqueProduct) => {
    if (uiBalance === null) return false;
    return uiBalance >= p.priceUi;
  };

  const placeOrder = async (p: BoutiqueProduct, method: Method) => {
    setNotice("");

    const priceLabel = method === "EUR" ? `${p.priceEur} €` : `${p.comboEur} € + ${p.priceUi} UI`;
    const ok = window.confirm(
      `Confirmer la commande ?\n\nProduit : ${p.title}\nMode : ${method === "EUR" ? "€" : "UI"}\nPrix : ${priceLabel}`
    );
    if (!ok) return;

    const sendId = `${p.key}:${method}`;
    setSendingKey(sendId);

    // Anti double-clic (client) + idempotency (server)
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const res = await fetch("/api/boutique/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey: p.key, method, idempotencyKey }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setNotice(getSimpleFrenchErrorMessage(json?.error, "La commande n’a pas pu être envoyée pour le moment."));
        return;
      }

      const shortId = String(json?.orderId ?? "").slice(0, 8);
      setNotice(`✅ Commande envoyée à ${BOUTIQUE_TO}${shortId ? ` (réf. #${shortId})` : ""}. Un email de confirmation vous a été envoyé.`);

      // Refresh balance (future: if UI gets debited)
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (user) {
        const balanceRes = await supabase
          .from("loyalty_balance")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();
        const bal = Number((balanceRes.data as any)?.balance ?? 0);
        setUiBalance(Number.isFinite(bal) ? bal : 0);

        await refreshOrders(user.id);
      }
    } finally {
      setSendingKey(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(56,189,248,0.10) 50%, rgba(15,23,42,0.55))",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 950, fontSize: 16 }}>Solde UI</div>
              <button
                type="button"
                onClick={() => setShowUiHelp((v) => !v)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Comprendre les UI"
              >
                ?
              </button>
            </div>
            <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, marginTop: 6 }}>
              Commandez en <b>€</b> (TTC) ou utilisez vos <b>UI</b> pour réduire le prix. 
            </div>
            {showUiHelp ? (
              <div
                style={{
                  position: "absolute",
                  top: 34,
                  left: 0,
                  zIndex: 3,
                  width: "min(320px, calc(100vw - 80px))",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(9,15,34,0.96)",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                  padding: 12,
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                Plus votre générateur iNrCy est actif, plus vous cumulez d’UI. Connectez davantage d’outils, gardez votre machine en mouvement et transformez cette inertie en économies sur des prestations premium.
              </div>
            ) : null}
          </div>

          <div style={{ textAlign: "right", minWidth: 140 }}>
            <div style={{ color: "rgba(255,255,255,0.96)", fontWeight: 950, fontSize: 22 }}>
              {uiBalance === null ? "…" : uiBalance}
            </div>
          </div>
        </div>
      </div>

      {/* Message d'info (en haut) */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.40)",
          borderRadius: 18,
          padding: 14,
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        En cliquant sur un bouton, une demande est envoyée automatiquement à <b>{BOUTIQUE_TO}</b>.
      </div>

      {notice ? (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(34,197,94,0.08)",
            borderRadius: 18,
            padding: 12,
            color: "rgba(255,255,255,0.9)",
            fontWeight: 700,
          }}
        >
          {notice}
        </div>
      ) : null}

      {/* Aller-retour vers Mon inertie */}
      <button
        type="button"
        onClick={() => (onOpenInertia ? onOpenInertia() : router.push("/dashboard?panel=inertie"))}
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(15,23,42,0.45)",
          borderRadius: 18,
          padding: 14,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: 15 }}>Voir mon inertie</div>
            <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 13, marginTop: 6 }}>
              Historique, Turbo UI et boosts de la semaine.
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(15,23,42,0.55)",
              color: "rgba(255,255,255,0.9)",
              fontWeight: 850,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            Ouvrir →
          </div>
        </div>
      </button>

      {/* Produits */}
      <div style={{ display: "grid", gap: 10 }}>
        {products.map((p) => (
          <div
            key={p.key}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15,23,42,0.45)",
              borderRadius: 18,
              padding: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: 15 }}>{p.title}</div>
                  {p.badge && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.78)",
                        fontSize: 12,
                        fontWeight: 750,
                      }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>
                <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 13, marginTop: 6 }}>{p.desc}</div>
              </div>

              <div style={{ textAlign: "right", maxWidth: 180 }}>
                <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 12, lineHeight: 1.35 }}>
                  Utilisez vos UI pour économiser jusqu’à {p.priceEur - p.comboEur} €.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => placeOrder(p, "EUR")}
                disabled={sendingKey !== null}
                style={{
                  flex: "1 1 160px",
                  borderRadius: 14,
                  padding: "10px 12px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(56,189,248,0.10)",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 850,
                  textAlign: "center",
                  cursor: sendingKey !== null ? "not-allowed" : "pointer",
                }}
              >
                {sendingKey === `${p.key}:EUR` ? "Envoi…" : `${p.priceEur} €`}
              </button>

              <button
                type="button"
                onClick={() => placeOrder(p, "UI")}
                disabled={sendingKey !== null || !canOrderUi(p)}
                title={!canOrderUi(p) ? "Solde UI insuffisant" : undefined}
                style={{
                  flex: "1 1 160px",
                  borderRadius: 14,
                  padding: "10px 12px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(168,85,247,0.12)",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 850,
                  textAlign: "center",
                  cursor: sendingKey !== null || !canOrderUi(p) ? "not-allowed" : "pointer",
                  opacity: canOrderUi(p) ? 1 : 0.45,
                }}
              >
                {sendingKey === `${p.key}:UI` ? "Envoi…" : `${p.comboEur} € + ${p.priceUi} UI`}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Historique des commandes */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.45)",
          borderRadius: 18,
          padding: 14,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: 15 }}>Historique des commandes</div>
            {isStaff ? (
              <a
                href="/dashboard/admin/commandes"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 12,
                  fontWeight: 850,
                  textDecoration: "none",
                }}
              >
                Admin commandes →
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => refreshOrders(userId ?? undefined)}
            disabled={ordersLoading || !userId}
            style={{
              borderRadius: 999,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(15,23,42,0.55)",
              color: "rgba(255,255,255,0.9)",
              fontWeight: 850,
              fontSize: 12,
              cursor: ordersLoading || !userId ? "not-allowed" : "pointer",
              opacity: ordersLoading || !userId ? 0.6 : 1,
            }}
          >
            {ordersLoading ? "Actualisation…" : "Rafraîchir"}
          </button>
        </div>

        {!orders.length ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Aucune commande pour le moment.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {orders.map((o) => (
              <div
                key={o.id}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(2,6,23,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 220 }}>
                  <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 850, fontSize: 13 }}>
                    {o.product_name}
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }}> — #{o.id.slice(0, 8)}</span>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, marginTop: 6 }}>{formatDate(o.created_at)}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.80)",
                      fontSize: 12,
                      fontWeight: 850,
                    }}
                  >
                    {o.method === "EUR" ? "€" : "UI"}
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: o.status === "processed" ? "rgba(34,197,94,0.10)" : "rgba(251,191,36,0.10)",
                      color: "rgba(255,255,255,0.90)",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {statusLabel(o.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 1.4 }}>
          Les commandes passent en <b>Traitée</b> quand l'équipe iNrCy les valide.
        </div>
      </div>
    </div>
  );
}