"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type WanderDot = {
  left: string;
  top: string;
  size: number;
  dur: number;
  delay: number;
  alpha: number;
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

function mapSupabaseRecoveryError(code?: string | null, desc?: string | null) {
  if (code === "otp_expired") return "Ce lien a expiré. Refaire une demande de réinitialisation depuis la page de connexion.";
  if (code === "access_denied") return "Accès refusé. Refaire une demande de réinitialisation depuis la page de connexion.";
  if (desc && desc.toLowerCase().includes("invalid")) return "Lien invalide. Refaire une demande de réinitialisation.";
  return null;
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // décor identique au login
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

  useEffect(() => {
    const code = searchParams.get("error_code");
    const desc = searchParams.get("error_description");
    const friendly = mapSupabaseRecoveryError(code, desc);
    if (friendly) setMsg(friendly);
  }, [searchParams]);

  function validate(): string | null {
    if (password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
    if (password !== confirm) return "Les deux mots de passe ne sont pas identiques.";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setOk(null);

    const v = validate();
    if (v) {
      setMsg(v);
      return;
    }

    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMsg("Session introuvable. Refais une demande de réinitialisation depuis la page de connexion.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg(error.message);
        return;
      }

      setOk("Mot de passe mis à jour. Redirection…");
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <svg className="inrcy-lines" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="gLineSP" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(0,180,255,0.20)" />
            <stop offset="0.55" stopColor="rgba(120,90,255,0.18)" />
            <stop offset="1" stopColor="rgba(255,55,140,0.18)" />
          </linearGradient>
          <radialGradient id="gHaloSP" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <circle cx="600" cy="350" r="260" fill="url(#gHaloSP)" />
        <circle cx="600" cy="350" r="260" fill="none" stroke="url(#gLineSP)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="210" fill="none" stroke="url(#gLineSP)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="155" fill="none" stroke="url(#gLineSP)" strokeWidth="1" opacity="0.35" />
        <circle cx="600" cy="350" r="110" fill="none" stroke="url(#gLineSP)" strokeWidth="1" opacity="0.35" />

        <path
          d="M420 240 L520 185 L640 190 L760 255 L820 360 L720 470 L580 505 L460 445 L405 340 Z"
          fill="none"
          stroke="url(#gLineSP)"
          strokeWidth="1"
          opacity="0.35"
        />
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

            <div className="text-sm font-semibold tracking-wide text-slate-700">Réinitialisation</div>
            <div className="text-xs text-slate-500 text-center">
              Définis un nouveau mot de passe pour accéder à ton espace iNrCy.
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <input
                className="inrcy-input"
                type={showPassword ? "text" : "password"}
                placeholder="Nouveau mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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

            <div className="relative">
              <input
                className="inrcy-input"
                type={showPassword ? "text" : "password"}
                placeholder="Confirmer le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">✅</span>
            </div>

            {msg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {msg}
              </div>
            ) : null}

            {ok ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {ok}
              </div>
            ) : null}

            <button className="inrcy-btn w-full" disabled={loading}>
              {loading ? "Enregistrement..." : "Valider"}
            </button>

            <a className="block w-full text-center text-xs underline text-slate-600" href="/login">
              Retour à la connexion
            </a>
          </form>
        </div>
      </section>
    </main>
  );
}
