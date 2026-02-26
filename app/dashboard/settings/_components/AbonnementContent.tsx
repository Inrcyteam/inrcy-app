"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Props = {
  mode?: "page" | "drawer";
  onOpenContact?: () => void; // ✅ pour ouvrir la fenêtre contact depuis le drawer
};

type SubData = {
  plan: "Essai 30j" | "Démarrage" | "Accélération" | "Pleine vitesse";
  status: "actif" | "suspendu" | "résilié" | string;
  monthly_price_eur: number;
  start_date: string; // YYYY-MM-DD
};

function frDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// ✅ dernière date d’anniversaire mensuelle (<= aujourd’hui)
function lastMonthlyAnniversary(start: Date, now: Date) {
  const day = start.getDate();
  const y = now.getFullYear();
  let m = now.getMonth();

  let cand = new Date(y, m, day);

  // si le jour n’existe pas (ex 31), JS décale : on prend le dernier jour du mois
  if (cand.getMonth() !== m) {
    cand = new Date(y, m + 1, 0);
  }

  if (cand > now) {
    m -= 1;
    cand = new Date(y, m, day);
    const normalizedMonth = ((m % 12) + 12) % 12;
    if (cand.getMonth() !== normalizedMonth) {
      cand = new Date(y, m + 1, 0);
    }
  }

  return cand;
}

// ✅ prochaine date d’anniversaire mensuelle ( > aujourd’hui )
function _nextMonthlyAnniversary(start: Date, now: Date) {
  const day = start.getDate();
  const y = now.getFullYear();
  const m = now.getMonth();

  let cand = new Date(y, m, day);

  // jour inexistant => dernier jour du mois
  if (cand.getMonth() !== m) cand = new Date(y, m + 1, 0);

  // si on est déjà passé (ou pile), on prend le mois suivant
  if (cand <= now) {
    cand = new Date(y, m + 1, day);
    const targetMonth = (m + 1) % 12;
    if (cand.getMonth() !== targetMonth) cand = new Date(y, m + 2, 0);
  }

  return cand;
}

function addMonthsSafe(date: Date, months: number) {
  const d = date.getDate();
  const res = new Date(date);
  res.setMonth(res.getMonth() + months);
  if (res.getDate() !== d) res.setDate(0);
  return res;
}

function addDays(date: Date, days: number) {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  return res;
}

function statusLabel(raw: string) {
  if (raw === "actif" || raw === "active") return "ACTIF";
  if (raw === "suspendu" || raw === "paused" || raw === "past_due") return "SUSPENDU";
  if (raw === "résilié" || raw === "canceled" || raw === "cancelled") return "RÉSILIÉ";
  return String(raw || "").toUpperCase() || "INCONNU";
}

