import LegalPageShell from "../_components/LegalPageShell";
import CgaContent from "../_components/CgaContent";

export const metadata = {
  title: "CGA — iNrCy",
};

export default function CgaPage() {
  return (
    <LegalPageShell
      title="CGA"
      subtitle="Version du 11/02/2026"
    >
      <CgaContent />
    </LegalPageShell>
  );
}
