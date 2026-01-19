import SettingsShell from "../SettingsShell";
import AbonnementContent from "../_components/AbonnementContent";

export default function AbonnementPage() {
  return (
    <SettingsShell
      title="Mon abonnement"
      subtitle="Informations de plan et statut. Les changements se font via le site ou par mail."
    >
      <AbonnementContent mode="page" />
    </SettingsShell>
  );
}