export default function AbonnementContent({ mode: _mode = "page", onOpenContact }: Props) {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubData | null>(null);
  const [err, setErr] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setErr("");
      setLoading(true);

      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) {
          setSub(null);
          return;
        }

        const { data, error } = await supabase
          .from("subscriptions")
          .select("plan,status,monthly_price_eur,start_date")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw new Error(error.message);

        if (!data) {
          setSub(null);
          return;
        }

        setSub(data as SubData);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Erreur inconnue.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const computed = useMemo(() => {
    if (!sub) return null;

    const isTrialPlan = sub.plan === "Essai 30j";

    const start = parseYMD(sub.start_date);
    const now = new Date();

    const lastAnniv = now < start ? start : lastMonthlyAnniversary(start, now);
    const renewal = addMonthsSafe(lastAnniv, 1);
    const endEst = addMonthsSafe(lastAnniv, 2);
    const trialEnd = addDays(start, 30);

    return {
      startLabel: frDate(start),
      trialEndLabel: frDate(trialEnd),
      renewalLabel: frDate(renewal),
      endEstLabel: frDate(endEst),
      priceLabel: `${sub.monthly_price_eur} €`,
      statusText: isTrialPlan ? "ESSAI" : statusLabel(sub.status),
    };
  }, [sub]);

  const shell: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(135deg, rgba(255, 77, 166, 0.14), rgba(97, 87, 255, 0.10) 45%, rgba(0, 200, 255, 0.08))",
  };

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const badge: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background:
      "linear-gradient(135deg, rgba(255, 77, 166, 0.22), rgba(97, 87, 255, 0.16), rgba(0, 200, 255, 0.12))",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    whiteSpace: "nowrap",
  };

  const miniBox: React.CSSProperties = {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    minWidth: 0,
  };

  const primaryBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(135deg, rgba(255, 77, 166, 0.35), rgba(97, 87, 255, 0.28), rgba(0, 200, 255, 0.22))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  };

  const ghostBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    opacity: billingBusy ? 0.7 : 1,
    pointerEvents: billingBusy ? "none" : "auto",
  };

  const dangerBtn: React.CSSProperties = {
    ...ghostBtn,
    border: "1px solid rgba(255, 120, 120, 0.35)",
    background: "rgba(255, 80, 80, 0.10)",
  };

  const doCheckout = async () => {
    try {
      setBillingMsg("");
      setBillingBusy(true);
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.error || "Impossible de démarrer le paiement.");
      window.location.href = json.url;
    } catch (e: unknown) {
      setBillingMsg(e instanceof Error ? e.message : "Erreur paiement.");
      setBillingBusy(false);
    }
  };

  const doCancel = async () => {
    const ok = window.confirm("Confirmer la résiliation ? (préavis 1 mois)");
    if (!ok) return;
    try {
      setBillingMsg("");
      setBillingBusy(true);
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Impossible de résilier.");
      setBillingMsg("Résiliation programmée (préavis 1 mois).");
      window.location.reload();
    } catch (e: unknown) {
      setBillingMsg(e instanceof Error ? e.message : "Erreur résiliation.");
      setBillingBusy(false);
    }
  };

  if (loading) return <div style={{ opacity: 0.85 }}>Chargement…</div>;
  if (err) return <div style={{ opacity: 0.9 }}>⚠️ {err}</div>;

  if (!sub || !computed) {
    return (
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Mon abonnement</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Ton abonnement n’est pas encore renseigné. Contacte iNrCy si besoin.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{`
        .datesGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        @media (max-width: 520px) {
          .datesGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={{ ...card, ...shell, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 900, letterSpacing: 0.4 }}>PACK</div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, lineHeight: 1.15 }}>{sub.plan}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span style={badge}>SANS ENGAGEMENT</span>
              <span style={badge}>MENSUEL</span>
              <span style={badge}>{computed.statusText}</span>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 900, letterSpacing: 0.4 }}>PRIX</div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4, lineHeight: 1 }}>{computed.priceLabel}</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>HT par mois</div>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Dates</h2>

        <div
          className="datesGrid"
          style={sub.plan === "Essai 30j" ? ({ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } as any) : undefined}
        >
          {sub.plan === "Essai 30j" ? (
            <>
              <div style={miniBox}>
                <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 900 }}>Inscription</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{computed.startLabel}</div>
              </div>

              <div style={miniBox}>
                <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 900 }}>Fin de période d’essai</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{computed.trialEndLabel}</div>
              </div>
            </>
          ) : (
            <>
              <div style={miniBox}>
                <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 900 }}>Actualisation</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{computed.startLabel}</div>
              </div>

              <div style={miniBox}>
                <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 900 }}>Renouvellement</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{computed.renewalLabel}</div>
              </div>

              <div style={miniBox}>
                <div style={{ opacity: 0.8, fontSize: 12, fontWeight: 900 }}>Fin prévisionnelle</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>{computed.endEstLabel}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.3 }}>Préavis inclus (1 mois)</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Modifier / Résilier</h2>

        {sub.plan === "Essai 30j" ? (
          <>
            <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
              Tu es en période d’essai 30 jours. Pour continuer après l’essai, abonne-toi.
            </p>
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={doCheckout} style={primaryBtn} disabled={billingBusy}>
                S’abonner
              </button>
            </div>
          </>
        ) : sub.status === "actif" ? (
          <>
            <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
              Gère ton abonnement directement ici.
            </p>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <a href="https://inrcy.com/nos-packs/" target="_blank" rel="noreferrer" style={ghostBtn}>
                Modifier mon pack
              </a>
              <button type="button" onClick={doCancel} style={dangerBtn} disabled={billingBusy}>
                Résilier (préavis 1 mois)
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
            Ton abonnement est actuellement {computed.statusText.toLowerCase()}.
          </p>
        )}

        {billingMsg ? (
          <p style={{ margin: "10px 0 0", opacity: 0.9, lineHeight: 1.35 }}>⚠️ {billingMsg}</p>
        ) : null}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <a href="https://inrcy.com/nos-packs/" target="_blank" rel="noreferrer" style={ghostBtn}>
            Voir nos packs
          </a>
          {onOpenContact ? (
            <button type="button" onClick={onOpenContact} style={ghostBtn}>
              Contactez-nous
            </button>
          ) : (
            <a href="https://inrcy.com/contact/" target="_blank" rel="noreferrer" style={ghostBtn}>
              Contactez-nous
            </a>
          )}
        </div>
      </div>
    </div>
  );
}