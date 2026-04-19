"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { setActiveBrowserUserId } from "@/lib/browserAccountCache";

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

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function rint(min: number, max: number) {
  return Math.round(rand(min, max));
}

function normalizeEmail(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function mapSupabaseRecoveryError(code?: string | null, desc?: string | null, mode: "invite" | "reset" = "reset") {
  const isInvite = mode === "invite";
  const requestLabel = isInvite
    ? "demander un nouveau lien d’invitation auprès de votre contact iNrCy"
    : "refaire une demande de réinitialisation depuis la page de connexion";

  if (code === "otp_expired") return `Ce lien a expiré. Veuillez ${requestLabel}.`;
  if (code === "access_denied") return `Accès refusé. Veuillez ${requestLabel}.`;
  if (code === "otp_disabled") return "Ce type de lien n’est pas disponible pour le moment.";
  if (desc && desc.toLowerCase().includes("invalid")) return `Lien invalide ou déjà utilisé. Veuillez ${requestLabel}.`;
  if (desc && desc.toLowerCase().includes("expired")) return `Ce lien a expiré. Veuillez ${requestLabel}.`;
  return null;
}

function shouldOfferResendLink(message: string | null, mode: "invite" | "reset", email?: string | null) {
  if (!message || !email) return false;
  const value = message.toLowerCase();

  const genericSignals = [
    "lien a expiré",
    "lien est invalide",
    "lien invalide",
    "déjà utilisé",
    "deja utilise",
    "session d’activation",
    "session d'activation",
    "session de réinitialisation",
    "session de reinitialisation",
    "ouvert dans un autre navigateur",
    "demandez un nouveau lien",
    "refaites une demande",
    "accès refusé",
  ];

  if (genericSignals.some((signal) => value.includes(signal))) return true;
  if (mode === "invite" && value.includes("invitation")) return true;
  if (mode === "reset" && value.includes("réinitialisation")) return true;
  return false;
}

function getPasswordStrength(pw: string) {
  const rules = {
    minLen: pw.length >= 8,
    hasLetter: /[a-zA-Z]/.test(pw),
    hasNumber: /\d/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasSymbol: /[^a-zA-Z0-9]/.test(pw),
  };

  const score = Object.values(rules).filter(Boolean).length; // 0..5
  const percent = (score / 5) * 100;
  const label = score <= 2 ? "Faible" : score <= 4 ? "Moyen" : "Fort";
  const isStrong = score === 5;

  return { rules, score, percent, label, isStrong };
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${ok ? "text-emerald-600" : "text-slate-500"}`}>
      <span aria-hidden="true">{ok ? "●" : "○"}</span>
      <span>{label}</span>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const mode = (searchParams.get("mode") ?? "reset") as "invite" | "reset";
  const isInvite = mode === "invite";
  const expectedEmail = normalizeEmail(searchParams.get("email"));

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

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

  // ✅ Affiche un message clair si Supabase renvoie une erreur dans l’URL
  useEffect(() => {
    const code = searchParams.get("error_code");
    const desc = searchParams.get("error_description");
    const friendly = mapSupabaseRecoveryError(code, desc, mode);
    if (friendly) setMsg(friendly);
  }, [mode, searchParams]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => (value > 1 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    let cancelled = false;

    const verifyExpectedAccount = async () => {
      if (!expectedEmail) return;
      const { data, error } = await supabase.auth.getUser();
      if (cancelled || error || !data.user) return;
      setActiveBrowserUserId(data.user.id);
      const currentEmail = normalizeEmail(data.user.email);
      if (currentEmail && currentEmail !== expectedEmail) {
        setMsg(
          isInvite
            ? `Ce lien d’activation correspond à ${expectedEmail}, mais ce navigateur utilise actuellement ${currentEmail}. Demandez un nouveau lien d’invitation ou ouvrez-le après vous être déconnecté du bon compte.`
            : `Ce lien de réinitialisation correspond à ${expectedEmail}, mais ce navigateur utilise actuellement ${currentEmail}. Refaites la demande après vous être déconnecté du bon compte.`
        );
      }
    };

    void verifyExpectedAccount();
    return () => {
      cancelled = true;
    };
  }, [expectedEmail, isInvite, supabase]);

  async function onResendLink() {
    if (!expectedEmail || resendLoading || resendCooldown > 0) return;

    setResendLoading(true);
    setResendError(null);
    setResendInfo(null);

    try {
      const res = await fetch("/api/auth/resend-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: expectedEmail,
          mode,
        }),
      });

      const payload = await res.json().catch(() => null) as { error?: string; message?: string } | null;

      if (!res.ok) {
        setResendError(payload?.error || "Impossible d’envoyer un nouveau lien pour le moment.");
        return;
      }

      setResendInfo(
        payload?.message ||
          (isInvite
            ? `Un nouveau lien vient d’être envoyé à ${expectedEmail}.`
            : `Un nouveau lien de réinitialisation vient d’être envoyé à ${expectedEmail}.`),
      );
      setResendCooldown(30);
    } catch {
      setResendError("Impossible d’envoyer un nouveau lien pour le moment.");
    } finally {
      setResendLoading(false);
    }
  }

  function validate(): string | null {
    if (!getPasswordStrength(password).isStrong) {
      return "Mot de passe trop faible : 8+ caractères, lettre, chiffre, majuscule et symbole requis.";
    }
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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const hasSession = Boolean(sessionData.session);

      const { data, error } = await supabase.auth.getUser();
      if (sessionError || error || !hasSession || !data.user) {
        setMsg(
          isInvite
            ? "Votre session d’activation n’a pas pu être finalisée. Le lien est peut-être expiré, déjà utilisé, ou ouvert dans un autre navigateur. Demandez un nouveau lien d’invitation."
            : "Votre session de réinitialisation n’a pas pu être finalisée. Le lien est peut-être expiré, déjà utilisé, ou ouvert dans un autre navigateur. Refaites une demande de réinitialisation."
        );
        return;
      }

      const currentEmail = normalizeEmail(data.user.email);
      if (expectedEmail && currentEmail && currentEmail !== expectedEmail) {
        setMsg(
          isInvite
            ? `Ce lien d’activation est prévu pour ${expectedEmail}. Déconnectez-vous du compte ${currentEmail} puis demandez un nouveau lien d’invitation.`
            : `Ce lien de réinitialisation est prévu pour ${expectedEmail}. Déconnectez-vous du compte ${currentEmail} puis refaites une demande de réinitialisation.`
        );
        return;
      }

      setActiveBrowserUserId(data.user.id);

      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setMsg(updErr.message);
        return;
      }

      setOk(
        isInvite
          ? "Mot de passe créé avec succès. Redirection vers votre espace…"
          : "Mot de passe réinitialisé. Redirection…"
      );

      window.location.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  const confirmTouched = confirm.length > 0;
  const confirmOk = confirmTouched && password === confirm;

  const canSubmit = !loading && strength.isStrong && password === confirm;
  const canResend = shouldOfferResendLink(msg, mode, expectedEmail);

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
                  "--dur": `${d.dur}s`,
                  "--delay": `${d.delay}s`,
                  "--x1": `${d.x1}px`,
                  "--y1": `${d.y1}px`,
                  "--x2": `${d.x2}px`,
                  "--y2": `${d.y2}px`,
                  "--x3": `${d.x3}px`,
                  "--y3": `${d.y3}px`,
                  "--x4": `${d.x4}px`,
                  "--y4": `${d.y4}px`,
                  "--x5": `${d.x5}px`,
                  "--y5": `${d.y5}px`,
                  "--cA": c.a,
                  "--cB": c.b,
                } as CSSVars}
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

            <div className="text-sm font-semibold tracking-wide text-slate-700">
              {isInvite ? "Création du mot de passe" : "Réinitialisation du mot de passe"}
            </div>

            <div className="text-xs text-slate-500 text-center">
              {isInvite
                ? "Bienvenue sur iNrCy. Définissez votre mot de passe pour activer votre espace client."
                : "Définissez un nouveau mot de passe pour accéder à votre espace iNrCy. Ce lien fonctionne une seule fois et doit être ouvert dans le navigateur qui a finalisé l’étape précédente."}
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="relative">
              <input
                className="inrcy-input pr-10"
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

            <div className="-mt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Niveau de protection</span>
                <span
                  className={
                    strength.label === "Fort"
                      ? "text-emerald-600"
                      : strength.label === "Moyen"
                      ? "text-amber-600"
                      : "text-rose-600"
                  }
                >
                  {strength.label}
                </span>
              </div>

              <div className="mt-1 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  style={{
                    width: `${strength.percent}%`,
                    background: "linear-gradient(90deg, #00B4FF 0%, #7A5CFF 35%, #FF378C 70%, #FF8C00 100%)",
                  }}
                  className="h-full rounded-full transition-all"
                />
              </div>

              <div className="mt-2 grid grid-cols-1 gap-1 text-[12px]">
                <Rule ok={strength.rules.minLen} label="8 caractères minimum" />
                <Rule ok={strength.rules.hasLetter} label="Au moins une lettre" />
                <Rule ok={strength.rules.hasNumber} label="Au moins un chiffre" />
                <Rule ok={strength.rules.hasUpper} label="Au moins une majuscule" />
                <Rule ok={strength.rules.hasSymbol} label="Au moins un symbole" />
              </div>
            </div>

            <div className="relative">
              <input
                className="inrcy-input pr-10"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmer le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showConfirmPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {confirmTouched ? (
              confirmOk ? (
                <div className="text-xs text-emerald-600">Les mots de passe correspondent.</div>
              ) : (
                <div className="text-xs text-rose-600">Les mots de passe ne correspondent pas.</div>
              )
            ) : null}

            {msg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {msg}
              </div>
            ) : null}

            {canResend ? (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3">
                <div className="text-sm text-sky-900">
                  {isInvite
                    ? "Besoin d’un nouveau lien d’activation ?"
                    : "Besoin d’un nouveau lien de réinitialisation ?"}
                </div>
                <button
                  type="button"
                  onClick={onResendLink}
                  disabled={resendLoading || resendCooldown > 0}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendLoading
                    ? "Envoi en cours..."
                    : resendCooldown > 0
                    ? `Renvoyer dans ${resendCooldown}s`
                    : "Envoyer un nouveau lien"}
                </button>
                {resendInfo ? <div className="text-sm text-emerald-700">{resendInfo}</div> : null}
                {resendError ? <div className="text-sm text-rose-700">{resendError}</div> : null}
              </div>
            ) : null}

            {ok ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {ok}
              </div>
            ) : null}

            <button
              className="inrcy-btn w-full"
              disabled={!canSubmit}
              title={
                !strength.isStrong
                  ? "Mot de passe requis : 8+ caractères, lettre, chiffre, majuscule et symbole."
                  : password !== confirm
                  ? "Les mots de passe ne correspondent pas."
                  : ""
              }
            >
              {loading ? "Enregistrement..." : isInvite ? "Créer mon mot de passe" : "Réinitialiser mon mot de passe"}
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
