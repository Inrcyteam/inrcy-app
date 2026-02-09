import SettingsShell from "../SettingsShell";
import ActivityContent from "../_components/ActivityContent";

export default function ActivitePage() {
  return (
    <SettingsShell
      title="Mon activité"
      subtitle="Métier, zones, horaires et forces (utilisés pour générer vos communications)."
    >
      <ActivityContent mode="page" />
    </SettingsShell>
  );
}
