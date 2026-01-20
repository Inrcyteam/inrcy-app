"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function SetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setLoading(false);
      setMsg("Session introuvable. Réouvre le lien reçu par email.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) return setMsg(error.message);

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="inrcy-card w-full max-w-[420px] p-6 space-y-3">
        <div className="font-semibold">Définir mon mot de passe</div>
        <input
          className="inrcy-input"
          type="password"
          placeholder="Nouveau mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {msg ? <div className="text-sm text-red-600">{msg}</div> : null}
        <button className="inrcy-btn w-full" disabled={loading}>
          {loading ? "Enregistrement..." : "Valider"}
        </button>
      </form>
    </main>
  );
}
