"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type WanderDot = {
  left: string; // %
  top: string; // %
  size: number; // px
  dur: number; // s
  delay: number; // s
  alpha: number; // 0-1
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  x4: number; y4: number;
  x5: number; y5: number;
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function rint(min: number, max: number) {
  return Math.round(rand(min, max));
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ ajout : message info (succès reset password)
  const [info, setInfo] = useState<string | null>(null);

  const dotColors = useMemo(
    () => [
      { a: "rgba(0,180,255,1)", b: "rgba(120,90,255,1)" },
      { a: "rgba(255,55,140,1)", b: "rgba(255,140,0,1)" },
      { a: "rgba(120,90,255,1)", b: "rgba(0,180,255,1)" },
      { a: "rgba(34,197,94,1)", b: "rgba(0,180,255,1)" },
      { a: "rgba(255,140,0,1)", b: "rgba(255,55,140,1)" },
      { a: "rgba(59,130,246,1)", b: "rgba(0,180,255,1)" },
      { a: "rgba(168,85,247,1)", b: "rgba(255,55,140,1)" },
      { a: "rgba(250,204,21,1)", b: "rgba(255,140,0,1)" },
      { a: "rgba(236,72,153,1)", b: "rgba(168,85,247,1)" },
      { a: "rgba(14,165,233,1)", b: "rgba(34,197,94,1)" },
    ],
    []
  );

  const [mounted, setMounted] = useState(false);
  const [dots, setDots] = useState<WanderDot[]>([]);

  useEffect(() => {
    setMounted(true);

    const newDots: WanderDot[] = Array.from({ length: 20 }).map(() => ({
      left: `${rint(6, 94)}%`,
      top: `${rint(8, 92)}%`,
      size: rint(9, 14),
      dur: rint(10, 20),
      delay: Math.round(rand(0, 6) * 10) / 10,
      alpha: Math.round(rand(0.55, 0.95) * 100) / 100,

      x1: rint(-90, 90), y1: rint(-70, 70),
      x2: rint(-90, 90), y2: rint(-70, 70),
      x3: rint(-90, 90), y3: rint(-70, 70),
      x4: rint(-90, 90), y4: rint(-70, 70),
      x5: rint(-90, 90), y5: rint(-70, 70),
    }));

    setDots(newDots);
  }, []);

  // ✅ ajout : reset password
  async function onForgotPassword() {
  setError(null);
  setInfo(null);

  if (!email) {
    setError("Entre ton email d’abord.");
    return;
  }

  setLoading(true);

  try {
    const origin = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/set-password`

    });

    if (error) {
      setError(error.message);
      return;
    }

    setInfo("Email envoyé. Vérifie ta boîte mail (et tes spams).");
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : "Erreur lors de l’envoi de l’email");
  } finally {
    setLoading(false);
  }
}


  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null); // ✅ ajout : on nettoie le message info quand on tente une connexion
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // ✅ attendre que la session soit bien créée/stockée
      let session = (await supabase.auth.getSession()).data.session;

      // petit délai de sécurité (évite le redirect trop tôt)
      if (!session) {
        await new Promise((r) => setTimeout(r, 200));
        session = (await supabase.auth.getSession()).data.session;
      }

      if (!session) {
        setError("Connexion OK mais session non récupérée. Réessaie.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen inrcy-soft-noise overflow-hidden">
      <div className="inrcy-noise-overlay" />

      <svg className="inrcy-lines" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="gLine" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(0,180,255,0.20)" />
            <stop offset="0.55" stopColor="rgba(120,90,255,0.18)" />
            <stop offset="1" stopColor="rgba(255,55,140,0.18)" />
          </linearGradient>
          <radialGradient id="gHalo" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <circle cx="600" cy="350" r="260" fill="url(#gHalo)" />
        <circle cx="600" cy="350" r="260" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="210" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="155" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="110" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.35" />

        <path
          d="M420 240 L520 185 L640 190 L760 255 L820 360 L720 470 L580 505 L460 445 L405 340 Z"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />
        <path d="M520 185 L600 350 L760 255" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.25" />
        <path d="M460 445 L600 350 L820 360" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.25" />
        <path d="M420 240 L600 350 L580 505" fill="none" stroke="url(#gLine)" strokeWidth="1" opacity="0.25" />

        {[
          [420, 240],
          [520, 185],
          [640, 190],
          [760, 255],
          [820, 360],
          [720, 470],
          [580, 505],
          [460, 445],
          [405, 340],
          [600, 350],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="rgba(120,90,255,0.35)" />
        ))}
      </svg>

      {mounted && (
        <div className="inrcy-float-field" aria-hidden="true">
          {dots.map((d, i) => {
            const c = dotColors[i % dotColors.length];
            return (
              <div
                key={i}
                className="inrcy-wander-dot"
                style={{
                  left: d.left,
                  top: d.top,
                  width: `${d.size}px`,
                  height: `${d.size}px`,
                  opacity: d.alpha,
                  ["--dur" as any]: `${d.dur}s`,
                  ["--delay" as any]: `${d.delay}s`,
                  ["--x1" as any]: `${d.x1}px`,
                  ["--y1" as any]: `${d.y1}px`,
                  ["--x2" as any]: `${d.x2}px`,
                  ["--y2" as any]: `${d.y2}px`,
                  ["--x3" as any]: `${d.x3}px`,
                  ["--y3" as any]: `${d.y3}px`,
                  ["--x4" as any]: `${d.x4}px`,
                  ["--y4" as any]: `${d.y4}px`,
                  ["--x5" as any]: `${d.x5}px`,
                  ["--y5" as any]: `${d.y5}px`,
                  ["--cA" as any]: c.a,
                  ["--cB" as any]: c.b,
                }}
              />
            );
          })}
        </div>
      )}

      <section className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="inrcy-card w-full max-w-[420px] p-6">
          <div className="flex flex-col items-center gap-2 pb-4">
            <div className="inrcy-logo-wrap">
              <Image
                src="/logo-inrcy.png"
                alt="iNrCy"
                width={120}
                height={120}
                priority
                className="inrcy-logo"
                style={{ height: "auto" }}
              />
            </div>

            <div className="text-sm font-semibold tracking-wide text-slate-700">Espace Client</div>
            <div className="text-xs text-slate-500 text-center">Accède à ton dashboard et à tes ressources.</div>
          </div>

          {/* ✅ évite l’overlay hydration quand une extension modifie les inputs */}
          <form suppressHydrationWarning onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <input
                className="inrcy-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">✉️</span>
            </div>

            <div className="relative">
  <input
    className="inrcy-input"
    type={showPassword ? "text" : "password"}
    placeholder="Mot de passe"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    autoComplete="current-password"
    required
  />

  <button
    type="button"
    onClick={() => setShowPassword((v) => !v)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
  >
    {showPassword ? "🙈" : "👁️"}
  </button>
</div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* ✅ ajout : message succès */}
            {info ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {info}
              </div>
            ) : null}

            <button className="inrcy-btn w-full" type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            {/* ✅ ajout : mot de passe oublié */}
            <button
              type="button"
              onClick={onForgotPassword}
              className="w-full text-xs underline text-slate-600"
              disabled={loading}
            >
              Mot de passe oublié ?
            </button>
          </form>

          <div className="pt-4 text-center text-xs text-slate-500">
            Besoin d’aide ?{" "}
            <a className="underline" href="mailto:contact@inrcy.com">
              contact@inrcy.com
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
