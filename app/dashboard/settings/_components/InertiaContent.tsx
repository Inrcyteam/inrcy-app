"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { InertiaSnapshot } from "@/lib/loyalty/inertia";

type Props = {
  mode?: "drawer" | "page";
  snapshot: InertiaSnapshot;
  onOpenBoutique?: () => void;
};

type LoyaltyEvent = {
  id: string;
  created_at: string;
  action_key: string;
  label: string | null;
  amount: number;
};

export default function InertiaContent({ snapshot, onOpenBoutique }: Props) {
  const [uiBalance, setUiBalance] = useState<number>(0);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(true);

  // ⚠️ Prévu Supabase :
  // - loyalty_balance (user_id, balance)
  // - loyalty_ledger (id, user_id, action_key, source_id, amount, label, meta, created_at)
  //
  // Tant que les tables n'existent pas, on ne casse rien.

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          if (!mounted) return;
          setLoading(false);
          return;
        }

        const balanceRes = await supabase
          .from("loyalty_balance")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();

        // Si table absente -> erreur -> fallback silencieux
        if ((balanceRes as any)?.error) throw (balanceRes as any).error;

        const balance = Number((balanceRes.data as any)?.balance ?? 0);

        const eventsRes = await supabase
          .from("loyalty_ledger")
          .select("id,created_at,action_key,label,amount")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if ((eventsRes as any)?.error) throw (eventsRes as any).error;

        if (!mounted) return;
        setUiBalance(balance);
        setEvents((eventsRes.data as any) ?? []);
        setLoading(false);
      } catch {
        if (!mounted) return;
        setSupabaseReady(false);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const weekStart = useMemo(() => {
    // Lundi 00:00 (ISO-ish) en local
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay(); // 0=dim
    const diff = (day === 0 ? -6 : 1) - day; // vers lundi
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const boosts = useMemo(() => {
    const inWeek = (e: LoyaltyEvent) => new Date(e.created_at) >= weekStart;
    const didActu = events.some((e) => inWeek(e) && e.action_key === "create_actu");
    const didFeature = events.some((e) => inWeek(e) && e.action_key === "weekly_feature_use");
    return [
      {
        key: "create_actu",
        title: "Créer une actu",
        subtitle: "+10 UI — 1 fois par semaine",
        done: didActu,
      },
      {
        key: "weekly_feature_use",
        title: "Utiliser Booster / Fidéliser",
        subtitle: "+10 UI — 1 fois par semaine",
        done: didFeature,
      },
    ];
  }, [events, weekStart]);

  const labelFromAction = useMemo(() => {
    return {
      account_open: "Ouverture du compte",
      profile_complete: "Profil complété",
      activity_complete: "Activité complétée",
      create_actu: "Actu créée",
      weekly_feature_use: "Utilisation Booster/Fidéliser",
      monthly_seniority: "Ancienneté",
    } as Record<string, string>;
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.55)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800, fontSize: 16 }}>
              Unités d&apos;Inertie
            </div>
            <div style={{ color: "rgba(255,255,255,0.64)", fontSize: 13, marginTop: 6 }}>
              Turbo UI : <b>×{snapshot.multiplier}</b> — {snapshot.connectedCount}/{snapshot.totalChannels} canaux
            </div>
          </div>

          <div
            style={{
              minWidth: 120,
              textAlign: "right",
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Solde UI</div>
            <div style={{ color: "rgba(255,255,255,0.95)", fontWeight: 900, fontSize: 22 }}>
              {loading ? "…" : uiBalance}
            </div>
          </div>
        </div>

      </div>

      {/* Bouton Boutique */}
      <button
        type="button"
        onClick={onOpenBoutique}
        style={{
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(135deg, rgba(168,85,247,0.16), rgba(56,189,248,0.10) 55%, rgba(34,197,94,0.08))",
          borderRadius: 18,
          padding: 14,
          textAlign: "left",
          cursor: onOpenBoutique ? "pointer" : "default",
        }}
        aria-disabled={!onOpenBoutique}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.92)", fontWeight: 900, fontSize: 15 }}>
              Boutique
            </div>
            <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 13, marginTop: 6 }}>
              Dépensez vos UI ou commandez en € (print, logo, ads…).
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
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.45)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800, marginBottom: 10 }}>
          Détail du multiplicateur
        </div>

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          {snapshot.breakdown.map((b) => (
            <div
              key={b.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: b.connected ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.88)", fontWeight: 650 }}>
                {b.label}
              </div>
              <div style={{ color: "rgba(255,255,255,0.72)", fontWeight: 750 }}>
                {b.connected ? `+${b.bonus}` : ""}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          Plafond : ×{snapshot.maxMultiplier}
        </div>
      </div>

      {/* Boosts (semaine) */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.40)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800, marginBottom: 10 }}>
          Boosts à faire cette semaine
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {boosts.map((b) => (
            <div
              key={b.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: b.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.86)" }}>
                <div style={{ fontWeight: 750 }}>{b.title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{b.subtitle}</div>
              </div>
              <div
                style={{
                  fontWeight: 900,
                  color: b.done ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)",
                  whiteSpace: "nowrap",
                }}
              >
                {b.done ? "✅ Fait" : "À faire"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          Réinitialisation automatique chaque lundi.
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(15,23,42,0.40)",
          borderRadius: 18,
          padding: 14,
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800, marginBottom: 10 }}>
          Historique
        </div>

        {!supabaseReady ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Supabase : tables fidélité non activées (à brancher).
          </div>
        ) : loading ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>Chargement…</div>
        ) : events.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Aucun mouvement pour le moment.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {events.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.82)" }}>
                  <div style={{ fontWeight: 650 }}>{e.label ?? labelFromAction[e.action_key] ?? "Inertie"}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.88)", fontWeight: 850 }}>
                  {e.amount > 0 ? `+${e.amount}` : e.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}