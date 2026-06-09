import type { Metadata } from "next";

import DiagnosticClient from "./DiagnosticClient";

export const metadata: Metadata = {
  title: "Diagnostic réseau · iNrCy",
  description: "Diagnostic de compatibilité réseau pour les postes professionnels sécurisés.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DiagnosticPage() {
  return <DiagnosticClient />;
}
