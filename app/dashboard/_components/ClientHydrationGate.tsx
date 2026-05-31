"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type ClientHydrationGateProps = {
  children: ReactNode;
  label?: string;
};

function StableBootScreen({ label = "Chargement de votre espace iNrCy..." }: { label?: string }) {
  return (
    <main
      aria-busy="true"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        color: "white",
        background:
          "radial-gradient(circle at 20% 15%, rgba(56,189,248,.20), transparent 28%), radial-gradient(circle at 78% 20%, rgba(244,114,182,.18), transparent 26%), linear-gradient(135deg, #0f172a, #1e1b4b 55%, #111827)",
      }}
    >
      <div
        style={{
          width: "min(420px, 92vw)",
          borderRadius: "24px",
          padding: "22px",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(15,23,42,.58)",
          boxShadow: "0 24px 80px rgba(0,0,0,.35)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>iNrCy</div>
        <div style={{ fontSize: "14px", lineHeight: 1.45, color: "rgba(255,255,255,.78)", fontWeight: 700 }}>{label}</div>
      </div>
    </main>
  );
}

export default function ClientHydrationGate({ children, label }: ClientHydrationGateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <StableBootScreen label={label} />;
  return <>{children}</>;
}
