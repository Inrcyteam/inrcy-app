"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = {
  email?: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let ignore = false;

    async function boot() {
      const { data, error } = await supabase.auth.getUser();

      // Pas connecté => retour login
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
      {/* Décor “atome” simple en fond */}
      <div className="inrcy-orbit opacity-70">
        <div className="ring" style={{ ["--size" as any]: "700px" }} />
        <div className="ring" style={{ ["--size" as any]: "520px" }} />
        <div className="ring" style={{ ["--size" as any]: "360px" }} />

        {/* 10 boules (couleurs/tailles/vitesses différentes) */}
        {[
          { r: "340px", dot: "14px", dur: "18s" },
          { r: "340px", dot: "10px", dur: "26s" },
          { r: "260px", dot: "12px", dur: "20s" },
          { r: "260px", dot: "9px", dur: "30s" },
          { r: "180px", dot: "11px", dur: "16s" },
          { r: "180px", dot: "8px", dur: "24s" },
          { r: "300px", dot: "9px", dur: "22s" },
          { r: "220px", dot: "10px", dur: "28s" },
          { r: "140px", dot: "8px", dur: "14s" },
          { r: "120px", dot: "7px", dur: "19s" },
        ].map((cfg, i) => (
          <div
            key={i}
            className="dot"
            style={{
              ["--r" as any]: cfg.r,
              ["--dot" as any]: cfg.dot,
              ["--dur" as any]: cfg.dur,
              // petit décalage pour éviter l’alignement parfait
              animationDelay: `${-i * 0.7}s`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-inrcy.png"
            alt="iNrCy"
            width={42}
            height={42}
            priority
          />
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

      {/* Contenu */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl p-8">
          <h1 className="text-xl font-semibold text-slate-900">
            Dashboard iNrCy
          </h1>
          <p className="mt-2 text-slate-700 text-sm">
            Ici on va mettre ton “atome” : générateur au centre + modules autour
            (GMB, Facebook, Insta, Site iNrCy, Stats, Messages…).
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Publier", desc: "Poster sur tes canaux" },
              { title: "Connecter GMB", desc: "Autoriser Google Business Profile" },
              { title: "Connecter Facebook", desc: "Autoriser Pages / Meta" },
              { title: "Connecter Instagram", desc: "Via Meta (Business)" },
              { title: "Site iNrCy", desc: "Contenu + pages + tracking" },
              { title: "Stats", desc: "Clics, appels, messages, formulaires" },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl bg-white/70 border border-white/70 p-4 shadow-sm"
              >
                <div className="font-semibold text-slate-900">{c.title}</div>
                <div className="text-sm text-slate-700 mt-1">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
