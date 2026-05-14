import SettingsShell from "../SettingsShell";
import AiConfigurationContent from "../_components/AiConfigurationContent";

export default function IaSettingsPage() {
  return (
    <SettingsShell
      title="Configuration IA"
      subtitle="Préférences globales utilisées par iNrCy pour générer des contenus à votre image."
    >
      <AiConfigurationContent mode="page" />
    </SettingsShell>
  );
}
