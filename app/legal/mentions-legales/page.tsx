import LegalPageShell from "../_components/LegalPageShell";
import MentionsLegalesContent from "../_components/MentionsLegalesContent";

export const metadata = {
  title: "Mentions légales — iNrCy",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell
      title="Mentions légales"
      subtitle="Éditeur, hébergement, responsabilité, propriété intellectuelle."
    >
      <MentionsLegalesContent />
    </LegalPageShell>
  );
}
