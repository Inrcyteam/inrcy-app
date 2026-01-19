import SettingsShell from "../SettingsShell";
import ContactContent from "../_components/ContactContent";

export default function ContactPage() {
  return (
    <SettingsShell
      title="Nous contacter"
      subtitle="Décris ta demande, on te répond rapidement."
    >
      <ContactContent mode="page" />
    </SettingsShell>
  );
}


