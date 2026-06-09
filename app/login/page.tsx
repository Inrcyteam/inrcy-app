"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  purgeAllBrowserAccountCaches,
  setActiveBrowserUserId,
} from "@/lib/browserAccountCache";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import styles from "./login.module.css";

type WanderDot = {
  left: string; // %
  top: string; // %
  size: number; // px
  dur: number; // s
  delay: number; // s
  alpha: number; // 0-1
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
  x5: number;
  y5: number;
};

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

type LoginDiagnosticReason = "network" | "technical" | "storage";

type LoginErrorState = {
  title: string;
  message: string;
  hint?: string;
  diagnosticReason?: LoginDiagnosticReason;
};

function rawErrorMessage(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (input instanceof Error) return String(input.message || "").trim();
  if (input && typeof input === "object") {
    const maybe = input as {
      message?: unknown;
      error?: unknown;
      statusText?: unknown;
      name?: unknown;
    };
    if (typeof maybe.message === "string") return maybe.message.trim();
    if (typeof maybe.error === "string") return maybe.error.trim();
    if (typeof maybe.statusText === "string") return maybe.statusText.trim();
    if (typeof maybe.name === "string") return maybe.name.trim();
  }
  return "";
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function friendlyLoginError(
  input: unknown,
  fallback = "La connexion a échoué. Veuillez réessayer.",
): LoginErrorState {
  const raw = rawErrorMessage(input);
  const message = raw.toLowerCase();

  if (
    hasAny(message, [
      "invalid login credentials",
      "invalid credentials",
      "email not found",
      "wrong password",
    ])
  ) {
    return {
      title: "Connexion refusée",
      message: "Adresse e-mail ou mot de passe incorrect.",
      hint: "Vérifiez vos informations ou utilisez « Mot de passe oublié ? ».",
    };
  }

  if (hasAny(message, ["email not confirmed", "email_not_confirmed"])) {
    return {
      title: "E-mail non confirmé",
      message: "Votre adresse e-mail n’est pas encore confirmée.",
      hint: "Vérifiez votre boîte mail ou demandez un nouveau lien.",
    };
  }

  if (
    hasAny(message, [
      "otp_expired",
      "expired",
      "invalid token",
      "email link is invalid",
      "email rate limit",
      "over_email_send_rate_limit",
    ])
  ) {
    return {
      title: "Lien indisponible",
      message:
        "Le lien n’est plus valide ou l’envoi est temporairement limité.",
      hint: "Réessayez dans quelques minutes ou demandez un nouveau lien.",
    };
  }

  if (
    hasAny(message, [
      "failed to fetch",
      "networkerror",
      "network request failed",
      "load failed",
      "fetch failed",
      "econnreset",
      "econnrefused",
      "enotfound",
      "socket hang up",
      "aborterror",
      "timeout",
      "timed out",
    ])
  ) {
    return {
      title: "Connexion au serveur impossible",
      message:
        "Votre navigateur ou votre réseau professionnel bloque peut-être l’accès à iNrCy.",
      hint: "Lancez le diagnostic pour envoyer automatiquement le bilan technique à iNrCy.",
      diagnosticReason: "network",
    };
  }

  if (
    hasAny(message, [
      "auth session missing",
      "session",
      "storage",
      "localstorage",
      "cookie",
      "cookies",
    ])
  ) {
    return {
      title: "Session non conservée",
      message:
        "La connexion semble réussir, mais le navigateur ne conserve pas correctement la session.",
      hint: "Le diagnostic vérifiera les cookies et le stockage navigateur.",
      diagnosticReason: "storage",
    };
  }

  if (
    hasAny(message, [
      "500",
      "502",
      "503",
      "504",
      "server error",
      "internal server error",
      "service unavailable",
    ])
  ) {
    return {
      title: "Service momentanément indisponible",
      message: "Le serveur iNrCy ne répond pas correctement pour le moment.",
      hint: "Vous pouvez relancer un essai ou envoyer le diagnostic à iNrCy.",
      diagnosticReason: "technical",
    };
  }

  const clean = getSimpleFrenchErrorMessage(input, fallback);
  return {
    title: "Erreur technique",
    message: clean,
    hint: "Si le problème persiste, lancez le diagnostic pour transmettre le bilan à iNrCy.",
    diagnosticReason: "technical",
  };
}

function makeLoginError(
  title: string,
  message: string,
  options?: { hint?: string; diagnosticReason?: LoginDiagnosticReason },
): LoginErrorState {
  return {
    title,
    message,
    hint: options?.hint,
    diagnosticReason: options?.diagnosticReason,
  };
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function rint(min: number, max: number) {
  return Math.round(rand(min, max));
}

export default function LoginPage() {
  const [supabaseReady, setSupabaseReady] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [redirectingToDashboard, setRedirectingToDashboard] = useState(false);
  const [error, setError] = useState<LoginErrorState | null>(null);

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
    [],
  );

  const [mounted, setMounted] = useState(false);
  const [dots, setDots] = useState<WanderDot[]>([]);
  const handledHashRef = useRef(false);
  const redirectingToDashboardRef = useRef(false);

  const diagnosticHref = useMemo(() => {
    if (!error?.diagnosticReason) return "/diagnostic";
    const params = new URLSearchParams({
      from: "login",
      reason: error.diagnosticReason,
      auto: "1",
    });
    return `/diagnostic?${params.toString()}`;
  }, [error?.diagnosticReason]);

  useEffect(() => {
    if (typeof window === "undefined" || !supabaseReady) return;

    const supabase = supabaseRef.current;
    if (!supabase) return;

    const hash = window.location.hash;
    const search = window.location.search;
    const hasAuthFlowInUrl =
      hash.includes("access_token=") ||
      hash.includes("error=") ||
      search.includes("error=");

    if (hasAuthFlowInUrl) {
      redirectingToDashboardRef.current = false;
      setRedirectingToDashboard(false);
      setCheckingSession(false);
      return;
    }

    let cancelled = false;
    setCheckingSession(true);

    const redirectToDashboard = () => {
      if (cancelled) return;
      redirectingToDashboardRef.current = true;
      setRedirectingToDashboard(true);
      setCheckingSession(true);
      window.location.replace("/dashboard");
    };

    const ensureExistingSession = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session || cancelled) return;

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!cancelled && !error && user) {
          setActiveBrowserUserId(user.id);
          redirectToDashboard();
        }
      } finally {
        if (!cancelled && !redirectingToDashboardRef.current)
          setCheckingSession(false);
      }
    };

    void ensureExistingSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          redirectingToDashboardRef.current = false;
          setRedirectingToDashboard(false);
          setActiveBrowserUserId(null);
          setCheckingSession(false);
          return;
        }
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION"
        ) {
          setActiveBrowserUserId(session.user.id);
          redirectToDashboard();
        }
      },
    );

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [supabaseReady]);

  // ✅ gestion lien expiré / invalide (2e clic invitation)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash || !hash.includes("error=")) return;

    const params = new URLSearchParams(hash.slice(1));
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description") || "";

    if (
      errorCode === "otp_expired" ||
      errorDesc.toLowerCase().includes("expired") ||
      errorDesc.toLowerCase().includes("invalid")
    ) {
      setInfo(
        "Ce lien n’est plus valide (il a déjà été utilisé ou a expiré). " +
          "Veuillez cliquer sur « Mot de passe oublié » pour en recevoir un nouveau.",
      );
    } else {
      setInfo(
        "Le lien de connexion est invalide. Veuillez cliquer sur « Mot de passe oublié » pour recevoir un nouveau lien.",
      );
    }

    // nettoie l’URL (supprime le #error=...)
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search,
    );
  }, []);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !supabaseReady) return;

      // évite double exécution (React strict mode + rerenders)
      if (handledHashRef.current) return;
      handledHashRef.current = true;

      const hash = window.location.hash;
      if (!hash || !hash.includes("access_token=")) return;

      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const type = params.get("type"); // invite | recovery | etc.

      if (!access_token || !refresh_token) return;

      const supabase = supabaseRef.current;
      if (!supabase) return;

      purgeAllBrowserAccountCaches();
      setActiveBrowserUserId(null);
      await (
        supabase.auth.signOut as (_options?: {
          scope?: "global" | "local" | "others";
        }) => Promise<unknown>
      )({ scope: "local" }).catch(() => null);

      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) {
        console.error("setSession error:", error);
        return;
      }

      const { data: userData } = await supabase.auth
        .getUser()
        .catch(() => ({ data: { user: null } }));
      if (userData?.user?.id) {
        setActiveBrowserUserId(userData.user.id);
      }

      // on redirige d'abord (sans tuer le hash avant)
      const target =
        type === "recovery"
          ? "/set-password?mode=reset"
          : "/set-password?mode=invite";

      // hard redirect + on garde l'historique propre
      window.location.replace(target);
    })();
  }, [supabaseReady]);

  useEffect(() => {
    setMounted(true);

    supabaseRef.current = createClient();
    setSupabaseReady(true);

    const newDots: WanderDot[] = Array.from({ length: 20 }).map(() => ({
      left: `${rint(6, 94)}%`,
      top: `${rint(8, 92)}%`,
      size: rint(9, 14),
      dur: rint(10, 20),
      delay: Math.round(rand(0, 6) * 10) / 10,
      alpha: Math.round(rand(0.55, 0.95) * 100) / 100,

      x1: rint(-90, 90),
      y1: rint(-70, 70),
      x2: rint(-90, 90),
      y2: rint(-70, 70),
      x3: rint(-90, 90),
      y3: rint(-70, 70),
      x4: rint(-90, 90),
      y4: rint(-70, 70),
      x5: rint(-90, 90),
      y5: rint(-70, 70),
    }));

    setDots(newDots);
  }, []);

  // ✅ ajout : reset password
  async function onForgotPassword() {
    setError(null);
    setInfo(null);

    if (!email) {
      setError(
        makeLoginError(
          "Adresse email requise",
          "Veuillez d’abord saisir votre adresse email.",
          { hint: "Nous en avons besoin pour vous envoyer un nouveau lien." },
        ),
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = supabaseRef.current;
      if (!supabase) {
        setError(
          makeLoginError(
            "Service indisponible",
            "Le service d’authentification est momentanément indisponible.",
            {
              hint: "Rechargez la page ou lancez un diagnostic si le problème persiste.",
              diagnosticReason: "technical",
            },
          ),
        );
        return;
      }

      const appOrigin = (
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      ).replace(/\/$/, "");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appOrigin}/auth/finish-reset`,
      });

      if (error) {
        setError(
          friendlyLoginError(
            error,
            "Cette action n’a pas pu aboutir. Merci de réessayer.",
          ),
        );
        return;
      }

      setInfo(
        "Email envoyé. Veuillez vérifier votre boîte mail, y compris vos courriers indésirables.",
      );
    } catch (err: unknown) {
      setError(
        friendlyLoginError(
          err,
          "L’email n’a pas pu être envoyé pour le moment.",
        ),
      );
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
      const supabase = supabaseRef.current;
      if (!supabase) {
        setError(
          makeLoginError(
            "Service indisponible",
            "Le service d’authentification est momentanément indisponible.",
            {
              hint: "Rechargez la page ou lancez un diagnostic si le problème persiste.",
              diagnosticReason: "technical",
            },
          ),
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(
          friendlyLoginError(
            error,
            "Cette action n’a pas pu aboutir. Merci de réessayer.",
          ),
        );
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
        setError(
          makeLoginError(
            "Session non finalisée",
            "La connexion a abouti, mais la session n’a pas pu être finalisée.",
            {
              hint: "Le navigateur peut bloquer les cookies ou le stockage de session.",
              diagnosticReason: "storage",
            },
          ),
        );
        return;
      }

      const { data: userData } = await supabase.auth
        .getUser()
        .catch(() => ({ data: { user: null } }));
      if (userData?.user?.id) {
        setActiveBrowserUserId(userData.user.id);
      }

      // Utilise une redirection navigateur complète pour fiabiliser la navigation
      // après création de session. En CI/Playwright, router.replace()+refresh()
      // pouvait laisser l'utilisateur sur /login et faire échouer l'attente de /dashboard.
      window.location.replace("/dashboard");
    } catch (err: unknown) {
      setError(
        friendlyLoginError(err, "La connexion a échoué. Veuillez réessayer."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen inrcy-soft-noise overflow-hidden">
      <div className="inrcy-noise-overlay" />

      {checkingSession || redirectingToDashboard ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/30 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/70 bg-white/80 px-5 py-4 text-center shadow-xl">
            <div className="text-sm font-black text-slate-800">
              Connexion en cours…
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              Vérification de votre session.
            </div>
          </div>
        </div>
      ) : null}

      <svg
        className="inrcy-lines"
        viewBox="0 0 1200 700"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
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
        <circle
          cx="600"
          cy="350"
          r="260"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />
        <circle
          cx="600"
          cy="350"
          r="210"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />
        <circle
          cx="600"
          cy="350"
          r="155"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />
        <circle
          cx="600"
          cy="350"
          r="110"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />

        <path
          d="M420 240 L520 185 L640 190 L760 255 L820 360 L720 470 L580 505 L460 445 L405 340 Z"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.35"
        />
        <path
          d="M520 185 L600 350 L760 255"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.25"
        />
        <path
          d="M460 445 L600 350 L820 360"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.25"
        />
        <path
          d="M420 240 L600 350 L580 505"
          fill="none"
          stroke="url(#gLine)"
          strokeWidth="1"
          opacity="0.25"
        />

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
                style={
                  {
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
                  } as CSSVars
                }
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
              Espace Client
            </div>
            <div className="text-xs text-slate-500 text-center">
              Accèdez à votre générateur et ses ressources.
            </div>
          </div>

          {/* ✅ évite l’overlay hydration quand une extension modifie les inputs */}
          <form
            suppressHydrationWarning
            onSubmit={onSubmit}
            className="space-y-3"
          >
            <div className="relative">
              <input
                suppressHydrationWarning
                className="inrcy-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                ✉️
              </span>
            </div>

            <div className="relative">
              <input
                suppressHydrationWarning
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
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {error ? (
              <div className={styles.loginErrorBox} role="alert">
                <div className={styles.loginErrorBadge}>Erreur</div>
                <div>
                  <div className={styles.loginErrorTitle}>{error.title}</div>
                  <div className={styles.loginErrorText}>{error.message}</div>
                  {error.hint ? (
                    <div className={styles.loginErrorHint}>{error.hint}</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ✅ ajout : message succès */}
            {info ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {info}
              </div>
            ) : null}

            <button
              className="inrcy-btn w-full"
              type="submit"
              disabled={
                loading ||
                checkingSession ||
                redirectingToDashboard ||
                !supabaseReady
              }
            >
              {loading
                ? "Connexion..."
                : checkingSession || redirectingToDashboard
                  ? "Vérification..."
                  : !supabaseReady
                    ? "Initialisation..."
                    : "Se connecter"}
            </button>

            {/* ✅ aide connexion */}
            <div
              className={
                error?.diagnosticReason
                  ? styles.loginActions
                  : styles.loginActionsSolo
              }
            >
              <button
                type="button"
                onClick={onForgotPassword}
                className={styles.forgotButton}
                disabled={
                  loading ||
                  checkingSession ||
                  redirectingToDashboard ||
                  !supabaseReady
                }
              >
                Mot de passe oublié ?
              </button>

              {error?.diagnosticReason ? (
                <a className={styles.diagnosticButton} href={diagnosticHref}>
                  <span className={styles.diagnosticButtonIcon}>✦</span>
                  Diagnostiquer l’erreur
                </a>
              ) : null}
            </div>
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
