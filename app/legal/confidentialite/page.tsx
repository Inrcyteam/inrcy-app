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

        <h2 className={styles.h2}>2. Données traitées</h2>
        <ul className={styles.ul}>
          <li>Données de compte : email, identifiants, informations de profil.</li>
          <li>Données d’usage : actions dans l’application, paramètres, journaux techniques.</li>
          <li>Données CRM (si utilisées) : informations sur vos prospects/clients, messages, notes.</li>
          <li>Données de paiement : gérées par Stripe (iNrCy ne stocke pas les numéros de carte).</li>
        </ul>

        <h2 className={styles.h2}>3. Finalités et bases légales</h2>
        <ul className={styles.ul}>
          <li>Fourniture du service iNrCy (exécution du contrat).</li>
          <li>Gestion des essais, abonnements, facturation (exécution du contrat / obligation légale comptable).</li>
          <li>Sécurité, prévention de la fraude et amélioration du service (intérêt légitime).</li>
          <li>Envoi d’emails de service (informations, relances d’essai, incidents) (exécution du contrat / intérêt légitime).</li>
        </ul>

        <h2 className={styles.h2}>4. Destinataires — Sous-traitants</h2>
        <p className={styles.p}>
          Les données peuvent être traitées par des prestataires agissant comme sous-traitants, uniquement pour
          l’exécution du service :
        </p>
        <ul className={styles.ul}>
          <li><strong>Supabase</strong> : authentification, base de données, fonctions server-side.</li>
          <li><strong>Stripe</strong> : paiements, abonnements, facturation.</li>
          <li><strong>Vercel</strong> : hébergement et exécution de l’application web.</li>
          <li><strong>OVHcloud</strong> : hébergement d’infrastructures et/ou services associés.</li>
          <li>Fournisseur SMTP transactionnel (selon configuration) : envoi d’emails de service.</li>
          <li>Services tiers connectés à votre demande (Google, Meta, Microsoft, etc.) pour les intégrations.</li>
        </ul>

        <h2 className={styles.h2}>5. Durées de conservation</h2>
        <ul className={styles.ul}>
          <li>
            Comptes en essai : si aucun abonnement n’est souscrit avant la fin de l’essai, le compte et les données
            associées peuvent être supprimés automatiquement.
          </li>
          <li>Compte abonné : conservation pendant la durée de la relation contractuelle, puis archivage légal si nécessaire.</li>
          <li>Données de facturation : conservation selon les obligations légales applicables.</li>
        </ul>

        <h2 className={styles.h2}>6. Vos droits</h2>
        <p className={styles.p}>
          Conformément au RGPD, vous disposez de droits d’accès, rectification, effacement, limitation, opposition et
          portabilité lorsque cela s’applique. Vous pouvez exercer vos droits en contactant : contact@inrcy.com.
        </p>

        <h2 className={styles.h2}>7. Cookies</h2>
        <p className={styles.p}>
          Des cookies strictement nécessaires peuvent être utilisés pour le fonctionnement du site et de l’application.
          D’autres cookies (mesure d’audience / services tiers) peuvent être soumis à consentement selon le
          paramétrage.
        </p>

        <h2 className={styles.h2}>8. Transferts hors UE</h2>
        <p className={styles.p}>
          Certains prestataires peuvent traiter des données hors Union Européenne. Dans ce cas, iNrCy s’assure que des
          garanties appropriées sont en place (ex. clauses contractuelles types, décision d’adéquation) lorsque
          nécessaire.
        </p>
      </section>
    </LegalPageShell>
  );
}
