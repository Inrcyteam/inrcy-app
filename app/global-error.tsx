"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "Inter, Arial, sans-serif", background: "#081226", color: "#fff" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 560, width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.28)" }}>
            <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 8 }}>iNrCy</div>
            <h1 style={{ margin: "0 0 12px", fontSize: 28, lineHeight: 1.15 }}>Oups, une erreur est survenue.</h1>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, opacity: 0.92 }}>
              L'action demandée n'a pas pu être finalisée pour le moment. Merci de réessayer dans quelques instants.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
              <button
                onClick={() => reset()}
                style={{ border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}
              >
                Réessayer
              </button>
              <a
                href="/dashboard"
                style={{ color: "#fff", textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: "12px 16px", fontWeight: 700 }}
              >
                Retour au tableau de bord
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
