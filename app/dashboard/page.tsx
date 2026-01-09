"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = { email?: string | null };

type Tool = {
  key: string;
  label: string;
  desc: string;
  href?: string; // route interne si tu veux
  emoji?: string;
  ring: 1 | 2 | 3; // orbite
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

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

  const tools: Tool[] = [
    { key: "publish", label: "Publier", desc: "Poster sur tes canaux", emoji: "🛰️", ring: 1, href: "/dashboard/publish" },
    { key: "gmb", label: "GMB", desc: "Google Business Profile", emoji: "📍", ring: 2, href: "/dashboard/gmb" },
    { key: "facebook", label: "Facebook", desc: "Pages / Meta", emoji: "📘", ring: 3, href: "/dashboard/facebook" },
    { key: "instagram", label: "Instagram", desc: "Via Meta Business", emoji: "📸", ring: 2, href: "/dashboard/instagram" },
    { key: "site", label: "Site iNrCy", desc: "Pages + tracking", emoji: "🧩", ring: 1, href: "/dashboard/site" },
    { key: "stats", label: "Stats", desc: "Clics, appels, leads", emoji: "📈", ring: 3, href: "/dashboard/stats" },
    { key: "messages", label: "Messages", desc: "Inbox & demandes", emoji: "💬", ring: 2, href: "/dashboard/messages" },
  ];

  // Répartit les électrons par orbite avec un angle “de départ”
  const ringConfig = useMemo(() => {
    const byRing: Record<1 | 2 | 3, Tool[]> = { 1: [], 2: [], 3: [] };
    tools.forEach((t) => byRing[t.ring].push(t);

// Répartit les électrons par orbite avec un angle “de départ”
const ringConfig = useMemo(() => {
  // On utilise des clés string pour éviter les bugs de parsing
  const byRing: { [k: string]: Tool[] } = { "1": [], "2": [], "3": [] };

  for (const t of tools) {
    byRing[String(t.ring)].push(t);
  }

  // pour chaque ring: calcule un angle initial stable
  const make = (ring: 1 | 2 | 3, sizePx: number, duration: number) => {
    const items = byRing[String(ring)] || [];
    return {
      ring,
      sizePx,
      duration,
      items: items.map((t, idx) => {
        const step = 360 / Math.max(items.length, 1);
        const angle = idx * step + (ring === 1 ? 15 : ring === 2 ? 0 : -10);
        return { tool: t, angle };
      }),
    };
  };

  return [
    make(1, 360, 18),
    make(2, 520, 26),
    make(3, 700, 34),
  ];
}, [tools]);

  function onToolClick(t: Tool) {
    // pour l’instant on met un placeholder :
    // si href existe, tu peux décommenter la navigation
    if (t.href) {
      router.push(t.href);
      return;
    }
    alert(`Bientôt : ${t.label}`);
  }

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

      {/* Atom Dashboard */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-3xl bg-white/60 backdrop-blur-xl border border-white/60 shadow-2xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Dashboard iNrCy</h1>
              <p className="mt-2 text-slate-700 text-sm">
                Centre = Générateur iNrCy. Autour = outils (électrons) cliquables.
              </p>
            </div>
          </div>

          <div className="mt-8 inrcy-atom-wrap">
            {/* Orbites + électrons */}
            <div className="inrcy-atom" aria-label="Navigation outils iNrCy">
              {ringConfig.map((r) => (
                <div
                  key={r.ring}
                  className="inrcy-ring"
                  style={
                    {
                      ["--size" as any]: `${r.sizePx}px`,
                      ["--dur" as any]: `${r.duration}s`,
                    } as React.CSSProperties
                  }
                >
                  {/* trajectoire */}
                  <div className="inrcy-ring-track" />

                  {/* électrons */}
                  {r.items.map(({ tool, angle }) => (
                    <button
                      key={tool.key}
                      type="button"
                      className="inrcy-electron"
                      onClick={() => onToolClick(tool)}
                      style={
                        {
                          ["--angle" as any]: `${angle}deg`,
                        } as React.CSSProperties
                      }
                      aria-label={`${tool.label} – ${tool.desc}`}
                      title={`${tool.label} — ${tool.desc}`}
                    >
                      <span className="inrcy-electron-emoji" aria-hidden="true">
                        {tool.emoji ?? "⚡"}
                      </span>
                      <span className="inrcy-electron-label">
                        <span className="font-semibold">{tool.label}</span>
                        <span className="text-xs opacity-80">{tool.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}

              {/* Noyau (centre) */}
              <div className="inrcy-core">
                <div className="inrcy-core-badge">⚙️ Générateur</div>
                <div className="inrcy-core-title">iNrCy</div>
                <div className="inrcy-core-sub">Automatisation • SEO • Social • Tracking</div>

                <button
                  type="button"
                  className="inrcy-core-btn"
                  onClick={() => alert("Bientôt : configuration du générateur")}
                >
                  Ouvrir le générateur
                </button>
              </div>
            </div>

            {/* petit hint */}
            <div className="mt-4 text-xs text-slate-600">
              Astuce : clique sur un électron. (On branchera chaque module ensuite.)
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
