"use client";

import styles from "../legal.module.css";

export default function ConfidentialiteContent() {
  return (
    <section>
      <h2 className={styles.h2}>1. Responsable du traitement</h2>
      <p className={styles.p}>
        Le responsable du traitement est <strong>iNrCy</strong> (SAS), 1 rue de Fouquières — 62440 Harnes — France.
        <br />
        Contact RGPD : contact@inrcy.com
      </p>
      <p className={styles.p}>
        Lorsque le Client utilise le générateur iNrCy pour gérer ses propres clients, prospects, contacts, destinataires,
        campagnes, publications, devis ou factures, le Client demeure responsable de traitement pour ces données. iNrCy
        intervient alors comme prestataire technique et sous-traitant, dans la limite des fonctionnalités utilisées.
      </p>

      <h2 className={styles.h2}>2. Données traitées</h2>
      <p className={styles.p}>Selon les fonctionnalités utilisées, iNrCy peut traiter les catégories de données suivantes :</p>
      <ul className={styles.ul}>
        <li>Données de compte : nom, prénom, email, téléphone, société, identifiants, profil, rôle et paramètres.</li>
        <li>Données d’essai gratuit, d’abonnement, de facturation et de support.</li>
        <li>Données d’usage : actions dans l’application, préférences, journaux techniques, logs de sécurité, erreurs et statistiques d’utilisation.</li>
        <li>Données CRM : contacts, prospects, clients, notes, historiques, tags, listes, destinataires et messages.</li>
        <li>Données de communication : publications, campagnes, mails, propulsions, fidélisations, brouillons, contenus générés et historiques iNrSend.</li>
        <li>Données médias : images, vidéos, fichiers joints, aperçus, variantes techniques, cadrages, éléments audio ou transcriptions lorsque ces fonctionnalités sont utilisées.</li>
        <li>Données de connexion aux canaux tiers : identifiants techniques, jetons d’accès, pages, comptes, boîtes mails, signatures et paramètres d’intégration.</li>
        <li>Données de documents : devis, factures, modèles, statuts, pièces jointes, preuves d’envoi et historiques associés.</li>
        <li>Données de paiement : traitées par Stripe ; iNrCy ne stocke pas les numéros complets de carte bancaire.</li>
      </ul>

      <h2 className={styles.h2}>3. Finalités et bases légales</h2>
      <ul className={styles.ul}>
        <li>Création, activation et gestion du compte iNrCy : exécution du contrat ou mesures précontractuelles.</li>
        <li>Fourniture du générateur iNrCy et de ses modules : exécution du contrat.</li>
        <li>Gestion des essais, abonnements, paiements et facturation : exécution du contrat et obligations légales.</li>
        <li>Connexion aux services tiers demandés par le Client : exécution du contrat et autorisation du Client.</li>
        <li>Envoi d’emails de service, notifications, rappels, messages de sécurité et support : exécution du contrat ou intérêt légitime.</li>
        <li>Amélioration, diagnostic, sécurité, prévention de la fraude et correction d’incidents : intérêt légitime.</li>
        <li>Respect des obligations légales, comptables, fiscales ou de preuve : obligation légale ou intérêt légitime.</li>
        <li>Cookies et traceurs non strictement nécessaires : consentement lorsque celui-ci est requis.</li>
      </ul>

      <h2 className={styles.h2}>4. Intelligence artificielle et génération de contenus</h2>
      <p className={styles.p}>
        Lorsque le Client utilise les fonctionnalités d’intelligence artificielle, les informations fournies dans
        l’application peuvent être utilisées pour produire des suggestions, reformulations, textes, titres, campagnes,
        publications ou recommandations. Le Client doit vérifier les contenus avant toute utilisation ou diffusion.
      </p>
      <p className={styles.p}>
        Les données transmises aux prestataires techniques d’intelligence artificielle le sont uniquement pour fournir la
        fonctionnalité demandée, dans la limite des paramètres et garanties applicables au service.
      </p>

      <h2 className={styles.h2}>5. Destinataires et sous-traitants</h2>
      <p className={styles.p}>
        Les données peuvent être traitées par des prestataires agissant comme sous-traitants ou services techniques,
        uniquement pour l’exécution du service :
      </p>
      <ul className={styles.ul}>
        <li><strong>Supabase</strong> : authentification, base de données, stockage et fonctions server-side.</li>
        <li><strong>Vercel</strong> : hébergement, déploiement et exécution de l’application web.</li>
        <li><strong>Stripe</strong> : paiements, abonnements et facturation.</li>
        <li><strong>OVHcloud</strong> : hébergement d’infrastructures, sites ou services associés.</li>
        <li>Fournisseurs de messagerie, SMTP, IMAP ou Microsoft/Google lorsque le Client connecte une boîte mail.</li>
        <li>Services tiers connectés à la demande du Client : Google, Meta, LinkedIn, Microsoft et autres plateformes compatibles.</li>
        <li>Prestataires d’intelligence artificielle, d’analyse technique, de supervision, de sécurité ou de support, lorsque nécessaires au service.</li>
      </ul>
      <p className={styles.p}>
        Certains destinataires peuvent également être les plateformes ou services tiers choisis par le Client lors d’une
        publication, d’un envoi, d’une connexion ou d’une synchronisation.
      </p>

      <h2 className={styles.h2}>6. Durées de conservation</h2>
      <ul className={styles.ul}>
        <li>Comptes en essai : si aucun abonnement n’est souscrit avant la fin de l’essai, le compte et les données associées peuvent être supprimés automatiquement après un délai raisonnable.</li>
        <li>Compte abonné : conservation pendant la durée de la relation contractuelle, puis archivage ou suppression selon les obligations applicables.</li>
        <li>Journaux techniques et sécurité : conservation pendant la durée nécessaire au diagnostic, à la sécurité, à la preuve et à la prévention de la fraude.</li>
        <li>Jetons et connexions aux services tiers : conservation tant que la connexion est active ou jusqu’à révocation/déconnexion, hors traces nécessaires à la sécurité et à la preuve.</li>
        <li>Documents de facturation iNrCy : conservation selon les obligations légales applicables.</li>
      </ul>
      <p className={styles.p}>Dans l’historique iNrSend actif, les durées d’affichage sont les suivantes :</p>
      <ul className={styles.ul}>
        <li>Publications, Propulsions, Fidélisations et Mails : 12 mois ;</li>
        <li>Devis et Factures : 24 mois.</li>
      </ul>
      <p className={styles.p}>
        Ces durées concernent uniquement l’affichage dans iNrSend. Le professionnel reste responsable de la conservation
        légale de ses propres documents, notamment comptables, fiscaux et commerciaux.
      </p>

      <h2 className={styles.h2}>7. Sécurité</h2>
      <p className={styles.p}>
        iNrCy met en œuvre des mesures techniques et organisationnelles raisonnables afin de protéger les données contre
        l’accès non autorisé, la perte, l’altération, la divulgation ou la destruction. Le Client demeure responsable de
        la confidentialité de ses identifiants, de la gestion de ses accès et des droits accordés à ses collaborateurs ou
        prestataires.
      </p>

      <h2 className={styles.h2}>8. Vos droits</h2>
      <p className={styles.p}>
        Conformément au RGPD, vous disposez, lorsque cela s’applique, de droits d’accès, de rectification, d’effacement,
        de limitation, d’opposition et de portabilité. Vous pouvez exercer vos droits en contactant : contact@inrcy.com.
      </p>
      <p className={styles.p}>
        Lorsque la demande concerne des données traitées par iNrCy pour le compte d’un Client professionnel, iNrCy peut
        transmettre la demande au Client concerné ou agir sur ses instructions.
      </p>

      <h2 className={styles.h2}>9. Cookies et traceurs</h2>
      <p className={styles.p}>
        Des cookies strictement nécessaires peuvent être utilisés pour le fonctionnement du site et de l’application.
        Des cookies de mesure d’audience, d’amélioration du service ou de services tiers peuvent être soumis à
        consentement selon leur nature et le paramétrage retenu. Les préférences peuvent être gérées depuis le bandeau
        ou le gestionnaire de consentement lorsqu’il est affiché.
      </p>

      <h2 className={styles.h2}>10. Transferts hors Union européenne</h2>
      <p className={styles.p}>
        Certains prestataires ou services tiers peuvent traiter des données hors Union européenne. Dans ce cas, iNrCy
        veille à ce que des garanties appropriées soient mises en place lorsque cela est nécessaire, telles qu’une
        décision d’adéquation, des clauses contractuelles types ou tout autre mécanisme reconnu.
      </p>

      <h2 className={styles.h2}>11. Mise à jour de la politique</h2>
      <p className={styles.p}>
        La présente Politique de confidentialité peut être mise à jour pour tenir compte de l’évolution du logiciel, des
        traitements, des prestataires ou de la réglementation. La version applicable est celle accessible dans
        l’application et sur les pages légales iNrCy.
      </p>
    </section>
  );
}
