import LegalPageShell from "../_components/LegalPageShell";
import styles from "../legal.module.css";

export const metadata = {
  title: "CGA — iNrCy",
};

export default function CgaPage() {
  return (
    <LegalPageShell
      title="CGA"
      subtitle="Version du 11/02/2026"
    >
      <section>
        <h2 className={styles.h2}>Article 1 — Objet</h2>
        <p className={styles.p}>
          Les présentes Conditions Générales d’Abonnement (« CGA ») définissent les modalités dans lesquelles la société
          iNrCy, SAS, met à disposition des professionnels un logiciel en ligne (Software as a Service — SaaS),
          accessible par abonnement.
        </p>
        <p className={styles.p}>Le service principal consiste en la mise à disposition du logiciel iNrCy.</p>
        <p className={styles.p}>Des services complémentaires peuvent être proposés, notamment :</p>
        <ul className={styles.ul}>
          <li>Location de site internet</li>
          <li>Vente de site internet</li>
          <li>Prestations digitales associées</li>
        </ul>

        {/* ... le reste inchangé ... */}
      </section>
    </LegalPageShell>
  );
}