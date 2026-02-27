"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  mode?: "page" | "drawer";
  onOpenContact?: () => void; // ✅ pour ouvrir la fenêtre contact depuis le drawer
};

type SubData = {
  plan: "Trial" | "Starter" | "Accel" | "Speed";
  scheduled_plan?: "Trial" | "Starter" | "Accel" | "Speed" | null;
  status:
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "paused"
    | string;
  monthly_price_eur: number;
  start_date: string; // YYYY-MM-DD
  trial_start_at?: string | null;
  trial_end_at?: string | null;
  next_renewal_date?: string | null;
  // cancellation (synced by Stripe webhooks)
  cancel_requested_at?: string | null;
  end_date?: string | null; // YYYY-MM-DD
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
};
const SUB_SELECT =
  "plan,scheduled_plan,status,monthly_price_eur,start_date,trial_start_at,trial_end_at,next_renewal_date,cancel_requested_at,end_date,stripe_subscription_id,stripe_price_id";


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
  // Tolérance aux anciennes valeurs / fautes de frappe en base.
  if (raw === "trialing" || raw === "trailing" || raw === "essai") return "ESSAI";
  if (raw === "active") return "ACTIF";
  if (raw === "past_due" || raw === "unpaid") return "IMPAYÉ";
  if (raw === "paused") return "SUSPENDU";
  if (raw === "canceled" || raw === "cancelled") return "RÉSILIÉ";
  if (raw === "incomplete" || raw === "incomplete_expired") return "EN ATTENTE";
  return String(raw || "").toUpperCase() || "INCONNU";
}

function planLabel(plan: SubData["plan"]) {
  // Sécurité: certains anciens labels (ou valeurs inattendues) peuvent encore
  // arriver depuis des comptes / données historiques. On normalise.
  const raw = String(plan || "").trim();
  const normalized =
    raw === "Trial" || /^essai/i.test(raw)
      ? "Trial"
      : raw === "Starter" || /^d[ée]marrage/i.test(raw)
        ? "Starter"
        : raw === "Accel" || /^acc[ée]l[ée]ration/i.test(raw)
          ? "Accel"
          : raw === "Speed" || /^pleine vitesse/i.test(raw)
            ? "Speed"
            : raw;

  if (normalized === "Trial") return "Essai 30j";
  if (normalized === "Starter") return "Pack Démarrage";
  if (normalized === "Accel") return "Pack Accélération";
  if (normalized === "Speed") return "Pack Pleine vitesse";

  // Valeur inconnue: on évite d'afficher des trucs bizarres type "Procès".
  return "Essai 30j";
}

export default function AbonnementContent({ mode: _mode = "page", onOpenContact }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const checkoutState = searchParams.get("checkout"); // success | cancel | null
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubData | null>(null);
  const [err, setErr] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string>("");

// ✅ Refresh abonnement après actions Stripe (merge pour éviter d'écraser des champs)
const fetchSubscription = async () => {
  try {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const { data } = await supabase
      .from("subscriptions")
      .select(SUB_SELECT)
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setSub((prev) => ({ ...(prev ?? ({} as SubData)), ...(data as SubData) }));
    }
  } catch (e) {
    console.error("fetchSubscription error", e);
  }
};

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
          .select(SUB_SELECT)
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

  // ✅ Après un checkout Stripe, on repoll quelques secondes pour laisser le webhook mettre à jour la DB.
  useEffect(() => {
    if (checkoutState !== "success") return;
    let alive = true;
    const supabase = createClient();
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (!alive || tries > 8) {
        clearInterval(timer);
        return;
      }
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select(SUB_SELECT)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setSub((prev) => ({ ...(prev ?? ({} as SubData)), ...(data as SubData) }));
    }, 1500);

    return () => {
      alive = false;
      clearInterval(timer);
    };

