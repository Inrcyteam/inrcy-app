import SettingsShell from "../SettingsShell";
import ContactContent from "../_components/ContactContent";

export default function ContactPage() {
  return (
    <SettingsShell
      title="Nous contacter"
      subtitle="Décrivez votre demande, nous vous répondrons rapidement."
    >
      <ContactContent mode="page" />
    </SettingsShell>
  );
}


