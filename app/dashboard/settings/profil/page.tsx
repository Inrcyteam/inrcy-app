import SettingsShell from "../SettingsShell";
import ProfilContent from "../_components/ProfilContent";

export default function ProfilPage() {
  return (
    <SettingsShell
      title="Mon profil"
      subtitle="Vos informations et celles de votre entreprise (utilisées par iNrCy)."
    >
      <ProfilContent mode="page" />
    </SettingsShell>
  );
}

