import LegalPageShell from "../_components/LegalPageShell";
import ConfidentialiteContent from "../_components/ConfidentialiteContent";

export const metadata = {
  title: "Politique de confidentialité — iNrCy",
};

export default function ConfidentialitePage() {
  return (
    <LegalPageShell
      title="Politique de confidentialité"
      subtitle="Informations RGPD sur les traitements de données effectués via iNrCy."
    >
      {/* Le contenu complet est partagé avec l'app pour éviter les divergences. */}
      <ConfidentialiteContent />
    </LegalPageShell>
  );
}