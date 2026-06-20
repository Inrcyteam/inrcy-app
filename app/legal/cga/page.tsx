import LegalPageShell from "../_components/LegalPageShell";
import CgaContent from "../_components/CgaContent";

export const metadata = {
  title: "CGA — Conditions Générales d’Abonnement et Conditions d’Utilisation iNrCy",
};

export default function CgaPage() {
  return (
    <LegalPageShell
      title="CGA — Conditions Générales d’Abonnement et Conditions d’Utilisation iNrCy"
      subtitle="Version du 11/06/2026"
    >
      <CgaContent />
    </LegalPageShell>
  );
}