// ✅ Nettoie l'URL après un retour Stripe (évite de garder ?checkout=success et de repoll inutilement)
useEffect(() => {
  if (!checkoutState) return;

  const t = window.setTimeout(() => {
    const current = new URLSearchParams(searchParams.toString());
    if (!current.has("checkout")) return;
    current.delete("checkout");

    const qs = current.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(nextUrl);
  }, 2500);

  return () => window.clearTimeout(t);
}, [checkoutState, pathname, router, searchParams]);

  }, [checkoutState]);

  const computed = useMemo(() => {
    if (!sub) return null;

    // Normalise plan pour la logique UI (compat anciennes valeurs).
    const rawPlan = String(sub.plan || "").trim();
    const planNormalized =
      rawPlan === "Trial" || /^essai/i.test(rawPlan)
        ? "Trial"
        : rawPlan === "Starter" || /^d[ée]marrage/i.test(rawPlan)
          ? "Starter"
          : rawPlan === "Accel" || /^acc[ée]l[ée]ration/i.test(rawPlan)
            ? "Accel"
            : rawPlan === "Speed" || /^pleine vitesse/i.test(rawPlan)
              ? "Speed"
              : rawPlan;

    const statusNorm = String(sub.status || "").toLowerCase();
    const isTrialPlan = planNormalized === "Trial" || statusNorm === "trialing" || statusNorm === "trailing" || statusNorm === "essai";

    const start = parseYMD(sub.start_date);
    const now = new Date();

    const lastAnniv = now < start ? start : lastMonthlyAnniversary(start, now);
    const renewal = sub.next_renewal_date ? parseYMD(sub.next_renewal_date) : addMonthsSafe(lastAnniv, 1);
    const endEst = addMonthsSafe(lastAnniv, 2);
    const trialEnd = sub.trial_end_at ? new Date(sub.trial_end_at) : addDays(start, 30);

    const cancelEnd = sub.end_date ? parseYMD(sub.end_date) : null;
    const cancellationScheduled = !!sub.cancel_requested_at && !!cancelEnd && cancelEnd.getTime() > now.getTime();

    const hasStripeSub = !!sub.stripe_subscription_id;

    // ✅ UX: au retour Stripe (?checkout=success), on considère l'abonnement comme "programmé" immédiatement,
    // même si le webhook n'a pas encore eu le temps d'écrire stripe_subscription_id en DB.
    const hasScheduledSubscription = hasStripeSub || checkoutState === "success";

    // Si l'utilisateur a déjà saisi ses moyens de paiement pendant l'essai,
    // on considère l'abonnement comme "programmé" (Stripe subscription existe mais statut = essai).
    const scheduledStart = trialEnd;

    const scheduledPlan = (sub.scheduled_plan || "Starter") as SubData["plan"];

    return {
      startLabel: frDate(start),
      trialEndLabel: frDate(trialEnd),
      scheduledStartLabel: frDate(scheduledStart),
      renewalLabel: frDate(renewal),
      endEstLabel: frDate(endEst),
      cancelEndLabel: cancelEnd ? frDate(cancelEnd) : null,
      cancellationScheduled,
      priceLabel: `${sub.monthly_price_eur} €`,
      statusText: isTrialPlan ? "ESSAI" : statusLabel(statusNorm),
      hasStripeSub: hasScheduledSubscription,
      scheduledPlanLabel: planLabel(scheduledPlan).replace("Pack ", ""),
      planNormalized,
    };
  }, [sub, checkoutState]);

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
        // Default plan is Starter. If you later add a pack picker UI, send { plan: 'Accel' } etc.
        body: JSON.stringify({ plan: "Starter" }),
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
      await fetchSubscription();
      setBillingBusy(false);
    } catch (e: unknown) {
      setBillingMsg(e instanceof Error ? e.message : "Erreur résiliation.");
      setBillingBusy(false);
    }
  };

  const doUncancel = async () => {
    const ok = window.confirm("Annuler la résiliation programmée ?");
    if (!ok) return;
    try {
      setBillingMsg("");
      setBillingBusy(true);
      const res = await fetch("/api/billing/uncancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Impossible d'annuler la résiliation.");
      setBillingMsg("Résiliation annulée.");
      await fetchSubscription();
      setBillingBusy(false);
    } catch (e: unknown) {
      setBillingMsg(e instanceof Error ? e.message : "Erreur.");
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
            <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4, lineHeight: 1.15 }}>{planLabel(sub.plan)}</div>

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
          style={computed?.planNormalized === "Trial" ? ({ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } as any) : undefined}
        >
          {computed?.planNormalized === "Trial" ? (
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

        {checkoutState === "success" ? (
          <p style={{ margin: "8px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
            ✅ Inscription confirmée. Votre abonnement démarrera à la fin de votre période d'essai de 30 jours.
          </p>
        ) : checkoutState === "cancel" ? (
          <p style={{ margin: "8px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
            ℹ️ Paiement annulé.
          </p>
        ) : null}

        {computed?.planNormalized === "Trial" ? (
          <>
            <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
              Vous êtes en période d’essai 30 jours.
            </p>

            {computed?.hasStripeSub ? (
              <>
                {checkoutState !== "success" ? (
                  <p style={{ margin: "8px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
                    ✅ Inscription confirmée. Votre abonnement démarrera à la fin de votre période d'essai de 30 jours.
                  </p>
                ) : null}

                {computed?.cancellationScheduled && computed?.cancelEndLabel ? (
                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid rgba(251, 191, 36, 0.25)",
                      background: "rgba(251, 191, 36, 0.10)",
                      borderRadius: 12,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Résiliation programmée</div>
                    <div style={{ opacity: 0.95, lineHeight: 1.45 }}>
                      Votre accès restera actif jusqu'au <strong>{computed.cancelEndLabel}</strong>.
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                      Vous pouvez annuler la résiliation tant que la date n'est pas atteinte.
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {!computed?.cancellationScheduled ? (
                    <button type="button" onClick={doCancel} style={dangerBtn} disabled={billingBusy}>
                      {billingBusy ? "Traitement…" : "Résilier (préavis 1 mois)"}
                    </button>
                  ) : (
                    <button type="button" onClick={doUncancel} style={primaryBtn} disabled={billingBusy}>
                      {billingBusy ? "Traitement…" : "Annuler ma résiliation"}
                    </button>
                  )}
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
              </>
            ) : (
              <>
                <p style={{ margin: "8px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
                  Pour continuer après l’essai, abonnez-vous. L’abonnement démarrera à la fin de l’essai.
                </p>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <button type="button" onClick={doCheckout} style={primaryBtn} disabled={billingBusy}>
                    S’abonner
                  </button>
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
              </>
            )}
          </>
        ) : sub.status === "active" ? (
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
      </div>
    </div>
  );
}