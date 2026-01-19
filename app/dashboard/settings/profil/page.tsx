import SettingsShell from "../SettingsShell";
import ProfilContent from "../_components/ProfilContent";

export default function ProfilPage() {
  return (
    <SettingsShell
      title="Mon profil"
      subtitle="Tes informations + celles de ton entreprise (utilisées par iNrCy)."
    >
      <ProfilContent mode="page" />
    </SettingsShell>
  );
}

