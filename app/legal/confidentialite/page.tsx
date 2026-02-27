import LegalPageShell from "../_components/LegalPageShell";
import styles from "../legal.module.css";

export const metadata = {
  title: "Politique de confidentialité — iNrCy",
};

export default function ConfidentialitePage() {
  return (
    <LegalPageShell
      title="Politique de confidentialité"
      subtitle="Informations RGPD sur les traitements de données effectués via iNrCy."
    >
      <section>
        <h2 className={styles.h2}>1. Responsable du traitement</h2>
        <p className={styles.p}>
          Le responsable du traitement est <strong>iNrCy</strong> (SAS), 1 rue de Fouquières — 62440 Harnes — France.
          <br />
          Contact RGPD : contact@inrcy.com
        </p>

        {/* ... le reste inchangé ... */}
      </section>
    </LegalPageShell>
  );
}