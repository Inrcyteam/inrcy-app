import LegalPageShell from "../_components/LegalPageShell";
import styles from "../legal.module.css";

export const metadata = {
  title: "Mentions légales — iNrCy",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPageShell
      title="Mentions légales"
      subtitle="Éditeur, hébergement, responsabilité, propriété intellectuelle."
    >
      <section>
        <h2 className={styles.h2}>Éditeur du site et du logiciel</h2>
        <p className={styles.p}>
          Le présent site internet ainsi que le logiciel en ligne (SaaS) iNrCy sont édités par :
          <br />
          <strong>iNrCy</strong>, société par actions simplifiée (SAS) au capital de 10 000 €,
          immatriculée au Registre du Commerce et des Sociétés d’Arras sous le numéro <strong>994 652 378</strong>.
          <br />
          Siège social : 1, rue de Fouquières — 62440 Harnes — France
          <br />
          SIRET : 994 652 378 00013
          <br />
          TVA intracommunautaire : FR 78 994 652 378
        </p>

        {/* ... le reste inchangé ... */}
      </section>
    </LegalPageShell>
  );
}