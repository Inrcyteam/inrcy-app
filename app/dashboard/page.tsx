"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = { email?: string | null };

type Electron = {
  key: string;
  label: string;
  desc: string;
  href?: string;
  icon: string; // picto au-dessus
  color: string;

  left: number; // %
  top: number; // %
  dur: number; // s
  delay: number; // s
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  x4: number; y4: number;
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function rint(min: number, max: number) {
  return Math.round(rand(min, max));
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  // refs pour calculer les lignes (synergie)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

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

  // ✅ 9 bulles comme ton schéma
  const seed = useMemo(
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

  const [electrons, setElectrons] = useState<Electron[]>([]);

  // Génère des positions + trajectoires “pseudo-aléatoires” (1 fois au mount)
  useEffect(() => {
    const placed: Electron[] = seed.map((t, i) => {
      const angle = (i / seed.length) * Math.PI * 2 + rand(-0.25, 0.25);
      const radius = rand(22, 34); // % de la zone
      const left = 50 + Math.cos(angle) * radius + rand(-3, 3);
      const top = 50 + Math.sin(angle) * radius + rand(-3, 3);

      return {
        ...t,
        left: Math.max(12, Math.min(88, left)),
        top: Math.max(14, Math.min(86, top)),
        dur: rint(14, 26),
        delay: Math.round(rand(0, 6) * 10) / 10,
        x1: rint(-70, 70), y1: rint(-55, 55),
        x2: rint(-70, 70), y2: rint(-55, 55),
        x3: rint(-70, 70), y3: rint(-55, 55),
        x4: rint(-70, 70), y4: rint(-55, 55),
      };
    });

    setElectrons(placed);
  }, [seed]);

  function onToolClick(e: Electron) {
    if (e.href) {
      router.push(e.href);
      return;
    }
    alert(`Bientôt : ${e.label}`);
  }

  // Lignes de synergie (Core → bulles) qui suivent les mouvements
  useEffect(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    const svg = svgRef.current;
    if (!container || !core || !svg) return;
    if (!electrons.length) return;

    svg.innerHTML = "";

    const lines = electrons.map(() => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "rgba(15,23,42,0.18)");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
      return line;
    });

    let raf = 0;

    const tick = () => {
      const cRect = container.getBoundingClientRect();
      const coreRect = core.getBoundingClientRect();

      const cx = coreRect.left - cRect.left + coreRect.width / 2;
      const cy = coreRect.top - cRect.top + coreRect.height / 2;

      const nodes = container.querySelectorAll<HTMLElement>("[data-electron='1']");
      nodes.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const ex = r.left - cRect.left + r.width / 2;
        const ey = r.top - cRect.top + r.height / 2;

        const line = lines[i];
        if (!line) return;

        line.setAttribute("x1", `${cx}`);
        line.setAttribute("y1", `${cy}`);
        line.setAttribute("x2", `${ex}`);
        line.setAttribute("y2", `${ey}`);

        const dx = ex - cx;
        const dy = ey - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const op = Math.max(0.10, Math.min(0.28, 300 / (dist + 40)));
        line.setAttribute("stroke", `rgba(15,23,42,${op})`);
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [electrons]);

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
                Centre = Générateur iNrCy. Autour = bulles cliquables en mouvement (synergie).
              </p>
            </div>
          </div>

          <div className="mt-8">
            <div className="inrcy-atom-field" ref={containerRef} aria-label="Outils iNrCy">
              {/* lignes (derrière) */}
              <svg className="inrcy-links" ref={svgRef} aria-hidden="true" />

              {/* bulles (toujours derrière le noyau) */}
              {electrons.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  data-electron="1"
                  className="inrcy-bubble"
                  onClick={() => onToolClick(e)}
                  style={
                    {
                      left: `${e.left}%`,
                      top: `${e.top}%`,
                      ["--dur" as any]: `${e.dur}s`,
                      ["--delay" as any]: `${e.delay}s`,
                      ["--x1" as any]: `${e.x1}px`,
                      ["--y1" as any]: `${e.y1}px`,
                      ["--x2" as any]: `${e.x2}px`,
                      ["--y2" as any]: `${e.y2}px`,
                      ["--x3" as any]: `${e.x3}px`,
                      ["--y3" as any]: `${e.y3}px`,
                      ["--x4" as any]: `${e.x4}px`,
                      ["--y4" as any]: `${e.y4}px`,
                      ["--c" as any]: e.color,
                    } as React.CSSProperties
                  }
                  title={`${e.label} — ${e.desc}`}
                  aria-label={`${e.label} — ${e.desc}`}
                >
                  {/* ✅ CONTENU DANS LE ROND */}
                  <div className="inrcy-bubble-circle">
                    <div className="inrcy-bubble-icon" aria-hidden="true">
                      {e.icon}
                    </div>
                    <div className="inrcy-bubble-title">{e.label}</div>
                    <div className="inrcy-bubble-desc">{e.desc}</div>
                  </div>
                </button>
              ))}

              {/* noyau AU-DESSUS (les bulles passent derrière) */}
              <div className="inrcy-core" ref={coreRef}>
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
