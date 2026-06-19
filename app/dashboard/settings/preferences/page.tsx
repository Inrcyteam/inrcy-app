import SettingsShell from "../SettingsShell";
import GeneralPreferencesContent from "../_components/GeneralPreferencesContent";

export default function PreferencesSettingsPage() {
  return (
    <SettingsShell
      title="Préférences générales"
      subtitle="Langue client, fuseau horaire, formats, devise et apparence globale."
    >
      <GeneralPreferencesContent mode="page" />
    </SettingsShell>
  );
}
