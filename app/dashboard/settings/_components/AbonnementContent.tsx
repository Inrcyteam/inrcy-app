"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Props = {
  mode?: "page" | "drawer";
  onOpenContact?: () => void; // ✅ pour ouvrir la fenêtre contact depuis le drawer
};

type SubData = {
  plan: "Démarrage" | "Accélération" | "Pleine vitesse";
  status: "essai" | "actif" | "suspendu" | "résilié";
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
  let y = now.getFullYear();
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
function nextMonthlyAnniversary(start: Date, now: Date) {
  const day = start.getDate();
  let y = now.getFullYear();
  let m = now.getMonth();

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

function statusLabel(raw: string) {
  if (raw === "actif" || raw === "active") return "ACTIF";
  if (raw === "essai" || raw === "trial") return "ESSAI";
  if (raw === "suspendu" || raw === "paused") return "SUSPENDU";
  return "RÉSILIÉ";
}

export default function AbonnementContent({ mode = "page", onOpenContact }: Props) {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubData | null>(null);
  const [err, setErr] = useState("");

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
      } catch (e: any) {
        setErr(e?.message || "Erreur inconnue.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const computed = useMemo(() => {
  if (!sub) return null;

  const start = parseYMD(sub.start_date);
  const now = new Date();

  // ✅ lastAnniv = dernière date d'anniversaire <= now
  // si l'abonnement n'a pas encore commencé (now < start) => on prend start
  const lastAnniv = now < start ? start : lastMonthlyAnniversary(start, now);

  // ✅ Renouvellement = anniversaire suivant du cycle en cours
  const renewal = addMonthsSafe(lastAnniv, 1);

  // ✅ Fin prévisionnelle = dernier anniversaire + 2 mois
  const endEst = addMonthsSafe(lastAnniv, 2);

  return {
    startLabel: frDate(start),
    renewalLabel: frDate(renewal),
    endEstLabel: frDate(endEst),
    priceLabel: `${sub.monthly_price_eur} €`,
    statusText: statusLabel(sub.status),
  };
}, [sub]);

  // ✅ Palette douce iNrCy (dégradé)
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
    minWidth: 0, // ✅ évite débordement dans grid
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

  const linkBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    color: "rgba(255,255,255,0.95)",
    textDecoration: "underline",
    cursor: "pointer",
    fontWeight: 800,
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
      {/* ✅ CSS responsive uniquement pour la grille Dates */}
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

      {/* HERO coloré */}
      <div style={{ ...card, ...shell, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 900, letterSpacing: 0.4 }}>
              PACK
            </div>
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, lineHeight: 1.15 }}>
              {sub.plan}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span style={badge}>SANS ENGAGEMENT</span>
              <span style={badge}>MENSUEL</span>
              <span style={badge}>{computed.statusText}</span>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ opacity: 0.85, fontSize: 12, fontWeight: 900, letterSpacing: 0.4 }}>
              PRIX
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, marginTop: 4, lineHeight: 1 }}>
              {computed.priceLabel}
            </div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>HT par mois</div>
          </div>
        </div>
      </div>

      {/* DATES */}
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Dates</h2>

        <div className="datesGrid">
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
  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.3 }}>
    Préavis inclus (1 mois)</div>
          </div>
        </div>
      </div>

      {/* MODIFS */}
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Modifier / Résilier</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
          Les modifications ou résiliations d’abonnement se font en{" "}
          {onOpenContact ? (
            <button type="button" onClick={onOpenContact} style={linkBtn}>
              nous contactant
            </button>
          ) : (
            <span style={{ fontWeight: 900, textDecoration: "underline" }}>nous contactant</span>
          )}
          .
        </p>

        <div style={{ marginTop: 12 }}>
          <a href="https://inrcy.com/nos-packs/" target="_blank" rel="noreferrer" style={primaryBtn}>
            Voir nos packs
          </a>
        </div>
      </div>
    </div>
  );
}
