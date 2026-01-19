"use client";

import Link from "next/link";

type Props = {
  mode?: "page" | "drawer";
};

export default function ContactContent({ mode = "page" }: Props) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Support iNrCy</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Une question, un souci technique, ou une demande liée à l’abonnement ?
          Écris-nous, on te répond sous 24 à 48h.
        </p>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Formulaire</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          (Bientôt) Sujet + message + envoi vers Supabase (ticket).
        </p>
      </div>

      {mode === "drawer" && (
        <div style={{ opacity: 0.8 }}>
          <Link href="/dashboard/settings/contact">Ouvrir en pleine page →</Link>
        </div>
      )}
    </div>
  );
}
