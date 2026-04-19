"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabaseClient";
import { setActiveBrowserUserId } from "@/lib/browserAccountCache";

type Mode = "invite" | "reset";

type Props = {
  mode: Mode;
};

function normalizeEmail(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function safeContinuePath(input: string | null, fallback: string) {
  if (!input) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  return input;
}

function buildFallbackUrl(mode: Mode, code?: string | null, description?: string | null, email?: string | null) {
  const target = new URL(`/set-password?mode=${mode === "invite" ? "invite" : "reset"}`, window.location.origin);
  if (email) target.searchParams.set("email", email);
  if (code) target.searchParams.set("error_code", code);
  if (description) target.searchParams.set("error_description", description);
  return target.toString();
}

function buildSwitchAccountUrl(currentEmail: string, expectedEmail: string) {
  const url = new URL("/auth/switch-account", window.location.origin);
  url.searchParams.set("current_email", currentEmail);
  url.searchParams.set("expected_email", expectedEmail);
  url.searchParams.set("continue", `${window.location.pathname}${window.location.search}`);
  return url.toString();
}

export default function FinishEmailLinkClient({ mode }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tokenHash = searchParams.get("token_hash") || "";
  const rawType = searchParams.get("type");
  const type = (rawType || (mode === "invite" ? "invite" : "recovery")) as EmailOtpType;
  const expectedEmail = normalizeEmail(searchParams.get("email"));
  const fallbackNext = mode === "invite" ? "/set-password?mode=invite" : "/set-password?mode=reset";
  const nextPath = safeContinuePath(searchParams.get("next") || fallbackNext, fallbackNext);

  useEffect(() => {
    let cancelled = false;

    const checkCurrentSession = async () => {
      if (!expectedEmail) {
        if (!cancelled) setReady(true);
        return;
      }

      const { data, error } = await supabase.auth.getUser().catch(() => ({ data: { user: null }, error: null }));
      if (cancelled) return;

      const currentUser = data?.user;
      if (error || !currentUser) {
        setReady(true);
        return;
      }

      if (currentUser.id) {
        setActiveBrowserUserId(currentUser.id);
      }

      const currentEmail = normalizeEmail(currentUser.email);
      if (currentEmail && currentEmail !== expectedEmail) {
        window.location.replace(buildSwitchAccountUrl(currentEmail, expectedEmail));
        return;
      }

      setReady(true);
    };

    void checkCurrentSession();

    return () => {
      cancelled = true;
    };
  }, [expectedEmail, supabase]);

  const handleContinue = async () => {
    if (!tokenHash) {
      window.location.replace(buildFallbackUrl(mode, "access_denied", "Lien invalide ou incomplet.", expectedEmail));
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

      if (error) {
        window.location.replace(buildFallbackUrl(mode, error.code, error.message, expectedEmail));
        return;
      }

      const user = data.user;
      const verifiedEmail = normalizeEmail(user?.email);

      if (expectedEmail && verifiedEmail && verifiedEmail !== expectedEmail) {
        window.location.replace(
          buildFallbackUrl(mode, "email_mismatch", "Ce lien ne correspond pas au compte attendu.", expectedEmail),
        );
        return;
      }

      if (user?.id) {
        setActiveBrowserUserId(user.id);
      }

      const target = new URL(nextPath, window.location.origin);
      if (!target.searchParams.get("email") && (expectedEmail || verifiedEmail) && target.pathname === "/set-password") {
        target.searchParams.set("email", expectedEmail || verifiedEmail || "");
      }

      window.location.replace(target.toString());
    } catch (error) {
      console.error(error);
      setMessage(
        mode === "invite"
          ? "Impossible de finaliser l’activation pour le moment. Réessayez ou demandez un nouveau lien d’invitation."
          : "Impossible de finaliser la réinitialisation pour le moment. Réessayez ou demandez un nouveau lien.",
      );
      setLoading(false);
    }
  };

  const title = mode === "invite" ? "Finaliser votre activation" : "Finaliser la réinitialisation";
  const body =
    mode === "invite"
      ? "Nous allons vérifier votre lien puis vous laisser choisir votre mot de passe."
      : "Nous allons vérifier votre lien puis vous laisser définir un nouveau mot de passe.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          {mode === "invite" ? "Activation du compte" : "Réinitialisation du mot de passe"}
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-200">{body}</p>
        {expectedEmail ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Compte attendu : <strong>{expectedEmail}</strong>
          </p>
        ) : null}

        {message ? <p className="mt-5 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{message}</p> : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!ready || loading}
            className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!ready ? "Vérification…" : loading ? "Traitement…" : "Continuer"}
          </button>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
          >
            Retour à la connexion
          </Link>
        </div>
      </div>
    </main>
  );
}
