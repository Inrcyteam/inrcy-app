"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Props = {
  mode?: "drawer" | "page";
  onOpenInertia?: () => void;
};

type Product = {
  key: string;
  title: string;
  desc: string;
  priceEur: number;
  priceUi: number;
  badge?: string;
};

export default function BoutiqueContent({ onOpenInertia }: Props) {
  const router = useRouter();
  const [uiBalance, setUiBalance] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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

  const products: Product[] = useMemo(
    () => [
      {
        key: "cartes_visite",
        title: "Cartes de visite",
        desc: "Design pro + fichiers prêts à imprimer.",
        priceEur: 59,
        priceUi: 590,
        badge: "Print",
      },
      {
        key: "flyers",
        title: "Flyers",
        desc: "Flyer A5/A6 : design + export HD.",
        priceEur: 79,
        priceUi: 790,
        badge: "Print",
      },
      {
        key: "logo",
        title: "Logo",
        desc: "Logo simple + déclinaisons (clair/sombre).",
        priceEur: 149,
        priceUi: 1490,
        badge: "Branding",
      },
      {
        key: "site_creation",
        title: "Création site internet",
        desc: "Site vitrine rapide, propre et optimisé (sur base iNrCy).",
        priceEur: 2500,
        priceUi: 25000,
        badge: "Web",
      },
      {
        key: "site_refonte",
        title: "Refonte site internet",
        desc: "Modernisation + structure SEO + performance.",
        priceEur: 1500,
        priceUi: 15000,
        badge: "Web",
      },
      {
        key: "ads",
        title: "Campagnes Ads",
        desc: "Set-up campagne + tracking + optimisation (budget pub non inclus).",
        priceEur: 290,
        priceUi: 2900,
        badge: "Acquisition",
      },
      {
        key: "facebook_page",
        title: "Création page Facebook",
        desc: "Page + visuels + réglages essentiels.",
        priceEur: 89,
        priceUi: 890,
        badge: "Social",
      },
      {
        key: "instagram_page",
        title: "Création page Instagram",
        desc: "Compte pro + bio + visuels + highlights.",
        priceEur: 89,
        priceUi: 890,
        badge: "Social",
      },
      {
        key: "linkedin_page",
        title: "Création page LinkedIn",
        desc: "Page entreprise + branding + sections.",
        priceEur: 99,
        priceUi: 990,
        badge: "Social",
      },
      {
        key: "gmb",
        title: "Création Google Business",
        desc: "Fiche optimisée : catégories, description, services, photos.",
        priceEur: 129,
        priceUi: 1290,
        badge: "Local",
      },
    ]
      // ✅ ordre croissant (prix €)
      .slice()
      .sort((a, b) => a.priceEur - b.priceEur),
    []
  );

  const buildMailto = (p: Product, method: "EUR" | "UI") => {
    const subject = `Commande Boutique iNrCy — ${p.title} (${method})`;
    const lines = [
      `Bonjour iNrCy,`,
      ``,
      `Je souhaite commander : ${p.title}`,
      `Mode de paiement : ${method === "EUR" ? "€" : "UI"}`,
      `Prix : ${method === "EUR" ? `${p.priceEur} €` : `${p.priceUi} UI`}`, 
      ``,
      `---`,
      `Compte :`,
      `Email : ${userEmail ?? "(non disponible)"}`,
      `User ID : ${userId ?? "(non disponible)"}`,
      `Solde UI (indicatif) : ${uiBalance ?? "…"}`,
      ``,
      `Merci,`,
    ];
    const body = lines.join("\n");
    return `mailto:contact@inrcy.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
              Boutique iNrCy
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
              <a
                href={buildMailto(p, "EUR")}
                style={{
                  flex: "1 1 160px",
                  textDecoration: "none",
                  borderRadius: 14,
                  padding: "10px 12px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(56,189,248,0.10)",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 850,
                  textAlign: "center",
                }}
              >
                Commander en €
              </a>

              <a
                href={buildMailto(p, "UI")}
                style={{
                  flex: "1 1 160px",
                  textDecoration: "none",
                  borderRadius: 14,
                  padding: "10px 12px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(168,85,247,0.12)",
                  color: "rgba(255,255,255,0.92)",
                  fontWeight: 850,
                  textAlign: "center",
                }}
              >
                Commander en UI
              </a>
            </div>
          </div>
        ))}
      </div>

      <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, padding: "0 4px" }}>
        Les commandes ouvrent un email pré-rempli vers <b>contact@inrcy.com</b>. On traite ça dans la foulée.
      </div>
    </div>
  );
}
