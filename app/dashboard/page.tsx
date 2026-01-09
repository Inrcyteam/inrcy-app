"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = { email?: string | null };

type BubbleSeed = {
  key: string;
  label: string;
  desc: string;
  href?: string;
  icon: string;
  color: string;
};

type BubbleState = BubbleSeed & {
  x: number; // px (dans le conteneur)
  y: number; // px
  vx: number; // px/s
  vy: number; // px/s
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  // Taille du champ (pour SVG + collisions)
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [fieldSize, setFieldSize] = useState({ w: 860, h: 620 });

  // Bubbles animées
  const bubblesRef = useRef<BubbleState[]>([]);
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);

  // ---- Auth ----
  useEffect(() => {
    let ignore = false;

    async function boot() {
      const { data, error } = await supabase.auth.getUser();
      if (!data?.user || error) {
        router.replace("/login");
        return;
      }
      if (!ignore) {
        setUser({ email: data.user.email });
        setLoading(false);
      }
    }

    boot();
    return () => {
      ignore = true;
    };
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // ---- Tes 9 modules ----
  const seed: BubbleSeed[] = useMemo(
    () => [
      { key: "facebook", label: "Facebook", desc: "Meta Pages", icon: "📘", color: "#3b82f6", href: "/dashboard/facebook" },
      { key: "site-inrcy", label: "Site iNrCy", desc: "Pages + tracking", icon: "🧩", color: "#a855f7", href: "/dashboard/site" },
      { key: "gmb", label: "GMB", desc: "Business Profile", icon: "📍", color: "#22c55e", href: "/dashboard/gmb" },
      { key: "mails", label: "Mails", desc: "Inbox & relances", icon: "✉️", color: "#f97316", href: "/dashboard/messages" },
      { key: "publier", label: "Publier", desc: "Posts multi-canaux", icon: "🛰️", color: "#06b6d4", href: "/dashboard/publish" },
      { key: "houzz", label: "Houzz", desc: "Profil & posts", icon: "🏠", color: "#10b981" },
      { key: "site-web", label: "Site web", desc: "Votre site client", icon: "🌐", color: "#eab308" },
      { key: "stats", label: "Stats", desc: "Clics, appels, leads", icon: "📈", color: "#ef4444", href: "/dashboard/stats" },
      { key: "annuaire", label: "Annuaire", desc: "Citations / NAP", icon: "📒", color: "#8b5cf6" },
    ],
    []
  );

  function onBubbleClick(b: BubbleSeed) {
    if (b.href) router.push(b.href);
    else alert(`Bientôt : ${b.label}`);
  }

  // ---- Observe la taille du champ ----
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setFieldSize({
        w: Math.max(320, Math.round(r.width)),
        h: Math.max(320, Math.round(r.height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Init positions (une fois qu'on a une taille) ----
  useEffect(() => {
    const { w, h } = fieldSize;
    const cx = w / 2;
    const cy = h / 2;

    // rayon plus grand => bulles plus espacées
    const baseR = Math.min(w, h) * 0.36;

    const init: BubbleState[] = seed.map((s, i) => {
      const a = (i / seed.length) * Math.PI * 2 + rand(-0.22, 0.22);
      const r = baseR + rand(-18, 18);

      return {
        ...s,
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: rand(-12, 12),
        vy: rand(-12, 12),
      };
    });

    bubblesRef.current = init;
    setBubbles(init);
  }, [seed, fieldSize.w, fieldSize.h]); // recalcul si le champ change beaucoup

  // ---- “moteur” anti-chevauchement + errance ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accum = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.035, (now - last) / 1000); // clamp
      last = now;
      accum += dt;

      const { w, h } = fieldSize;
      const cx = w / 2;
      const cy = h / 2;

      // Réglages
      const bubbleR = 64; // rayon visuel approximatif (bulle)
      const minDist = bubbleR * 2 + 22; // distance mini entre centres
      const pad = 16;

      const coreR = 95; // “zone” noyau
      const coreKeepout = coreR + bubbleR + 18; // interdit d’être trop près du noyau

      const arr = bubblesRef.current;
      if (arr.length) {
        // 1) Drift doux (bruit)
        for (const b of arr) {
          b.vx += rand(-18, 18) * dt;
          b.vy += rand(-18, 18) * dt;

          // limite vitesse
          b.vx = Math.max(-55, Math.min(55, b.vx));
          b.vy = Math.max(-55, Math.min(55, b.vy));
        }

        // 2) Repulsion bulles-bulles
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i];
            const b = arr[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;

            if (d < minDist) {
              const push = (minDist - d) * 0.5;
              const nx = dx / d;
              const ny = dy / d;

              a.x -= nx * push;
              a.y -= ny * push;
              b.x += nx * push;
              b.y += ny * push;

              // petite impulsion
              a.vx -= nx * push * 1.5;
              a.vy -= ny * push * 1.5;
              b.vx += nx * push * 1.5;
              b.vy += ny * push * 1.5;
            }
          }
        }

        // 3) Repulsion noyau (les bulles peuvent “passer derrière”, mais pas traverser le centre)
        for (const b of arr) {
          const dx = b.x - cx;
          const dy = b.y - cy;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;

          if (d < coreKeepout) {
            const nx = dx / d;
            const ny = dy / d;
            const push = coreKeepout - d;

            b.x += nx * push;
            b.y += ny * push;

            b.vx += nx * push * 2.0;
            b.vy += ny * push * 2.0;
          }
        }

        // 4) Intégration + friction + limites
        for (const b of arr) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;

          b.vx *= 0.94;
          b.vy *= 0.94;

          // clamp dans le champ
          b.x = Math.max(bubbleR + pad, Math.min(w - bubbleR - pad, b.x));
          b.y = Math.max(bubbleR + pad, Math.min(h - bubbleR - pad, b.y));
        }
      }

      // 30 fps de re-render (léger)
      if (accum >= 1 / 30) {
        accum = 0;
        setBubbles([...arr]);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fieldSize]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center inrcy-soft-noise">
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl px-8 py-6">
          <div className="text-sm text-slate-600">Chargement de l’espace client…</div>
        </div>
      </main>
    );
  }

  const cx = fieldSize.w / 2;
  const cy = fieldSize.h / 2;

  return (
    <main className="min-h-screen inrcy-soft-noise relative overflow-hidden">
      {/* Header */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo-inrcy.png" alt="iNrCy" width={42} height={42} priority />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Espace Client</div>
            <div className="text-xs text-slate-600">{user?.email}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl bg-white/70 hover:bg-white/85 border border-white/70 shadow-sm backdrop-blur text-sm text-slate-800"
        >
          Se déconnecter
        </button>
      </header>

      {/* Dashboard */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-3xl bg-white/60 backdrop-blur-xl border border-white/60 shadow-2xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Dashboard iNrCy</h1>
              <p className="mt-2 text-slate-700 text-sm">
                Centre = Générateur iNrCy. Autour = bulles (électrons) qui bougent légèrement + synergie.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <div className="inrcy-atom-field" ref={fieldRef} aria-label="Outils iNrCy">
              {/* Liens de synergie (toujours derrière) */}
              <svg
                className="inrcy-links"
                aria-hidden="true"
                viewBox={`0 0 ${fieldSize.w} ${fieldSize.h}`}
                preserveAspectRatio="none"
              >
                {bubbles.map((b) => {
                  const dx = b.x - cx;
                  const dy = b.y - cy;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const opacity = Math.max(0.10, Math.min(0.28, 320 / (dist + 60)));
                  return (
                    <line
                      key={b.key}
                      x1={cx}
                      y1={cy}
                      x2={b.x}
                      y2={b.y}
                      stroke={`rgba(15,23,42,${opacity})`}
                      strokeWidth={1}
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>

              {/* Bulles (derrière le noyau) */}
              {bubbles.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className="inrcy-bubble"
                  onClick={() => onBubbleClick(b)}
                  style={
                    {
                      left: `${b.x}px`,
                      top: `${b.y}px`,
                      ["--c" as any]: b.color,
                    } as React.CSSProperties
                  }
                  title={`${b.label} — ${b.desc}`}
                  aria-label={`${b.label} — ${b.desc}`}
                >
                  <div className="inrcy-bubble-circle">
                    <div className="inrcy-bubble-icon" aria-hidden="true">
                      {b.icon}
                    </div>
                    <div className="inrcy-bubble-title">{b.label}</div>
                    <div className="inrcy-bubble-desc">{b.desc}</div>
                  </div>
                </button>
              ))}

              {/* Noyau (au-dessus) */}
              <div className="inrcy-core">
                <div className="inrcy-core-badge">⚙️ Générateur</div>
                <div className="inrcy-core-title">iNrCy</div>
                <div className="inrcy-core-sub">Automatisation - SEO - Social - Tracking</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-600">
              Astuce : clique sur une bulle. (On branchera chaque module ensuite.)
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
