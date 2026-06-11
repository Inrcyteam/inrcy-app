import LegalPageShell from "../_components/LegalPageShell";
import CgaContent from "../_components/CgaContent";

export const metadata = {
  title: "CGA et Conditions d’utilisation — iNrCy",
};

export default function CgaPage() {
  return (
    <LegalPageShell
      title="CGA et Conditions d’utilisation"
      subtitle="Version du 11/06/2026"
    >
      <CgaContent />
    </LegalPageShell>
  );
}
