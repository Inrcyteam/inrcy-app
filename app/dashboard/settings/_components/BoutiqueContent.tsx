"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { BOUTIQUE_PRODUCTS, type BoutiqueProduct } from "@/lib/boutique/products";

type Props = {
  mode?: "drawer" | "page";
  onOpenInertia?: () => void;
};

type Method = "EUR" | "UI";

const BOUTIQUE_TO = process.env.NEXT_PUBLIC_BOUTIQUE_EMAIL || "boutique@inrcy.com";

export default function BoutiqueContent({ onOpenInertia }: Props) {
  const router = useRouter();
  const [uiBalance, setUiBalance] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

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
        setUserEmail(user.email ?? null);
        setUserId(user.id);

        // email admin = contact_email du profil (si dispo)
        const profileRes = await supabase
          .from("profiles")
          .select("contact_email")
          .eq("user_id", user.id)
          .maybeSingle();
        const admin = String((profileRes.data as any)?.contact_email ?? "").trim();
        setAdminEmail(admin || null);

        const balanceRes = await supabase
          .from("loyalty_balance")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();

        const bal = Number((balanceRes.data as any)?.balance ?? 0);
        if (!mounted) return;
        setUiBalance(Number.isFinite(bal) ? bal : 0);
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

    const priceLabel = method === "EUR" ? `${p.priceEur} €` : `${p.priceUi} UI`;
    const ok = window.confirm(`Confirmer la commande ?\n\nProduit : ${p.title}\nMode : ${method === "EUR" ? "€" : "UI"}\nPrix : ${priceLabel}`);
    if (!ok) return;

    const sendId = `${p.key}:${method}`;
    setSendingKey(sendId);
    try {
      const res = await fetch("/api/boutique/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productKey: p.key, method }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setNotice(json?.error || "Erreur lors de l'envoi de la commande.");
        return;
      }
      setNotice(`✅ Commande envoyée à ${BOUTIQUE_TO}`);
      // refresh balance in case of server-side rules later
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
          <div>
            <div style={{ color: "rgba(255,255,255,0.94)", fontWeight: 950, fontSize: 16 }}>
              Solde UI
            </div>
            <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, marginTop: 6 }}>
              Commandez en <b>€</b> ou échangez vos <b>UI</b>.
            </div>
          </div>

          <div style={{ textAlign: "right", minWidth: 140 }}>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Solde UI</div>
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
        En cliquant sur <b>Commander</b>, une demande est envoyée automatiquement à <b>{BOUTIQUE_TO}</b>.
        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
          Compte : {userEmail ?? "…"} — Admin : {adminEmail ?? "…"} — ID : {userId ?? "…"}
        </div>
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
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: 15 }}>
              Voir mon inertie
            </div>
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

      <div
        style={{
          display: "grid",
          gap: 10,
        }}
      >
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

              <div style={{ textAlign: "right" }}>
                <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 12 }}>Prix</div>
                <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900 }}>{p.priceEur} €</div>
                <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 800, fontSize: 13 }}>{p.priceUi} UI</div>
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
                {sendingKey === `${p.key}:EUR` ? "Envoi…" : "Commander en €"}
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
                {sendingKey === `${p.key}:UI` ? "Envoi…" : "Commander en UI"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
