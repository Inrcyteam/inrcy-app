"use client";

import styles from "../legal.module.css";

export default function CgaContent() {
  return (
    <section>
      <h2 className={styles.h2}>Article 1 — Objet</h2>
      <p className={styles.p}>
        Les présentes Conditions Générales d’Abonnement et d’Utilisation (« CGA ») définissent les modalités dans
        lesquelles la société <strong>iNrCy</strong>, SAS, met à disposition des professionnels son générateur iNrCy,
        logiciel en ligne accessible en mode SaaS, ainsi que les règles applicables à son utilisation.
      </p>
      <p className={styles.p}>
        Le service s’adresse exclusivement à des professionnels agissant pour les besoins de leur activité. Il n’est pas
        destiné aux consommateurs.
      </p>

      <h2 className={styles.h2}>Article 2 — Acceptation des conditions</h2>
      <p className={styles.p}>
        L’activation d’un compte, la souscription d’un abonnement, l’utilisation du logiciel ou la validation d’un lien
        de paiement emporte acceptation pleine et entière des présentes CGA, de la Politique de confidentialité et des
        Mentions légales accessibles dans l’application.
      </p>
      <p className={styles.p}>
        Les présentes CGA constituent le socle contractuel applicable à l’utilisation du générateur iNrCy, sauf accord
        écrit spécifique conclu entre iNrCy et le Client.
      </p>

      <h2 className={styles.h2}>Article 3 — Description du générateur iNrCy</h2>
      <p className={styles.p}>Le générateur iNrCy permet notamment :</p>
      <ul className={styles.ul}>
        <li>la centralisation des outils de communication d’un professionnel ;</li>
        <li>la connexion et le pilotage de canaux tels que site iNrCy, site web, Google Business Profile, Facebook, Instagram, LinkedIn, Mails et canaux à venir ;</li>
        <li>la création et la publication de contenus via le module Booster / Publier ;</li>
        <li>la gestion d’actions commerciales via Propulser et Fidéliser ;</li>
        <li>la gestion de contacts, messages, campagnes, devis, factures et historiques via iNrSend ;</li>
        <li>l’accès à des statistiques, indicateurs et recommandations via iNrStats ;</li>
        <li>l’utilisation d’outils d’intelligence artificielle d’assistance à la rédaction, à la préparation de contenus et à l’organisation des actions.</li>
      </ul>
      <p className={styles.p}>
        Certaines fonctionnalités peuvent évoluer, être ajoutées, limitées, suspendues ou adaptées en fonction des
        contraintes techniques, des API de services tiers, de la sécurité, de la réglementation ou de l’offre souscrite.
      </p>

      <h2 className={styles.h2}>Article 4 — Accès, essai gratuit et abonnement</h2>
      <p className={styles.p}>
        L’accès au générateur iNrCy peut être proposé sous forme d’essai gratuit, d’accès de démonstration ou
        d’abonnement payant. Les conditions commerciales applicables sont celles indiquées au moment de l’activation,
        de la souscription ou dans l’accord conclu avec le Client.
      </p>
      <p className={styles.p}>
        L’abonnement est conclu pour une durée mensuelle, sauf stipulation contraire. Il est reconduit tacitement à
        chaque période, sauf résiliation dans les conditions prévues. Toute période entamée reste due.
      </p>

      <h2 className={styles.h2}>Article 5 — Prix, paiement et facturation</h2>
      <p className={styles.p}>
        Les prix sont indiqués en euros hors taxes, sauf mention contraire. Le paiement peut être effectué via Stripe ou
        tout autre moyen validé par iNrCy. Le Client est responsable de la validité de son moyen de paiement et de la
        bonne transmission de ses informations de facturation.
      </p>
      <p className={styles.p}>
        En cas d’échec de paiement, de retard ou d’impayé, iNrCy peut suspendre tout ou partie des accès jusqu’à
        régularisation, sans préjudice des sommes dues.
      </p>

      <h2 className={styles.h2}>Article 6 — Droit d’utilisation du logiciel</h2>
      <p className={styles.p}>
        L’abonnement confère au Client un droit personnel, limité, non exclusif, non cessible et non transférable
        d’accès et d’utilisation du logiciel pendant la durée de l’abonnement. Aucun droit de propriété intellectuelle
        n’est transféré au Client.
      </p>
      <p className={styles.p}>
        Le Client s’interdit toute reproduction, extraction, revente, mise à disposition non autorisée, tentative de
        contournement, décompilation, usage abusif ou utilisation contraire à la loi, aux droits des tiers ou aux règles
        des plateformes connectées.
      </p>

      <h2 className={styles.h2}>Article 7 — Booster / Publier, médias et validation des contenus</h2>
      <p className={styles.p}>
        Le module Booster / Publier permet au Client de préparer des contenus textuels, visuels ou vidéo et de les
        diffuser sur les canaux connectés. Avant toute publication, le Client doit vérifier le contenu, les visuels,
        les vidéos, les liens, les boutons d’action, les destinataires et les canaux sélectionnés.
      </p>
      <p className={styles.p}>
        Sauf évolution de l’offre ou paramétrage spécifique, l’ajout média est limité à <strong>5 images maximum ou 1 vidéo</strong>,
        pour une limite globale de <strong>40 Mo maximum</strong>. Les formats peuvent être adaptés techniquement par le
        logiciel afin de faciliter leur diffusion. Certaines opérations vidéo peuvent nécessiter un délai de traitement.
      </p>
      <p className={styles.p}>
        Le Client demeure seul responsable des contenus diffusés, y compris lorsqu’ils sont générés, reformulés,
        adaptés ou suggérés par l’intelligence artificielle.
      </p>

      <h2 className={styles.h2}>Article 8 — Intelligence artificielle</h2>
      <p className={styles.p}>
        Les fonctionnalités d’intelligence artificielle sont des outils d’assistance. Elles peuvent aider à rédiger,
        reformuler, structurer ou proposer des contenus à partir des informations fournies par le Client et des données
        disponibles dans son espace.
      </p>
      <p className={styles.p}>
        iNrCy ne garantit ni l’exactitude, ni l’exhaustivité, ni la conformité juridique, commerciale ou réglementaire
        des contenus générés. Le Client doit relire, corriger et valider les contenus avant utilisation ou publication.
      </p>

      <h2 className={styles.h2}>Article 9 — Connexions aux canaux tiers</h2>
      <p className={styles.p}>
        Le logiciel peut interagir, à la demande du Client, avec des services tiers tels que Google, Meta, LinkedIn,
        Microsoft, fournisseurs de messagerie, hébergeurs de sites, outils statistiques ou tout autre canal ajouté à
        l’application.
      </p>
      <p className={styles.p}>Le Client reconnaît que :</p>
      <ul className={styles.ul}>
        <li>ces services tiers disposent de leurs propres conditions, règles, quotas, autorisations et restrictions ;</li>
        <li>les API peuvent changer, être interrompues ou limiter certaines fonctionnalités ;</li>
        <li>iNrCy ne peut garantir la disponibilité permanente d’un canal tiers ;</li>
        <li>le Client peut être amené à reconnecter ou réautoriser certains accès.</li>
      </ul>

      <h2 className={styles.h2}>Article 10 — CRM, Mails et campagnes</h2>
      <p className={styles.p}>
        Le Client est seul responsable des données importées ou saisies dans le CRM, de la qualité de ses fichiers, de
        la licéité de ses bases de contacts, de ses messages et du respect des règles applicables à la prospection, à la
        fidélisation, au consentement, à l’opposition et au désabonnement.
      </p>
      <p className={styles.p}>
        Les fonctionnalités Mails, Propulser et Fidéliser ne dispensent pas le Client de vérifier la conformité de ses
        campagnes avec les obligations applicables à son activité et à ses destinataires.
      </p>

      <h2 className={styles.h2}>Article 11 — Historique iNrSend et durées d’affichage</h2>
      <p className={styles.p}>
        iNrSend centralise l’historique de certaines communications et documents générés ou envoyés via l’application.
        Les durées ci-dessous concernent uniquement l’affichage dans l’historique iNrSend actif :
      </p>
      <ul className={styles.ul}>
        <li>Publications : 12 mois ;</li>
        <li>Propulsions : 12 mois ;</li>
        <li>Fidélisations : 12 mois ;</li>
        <li>Mails : 12 mois ;</li>
        <li>Devis : 24 mois ;</li>
        <li>Factures : 24 mois.</li>
      </ul>
      <p className={styles.p}>
        Passé ces durées, les éléments peuvent être automatiquement archivés, masqués de l’historique actif ou supprimés
        selon les règles techniques de l’application et les obligations applicables.
      </p>

      <h2 className={styles.h2}>Article 12 — Devis et factures</h2>
      <p className={styles.p}>
        Le Client est seul responsable des devis et factures créés, envoyés ou téléchargés via iNrCy, notamment de leur
        contenu, de leur numérotation, de leur exactitude, de leur conformité fiscale et de leur conservation légale.
      </p>
      <p className={styles.p}>
        Dans l’application, une facture envoyée est considérée comme officielle. Elle n’est pas supprimable manuellement
        depuis iNrSend. Toute demande exceptionnelle de suppression doit être adressée par écrit au support iNrCy. iNrCy
        peut refuser ou différer une demande si elle est contraire à une obligation légale, technique, comptable, de
        sécurité ou de traçabilité.
      </p>
      <p className={styles.p}>
        La durée d’affichage de 24 mois dans iNrSend ne remplace pas les obligations légales de conservation qui
        demeurent à la charge du professionnel.
      </p>

      <h2 className={styles.h2}>Article 13 — Données personnelles</h2>
      <p className={styles.p}>
        Les traitements de données personnelles réalisés par iNrCy sont décrits dans la Politique de confidentialité.
        Pour les données de ses propres clients, prospects, contacts, destinataires ou visiteurs, le Client demeure
        responsable de traitement. iNrCy intervient alors comme prestataire technique et sous-traitant, dans la limite
        des fonctionnalités utilisées.
      </p>

      <h2 className={styles.h2}>Article 14 — Disponibilité, maintenance et sécurité</h2>
      <p className={styles.p}>
        iNrCy met en œuvre des moyens raisonnables pour assurer le bon fonctionnement, la sécurité et l’évolution du
        logiciel. Des opérations de maintenance, correctifs, mises à jour ou interruptions temporaires peuvent intervenir
        sans que cela n’ouvre droit à indemnisation, sauf faute prouvée d’iNrCy.
      </p>

      <h2 className={styles.h2}>Article 15 — Suspension ou restriction d’accès</h2>
      <p className={styles.p}>iNrCy peut suspendre ou restreindre l’accès au service en cas :</p>
      <ul className={styles.ul}>
        <li>de non-paiement ;</li>
        <li>d’utilisation abusive, frauduleuse ou contraire aux présentes CGA ;</li>
        <li>de risque de sécurité ;</li>
        <li>de violation des droits d’un tiers ou d’une règle imposée par une plateforme connectée ;</li>
        <li>de nécessité technique ou réglementaire.</li>
      </ul>

      <h2 className={styles.h2}>Article 16 — Responsabilité</h2>
      <p className={styles.p}>
        iNrCy est tenue à une obligation de moyens. Aucune garantie de résultats n’est fournie concernant le trafic, le
        chiffre d’affaires, le nombre de prospects, les performances publicitaires, le référencement, les statistiques,
        l’engagement obtenu ou la disponibilité des plateformes tierces.
      </p>
      <p className={styles.p}>
        La responsabilité d’iNrCy est limitée au montant des sommes effectivement versées par le Client au cours des
        trois derniers mois précédant le fait générateur. iNrCy ne pourra être tenue responsable des pertes indirectes,
        pertes d’exploitation, pertes de chance, pertes de données imputables au Client, manque à gagner ou préjudice
        d’image.
      </p>

      <h2 className={styles.h2}>Article 17 — Services complémentaires : sites internet</h2>
      <p className={styles.p}>
        iNrCy peut proposer des prestations complémentaires de création, vente ou location de sites internet. En cas de
        location, le site demeure la propriété d’iNrCy, sauf accord contraire. En cas de vente, le Client devient
        propriétaire du site livré, hors composants sous licence, éléments tiers et technologies propriétaires iNrCy.
      </p>
      <p className={styles.p}>
        Le Client reste responsable des contenus, mentions légales, politiques, données collectées et obligations
        propres à l’exploitation de son site internet.
      </p>

      <h2 className={styles.h2}>Article 18 — Résiliation et fin d’abonnement</h2>
      <p className={styles.p}>
        Le Client peut résilier son abonnement dans les conditions prévues par son offre ou depuis les moyens mis à sa
        disposition. La résiliation prend effet à la fin de la période en cours. Après la fin de l’abonnement, l’accès
        au logiciel peut être désactivé et les données peuvent être exportées, archivées ou supprimées selon les règles
        de l’application et les obligations applicables.
      </p>

      <h2 className={styles.h2}>Article 19 — Évolution des CGA et du service</h2>
      <p className={styles.p}>
        iNrCy peut faire évoluer les présentes CGA et les fonctionnalités du service afin de tenir compte des évolutions
        techniques, commerciales, réglementaires ou de sécurité. Les modifications substantielles applicables aux
        abonnements en cours sont portées à la connaissance du Client par tout moyen utile.
      </p>

      <h2 className={styles.h2}>Article 20 — Preuve</h2>
      <p className={styles.p}>
        Les journaux techniques, historiques d’action, confirmations électroniques, traces d’envoi, fichiers de paiement
        et enregistrements informatiques conservés par iNrCy font foi entre les parties, sauf preuve contraire.
      </p>

      <h2 className={styles.h2}>Article 21 — Droit applicable — Tribunal compétent</h2>
      <p className={styles.p}>
        Les présentes CGA sont régies par le droit français. Tout litige relatif à leur interprétation, leur exécution
        ou leur résiliation relève du Tribunal de commerce d’Arras, sauf disposition légale impérative contraire.
      </p>
    </section>
  );
}
