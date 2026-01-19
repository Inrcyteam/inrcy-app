"use client";

import Link from "next/link";

type Props = {
  mode?: "page" | "drawer";
};

export default function AbonnementContent({ mode = "page" }: Props) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Mon plan</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Plan : — • Statut : — • Renouvellement : —
        </p>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Changer / Résilier</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Pour modifier ton abonnement, contacte-nous. Les changements se font via le site ou par mail.
        </p>
      </div>

      {mode === "drawer" && (
        <div style={{ opacity: 0.8 }}>
          <Link href="/dashboard/settings/abonnement">Ouvrir en pleine page →</Link>
        </div>
      )}
    </div>
  );
}

