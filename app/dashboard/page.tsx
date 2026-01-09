"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = { email?: string | null };

type Tool = {
  key: string;
  label: string;
  desc: string;
  href?: string;
  icon: string; // emoji / petit picto
  color: string; // couleur de la bulle
};

type Vec = { x: number; y: number };

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  // ✅ tes 9 bulles
  const tools: Tool[] = useMemo(
    () => [
      { key: "facebook", label: "Facebook", desc: "Votre Page", icon: "📘", color: "#3b82f6", href: "/dashboard/facebook" },
      { key: "site-inrcy", label: "Site iNrCy", desc: "Pages + tracking", icon: "🧩", color: "#a855f7", href: "/dashboard/site" },
      { key: "gmb", label: "GMB", desc: "Business Profile", icon: "📍", color: "#22c55e", href: "/dashboard/gmb" },
      { key: "mails", label: "Mails", desc: "Inbox & relances", icon: "✉️", color: "#f97316", href: "/dashboard/mails" },
      { key: "publier", label: "Publier", desc: "Posts multi-canaux", icon: "📣", color: "#06b6d4", href: "/dashboard/publish" },
      { key: "houzz", label: "Houzz", desc: "Profil & posts", icon: "🏠", color: "#10b981", href: "/dashboard/houzz" },
      { key: "site-web", label: "Site web", desc: "Votre site client", icon: "🌐", color: "#eab308", href: "/dashboard/site-web" },
      { key: "stats", label: "Stats", desc: "Clics, appels, leads", icon: "📈", color: "#ef4444", href: "/dashboard/stats" },
      { key: "annuaire", label: "Annuaire", desc: "Citations / NAP", icon: "📇", color: "#8b5cf6", href: "/dashboard/annuaire" },
    ],
    []
  );

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

  function onToolClick(t: Tool) {
    if (t.href) router.push(t.href);
    else alert(`Bientôt : ${t.label}`);
  }

  // =========================
  // ✅ Moteur “bulles flottantes”
  // =========================

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);

  // IMPORTANT: doit matcher ton CSS (.inrcy-bubble width/height)
  const bubbleSize = 118; // px (cf globals.css)
  const bubbleR = bubbleSize / 2; // = 59

  const pad = 34; // marge aux bords (plus grand => plus d’air)
  const corePadding = 28; // marge autour du centre

  // positions affichées
  const [pos, setPos] = useState<Vec[]>(() => tools.map(() => ({ x: 0, y: 0 })));

  // refs pour simulation (sans rerender lourd)
  const posRef = useRef<Vec[]>(tools.map(() => ({ x: 0, y: 0 })));
  const velRef = useRef<Vec[]>(tools.map(() => ({ x: 0, y: 0 })));
  const seedRef = useRef<number[]>(tools.map((_, i) => 1000 + i * 97));

  // ✅ évite le flash “toutes à 0,0”
  const [readyField, setReadyField] = useState(false);

  // mesure taille conteneur + init positions
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    const init = () => {
      const r = el.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;

      // place de départ en cercle large (plus espacé)
      const startRadius = Math.min(r.width, r.height) * 0.34;

      const newPos = tools.map((_, i) => {
        const ang = (i / tools.length) * Math.PI * 2;
        return {
          x: cx + Math.cos(ang) * startRadius,
          y: cy + Math.sin(ang) * startRadius,
        };
      });

      const newVel = tools.map((_, i) => {
        const a = ((i + 1) * 137.5 * Math.PI) / 180;
        return { x: Math.cos(a) * 0.55, y: Math.sin(a) * 0.55 };
      });

      posRef.current = newPos;
      velRef.current = newVel;
      setPos(newPos);
      setReadyField(true);
    };

    init();

    const ro = new ResizeObserver(() => init());
    ro.observe(el);
    return () => ro.disconnect();
  }, [tools]);

  // boucle animation
  useEffect(() => {
    if (!readyField) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = clamp((now - last) / 16.67, 0.5, 2.0);
      last = now;

      const field = fieldRef.current;
      if (!field) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const fr = field.getBoundingClientRect();
      const cx = fr.width / 2;
      const cy = fr.height / 2;

      // Zone interdite autour du centre
      let coreR = 120;
      const core = coreRef.current;
      if (core) {
        const cr = core.getBoundingClientRect();
        coreR = Math.max(cr.width, cr.height) / 2 + corePadding;
      }

      const p = posRef.current.map((v) => ({ ...v }));
      const v = velRef.current.map((vv) => ({ ...vv }));

      // 1) drift + bruit doux
      for (let i = 0; i < p.length; i++) {
        const s = seedRef.current[i];

        const nx =
          Math.sin(now / 900 + s) * 0.22 +
          Math.cos(now / 1400 + s * 0.7) * 0.18;

        const ny =
          Math.cos(now / 1000 + s) * 0.22 +
          Math.sin(now / 1600 + s * 0.9) * 0.18;

        // petite attraction vers une “couronne” => évite bords + évite centre
        const dx = p[i].x - cx;
        const dy = p[i].y - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const target = Math.min(fr.width, fr.height) * 0.36;
        const pull = (dist - target) * 0.0009;

        v[i].x += (-dx / dist) * pull;
        v[i].y += (-dy / dist) * pull;

        v[i].x += nx * 0.10;
        v[i].y += ny * 0.10;

        v[i].x *= 0.985;
        v[i].y *= 0.985;
      }

      // 2) anti-chevauchement bulles
      const minD = bubbleR * 2 + 16; // + marge
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < p.length; i++) {
          for (let j = i + 1; j < p.length; j++) {
            const dx = p[j].x - p[i].x;
            const dy = p[j].y - p[i].y;
            const d = Math.max(0.0001, Math.hypot(dx, dy));
            if (d < minD) {
              const overlap = (minD - d) / 2;
              const ux = dx / d;
              const uy = dy / d;

              p[i].x -= ux * overlap;
              p[i].y -= uy * overlap;
              p[j].x += ux * overlap;
              p[j].y += uy * overlap;

              v[i].x -= ux * 0.06;
              v[i].y -= uy * 0.06;
              v[j].x += ux * 0.06;
              v[j].y += uy * 0.06;
            }
          }
        }
      }

      // 3) interdit centre
      for (let i = 0; i < p.length; i++) {
        const dx = p[i].x - cx;
        const dy = p[i].y - cy;
        const d = Math.max(0.0001, Math.hypot(dx, dy));
        const limit = coreR + bubbleR + 14;

        if (d < limit) {
          const push = limit - d;
          const ux = dx / d;
          const uy = dy / d;
          p[i].x += ux * push;
          p[i].y += uy * push;
          v[i].x += ux * 0.35;
          v[i].y += uy * 0.35;
        }
      }

      // 4) bords du terrain
      const left = pad + bubbleR;
      const right = fr.width - pad - bubbleR;
      const top = pad + bubbleR;
      const bottom = fr.height - pad - bubbleR;

      for (let i = 0; i < p.length; i++) {
        p[i].x += v[i].x * dt;
        p[i].y += v[i].y * dt;

        if (p[i].x < left) {
          p[i].x = left;
          v[i].x = Math.abs(v[i].x) * 0.9;
        }
        if (p[i].x > right) {
          p[i].x = right;
          v[i].x = -Math.abs(v[i].x) * 0.9;
        }
        if (p[i].y < top) {
          p[i].y = top;
          v[i].y = Math.abs(v[i].y) * 0.9;
        }
        if (p[i].y > bottom) {
          p[i].y = bottom;
          v[i].y = -Math.abs(v[i].y) * 0.9;
        }

        v[i].x = clamp(v[i].x, -2.4, 2.4);
        v[i].y = clamp(v[i].y, -2.4, 2.4);
      }

      posRef.current = p;
      velRef.current = v;
      setPos(p);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tools, readyField]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center inrcy-soft-noise">
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl px-8 py-6">
          <div className="text-sm text-slate-600">Chargement de l’espace client…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen inrcy-soft-noise relative overflow-hidden">
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

      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-3xl bg-white/60 backdrop-blur-xl border border-white/60 shadow-2xl p-6 md:p-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Dashboard iNrCy</h1>
            <p className="mt-2 text-slate-700 text-sm">
              Centre = Générateur iNrCy. Autour = bulles (électrons) qui bougent aléatoirement (sans collision).
            </p>
          </div>

          <div className="mt-8 inrcy-atom-wrap">
            <div ref={fieldRef} className="inrcy-field" aria-label="Navigation outils iNrCy">
              {/* ✅ Bulles (AU-DESSUS du centre) */}
              {readyField &&
                tools.map((t, i) => (
                  <button
                    key={t.key}
                    type="button"
                    className="inrcy-bubble"
                    onClick={() => onToolClick(t)}
                    style={
                      {
                        transform: `translate(${pos[i]?.x ?? 0}px, ${pos[i]?.y ?? 0}px) translate(-50%, -50%)`,
                        ["--bubble" as any]: t.color,
                      } as React.CSSProperties
                    }
                    title={`${t.label} — ${t.desc}`}
                    aria-label={`${t.label} — ${t.desc}`}
                  >
                    <div className="inrcy-bubble-inner">
                      <div className="inrcy-bubble-icon" aria-hidden="true">
                        {t.icon}
                      </div>
                      <div className="inrcy-bubble-title">{t.label}</div>
                      <div className="inrcy-bubble-desc">{t.desc}</div>
                    </div>
                  </button>
                ))}

              {/* ✅ Centre (en dessous des bulles) */}
              <div ref={coreRef} className="inrcy-core inrcy-core--small">
                <div className="inrcy-core-badge">⚙️ Générateur</div>
                <div className="inrcy-core-title">iNrCy</div>
                <div className="inrcy-core-sub">Automatisation • SEO • Social • Tracking</div>
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
