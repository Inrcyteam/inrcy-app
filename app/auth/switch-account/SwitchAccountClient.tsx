"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { purgeAllBrowserAccountCaches, setActiveBrowserUserId } from "@/lib/browserAccountCache";

function safeContinuePath(input: string | null) {
  if (!input) return "/login";
  if (!input.startsWith("/") || input.startsWith("//")) return "/login";
  return input;
}

type Props = {
  currentEmail: string | null;
  expectedEmail: string | null;
  continuePath: string | null;
};

export default function SwitchAccountClient({ currentEmail, expectedEmail, continuePath }: Props) {
  const nextPath = useMemo(() => safeContinuePath(continuePath), [continuePath]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      purgeAllBrowserAccountCaches();
      setActiveBrowserUserId(null);
      await (supabase.auth.signOut as any)({ scope: "local" });
      window.location.replace(nextPath);
    } catch (e) {
      console.error(e);
      setError("Impossible de basculer de compte pour le moment. Veuillez vous déconnecter puis réessayer.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Sécurité du compte</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Changer de compte avant de continuer</h1>
        <p className="mt-4 text-sm leading-6 text-slate-200">
          Ce lien est prévu pour <strong>{expectedEmail || "le compte invité"}</strong>
          {currentEmail ? <> alors que ce navigateur est déjà connecté avec <strong>{currentEmail}</strong>.</> : <>.</>}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Pour éviter de mélanger les sessions et les données, iNrCy doit d’abord fermer le compte actuellement ouvert dans ce navigateur.
        </p>

        {error ? <p className="mt-5 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Déconnexion en cours…" : "Se déconnecter et continuer"}
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
