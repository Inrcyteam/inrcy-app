"use client";

import type React from "react";
import styles from "../legal.module.css";

function P({ children }: { children: React.ReactNode }) {
  return <p className={styles.p}>{children}</p>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className={styles.ul}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function ConfidentialiteContent() {
  return (
    <section>
      <P>
        La présente Politique de confidentialité explique comment la société <strong>iNrCy</strong> collecte, utilise,
        conserve, protège et partage certaines données personnelles dans le cadre de son site internet, de son logiciel
        en ligne, de ses générateurs iNrCy, de ses modules applicatifs et des services tiers connectés par les
        utilisateurs.
      </P>
      <P>
        Elle s’applique notamment au site internet iNrCy, à l’application iNrCy, aux générateurs iNrCy, aux modules de
        publication, de communication, de statistiques, de relation client, de devis, de factures, d’agenda, ainsi qu’aux
        connexions activées par l’utilisateur avec des services tiers tels que Google, YouTube, TikTok, Meta, Facebook,
        Instagram, LinkedIn, Microsoft, Stripe ou tout autre service nécessaire au fonctionnement de l’application.
      </P>

      <h2 className={styles.h2}>1. Responsable du traitement</h2>
      <P>
        La société <strong>iNrCy</strong>, Société par Actions Simplifiée, dont le siège social est situé <strong>1 rue de Fouquières, 62440 Harnes, France</strong>, peut être amenée à traiter des données personnelles dans le cadre de son site internet, de son logiciel en ligne et de ses services associés.
      </P>
      <P>Contact : <strong>contact@inrcy.com</strong></P>
      <P>iNrCy agit comme responsable du traitement pour les données collectées dans le cadre de :</P>
      <BulletList
        items={[
          "la gestion du site internet iNrCy",
          "les demandes de contact",
          "les demandes d’essai gratuit",
          "la gestion commerciale",
          "les abonnements, paiements et facturation",
          "le support et la sécurité du service",
          "l’administration du logiciel iNrCy",
          "la gestion des accès utilisateurs",
          "la gestion des connexions aux services tiers",
        ]}
      />
      <P>
        Lorsque iNrCy traite des données pour le compte d’un professionnel utilisateur, notamment dans le cadre du CRM,
        des contacts, des campagnes, des devis, des factures ou des données clients intégrées dans l’application, iNrCy
        agit comme sous-traitant technique au sens du RGPD. Le professionnel utilisateur reste alors responsable du
        traitement de ses propres données clients, prospects, contacts, destinataires et documents commerciaux.
      </P>

      <h2 className={styles.h2}>2. Services concernés</h2>
      <P>La présente Politique de confidentialité s’applique aux traitements réalisés dans le cadre :</P>
      <BulletList
        items={[
          "du site internet iNrCy",
          "du formulaire de demande de contact",
          "du formulaire de demande d’essai gratuit",
          "du logiciel en ligne iNrCy",
          "du générateur iNrCy",
          "des modules Booster / Publier, Propulser, Fidéliser, iNrSend, iNrStats, iNrCalendar / Agenda, Devis, Factures, CRM, iNrBadge et iNrAgent lorsque ces fonctionnalités sont disponibles",
          "des services de location ou de mise à disposition de générateurs iNrCy",
          "des services de location, création, gestion ou vente de sites internet",
          "des prestations digitales associées",
          "des connexions à des services tiers lorsque l’utilisateur les active",
          "des API utilisées pour connecter, publier, synchroniser, analyser ou afficher des données issues de plateformes externes",
        ]}
      />

      <h2 className={styles.h2}>3. Données collectées via le site internet</h2>
      <P>Lorsqu’un utilisateur visite le site iNrCy ou remplit un formulaire, iNrCy peut collecter les données suivantes :</P>
      <BulletList
        items={[
          "nom",
          "prénom",
          "adresse email",
          "numéro de téléphone",
          "société",
          "message transmis",
          "demande formulée",
          "date et heure de l’envoi",
          "adresse IP",
          "données de navigation",
          "type d’appareil",
          "pages consultées",
          "source de la demande",
          "cookies ou traceurs selon le paramétrage choisi",
        ]}
      />
      <P>
        Ces données sont utilisées pour répondre aux demandes, gérer les essais gratuits, assurer le suivi commercial,
        améliorer le site, sécuriser les échanges, mesurer l’audience lorsque cela est autorisé et prévenir les abus.
      </P>

      <h2 className={styles.h2}>4. Données collectées lors d’une demande d’essai gratuit</h2>
      <P>Dans le cadre d’une demande d’essai gratuit, iNrCy peut collecter :</P>
      <BulletList
        items={[
          "nom",
          "prénom",
          "email",
          "téléphone",
          "société",
          "secteur d’activité",
          "informations liées à l’activité professionnelle",
          "date de demande",
          "origine de la demande",
          "acceptation des Conditions Générales d’Abonnement et Conditions d’Utilisation",
          "prise de connaissance de la présente Politique de confidentialité",
          "consentement à être contacté dans le cadre de la demande d’essai gratuit",
        ]}
      />
      <P>
        Ces données permettent de traiter la demande, de préparer ou activer l’accès au générateur iNrCy, de contacter le
        demandeur, d’assurer le suivi commercial et de sécuriser le processus d’inscription.
      </P>

      <h2 className={styles.h2}>5. Données des clients abonnés au logiciel iNrCy</h2>
      <P>Dans le cadre de l’utilisation du logiciel iNrCy, iNrCy peut traiter les données suivantes concernant les clients professionnels :</P>
      <BulletList
        items={[
          "nom, prénom, société, adresse professionnelle, email et téléphone",
          "identifiants de connexion",
          "informations contractuelles, d’abonnement et de facturation",
          "préférences de configuration",
          "données liées à l’utilisation du logiciel",
          "historique des actions réalisées dans l’application",
          "connexions aux modules activés",
          "connexions aux services tiers",
          "tickets ou échanges avec le support",
          "journaux techniques, données de sécurité et données nécessaires au diagnostic technique",
        ]}
      />
      <P>
        Ces données sont nécessaires à la création du compte, à l’utilisation du service, au support, à la facturation, à
        la sécurité, à la prévention des abus, à l’amélioration du logiciel et à l’exécution du contrat.
      </P>

      <h2 className={styles.h2}>6. Données traitées dans le CRM et les modules commerciaux</h2>
      <P>
        Le logiciel iNrCy peut permettre aux utilisateurs professionnels de gérer des contacts, prospects, clients,
        actions commerciales, devis, factures, historiques et suivis de relation client.
      </P>
      <P>Dans ce cadre, le professionnel utilisateur peut enregistrer des données concernant ses propres clients, prospects ou contacts, notamment :</P>
      <BulletList
        items={[
          "nom, prénom, société, adresse postale, adresse email et numéro de téléphone",
          "informations commerciales",
          "historique des échanges",
          "besoins exprimés",
          "demandes de devis",
          "informations de facturation",
          "montants et détails de prestations",
          "documents commerciaux",
          "statuts de suivi, notes internes, dates de relance et historiques d’actions",
        ]}
      />
      <P>
        Ces données sont saisies, importées ou utilisées sous la responsabilité exclusive du professionnel utilisateur.
        iNrCy n’utilise pas les données CRM des professionnels à des fins commerciales propres.
      </P>
      <P>
        Le professionnel utilisateur est responsable de l’origine licite des données qu’il saisit dans l’application, de
        l’information de ses propres clients et prospects, ainsi que du respect de ses obligations en matière de
        protection des données personnelles.
      </P>

      <h2 className={styles.h2}>7. Devis, factures et documents commerciaux</h2>
      <P>Le logiciel iNrCy peut permettre la création, l’envoi, l’impression, le suivi ou l’historisation de devis et factures.</P>
      <P>Les données traitées peuvent inclure :</P>
      <BulletList
        items={[
          "informations du professionnel",
          "informations du client final",
          "coordonnées",
          "prestations, montants, taxes et dates",
          "statuts",
          "documents générés",
          "historiques d’envoi",
          "traces techniques associées",
          "informations nécessaires à l’affichage ou au téléchargement des documents",
        ]}
      />
      <P>
        Le professionnel utilisateur reste seul responsable du contenu, de l’exactitude, de la conformité, de la
        numérotation, de la conservation légale et de l’usage de ses devis, factures et documents comptables.
      </P>
      <P>
        Les factures envoyées depuis l’application peuvent être protégées contre la suppression manuelle dans iNrSend afin
        d’assurer la cohérence de l’historique applicatif. Cette protection ne remplace pas les obligations légales de
        conservation du professionnel.
      </P>

      <h2 className={styles.h2}>8. Données liées à Booster / Publier</h2>
      <P>Le module Booster / Publier permet de préparer, générer, adapter, programmer ou publier des contenus sur différents canaux connectés.</P>
      <P>Dans ce cadre, iNrCy peut traiter :</P>
      <BulletList
        items={[
          "textes saisis par l’utilisateur",
          "instructions de rédaction",
          "contenus générés ou modifiés",
          "titres, descriptions, boutons d’action et liens de destination",
          "images, vidéos et métadonnées techniques des fichiers",
          "formats adaptés, brouillons et prévisualisations",
          "canaux sélectionnés",
          "historiques de publication",
          "statuts de publication",
          "erreurs ou retours techniques des plateformes connectées",
        ]}
      />
      <P>
        Sauf évolution de l’offre, l’application peut permettre l’ajout de 5 images maximum ou 1 vidéo, dans une limite
        média de 40 Mo maximum.
      </P>
      <P>
        Le professionnel reste responsable des contenus, images, vidéos, marques, textes, sons, musiques, logos,
        documents et éléments qu’il importe, génère, valide ou publie.
      </P>

      <h2 className={styles.h2}>9. Données liées aux médias, images et vidéos</h2>
      <P>Les images, vidéos ou fichiers transmis dans l’application peuvent être utilisés pour :</P>
      <BulletList
        items={[
          "générer un contenu",
          "préparer une publication",
          "adapter un format",
          "créer une prévisualisation",
          "sauvegarder un brouillon",
          "publier sur un canal connecté",
          "conserver un historique dans iNrSend lorsque cela est prévu",
          "assurer le support ou le diagnostic technique en cas d’erreur",
          "réaliser une conversion, compression ou adaptation technique lorsque cela est nécessaire au fonctionnement de la fonctionnalité demandée",
        ]}
      />
      <P>
        Les traitements vidéo peuvent impliquer une adaptation technique du format, une compression, une génération de
        variante ou une préparation spécifique selon le canal choisi.
      </P>
      <P>
        iNrCy ne revend pas les médias transmis par ses utilisateurs. Le professionnel doit s’assurer qu’il dispose des
        droits nécessaires sur tous les médias utilisés, notamment les droits d’image, droits d’auteur, droits musicaux,
        droits de marque et autorisations commerciales éventuelles.
      </P>

      <h2 className={styles.h2}>10. iNrSend et historique applicatif</h2>
      <P>
        iNrSend permet de consulter l’historique de certaines actions effectuées dans l’application, notamment
        publications, campagnes, mails, devis, factures ou autres éléments selon les fonctionnalités activées.
      </P>
      <P>Sauf évolution ultérieure de l’offre ou disposition contraire, les durées d’affichage dans l’historique iNrSend sont les suivantes :</P>
      <BulletList
        items={[
          "Publications : 12 mois",
          "Propulsions : 12 mois",
          "Fidélisations : 12 mois",
          "Mails : 12 mois",
          "Devis : 24 mois",
          "Factures : 24 mois",
        ]}
      />
      <P>
        Ces durées concernent uniquement l’affichage dans l’historique actif iNrSend. Les anciens éléments peuvent être
        automatiquement archivés, masqués ou supprimés de l’historique actif une fois la durée prévue atteinte.
      </P>
      <P>
        Ces durées ne constituent pas une garantie de conservation légale, fiscale ou comptable des documents du
        professionnel. Le professionnel reste responsable de la conservation légale de ses propres documents.
      </P>

      <h2 className={styles.h2}>11. Données liées aux mails et campagnes</h2>
      <P>
        Le logiciel iNrCy peut permettre au professionnel de connecter une ou plusieurs boîtes mails, de gérer des envois,
        de préparer des communications, de suivre des campagnes ou d’utiliser ses contacts CRM.
      </P>
      <P>Dans ce cadre, iNrCy peut traiter :</P>
      <BulletList
        items={[
          "adresse email connectée",
          "paramètres techniques de connexion",
          "informations de boîte mail nécessaires au fonctionnement",
          "destinataires, objets, contenus de messages et pièces jointes",
          "historiques d’envoi, statuts et erreurs techniques",
          "signatures",
          "données de campagne",
          "données de désinscription lorsque la fonctionnalité est disponible",
          "journaux techniques nécessaires à la délivrabilité ou au diagnostic",
        ]}
      />
      <P>Le professionnel reste responsable :</P>
      <BulletList
        items={[
          "de l’origine licite de ses contacts",
          "du respect des règles de prospection",
          "de l’information des destinataires",
          "de la gestion des désinscriptions",
          "du contenu des messages envoyés",
          "de la conformité de ses campagnes",
          "du respect des règles applicables aux communications commerciales",
        ]}
      />

      <h2 className={styles.h2}>12. Connexions aux services tiers</h2>
      <P>Le logiciel iNrCy peut permettre à l’utilisateur de connecter des services tiers afin d’activer certaines fonctionnalités.</P>
      <P>Ces connexions peuvent notamment concerner :</P>
      <BulletList
        items={[
          "Google",
          "Google Business Profile",
          "Google Calendar",
          "Google Analytics 4",
          "Google Search Console",
          "YouTube",
          "YouTube API Services",
          "TikTok",
          "TikTok for Developers",
          "ByteDance / TikTok",
          "Meta",
          "Facebook",
          "Instagram",
          "LinkedIn",
          "Microsoft",
          "services de messagerie",
          "protocoles ou outils de connexion mail",
          "services d’hébergement",
          "services de paiement",
          "services d’intelligence artificielle",
          "API nécessaires au fonctionnement du logiciel",
        ]}
      />
      <P>Après autorisation de l’utilisateur, iNrCy peut accéder uniquement aux données nécessaires au fonctionnement du service demandé, notamment :</P>
      <BulletList
        items={[
          "informations de compte",
          "pages, établissements, calendriers, chaînes, profils ou ressources connectées",
          "données nécessaires à la publication",
          "données statistiques, impressions, clics, vues, indicateurs de performance et données d’engagement",
          "informations techniques de connexion",
          "jetons d’authentification",
          "statuts ou retours des plateformes",
          "erreurs techniques",
          "paramètres de confidentialité ou d’audience lorsque la plateforme les fournit",
        ]}
      />
      <P>
        Ces données sont utilisées exclusivement pour fournir les fonctionnalités demandées par l’utilisateur, afficher les
        tableaux de bord, publier les contenus, synchroniser les informations, analyser les performances, assurer le bon
        fonctionnement du service et sécuriser les connexions.
      </P>
      <P>
        L’utilisateur peut révoquer certaines connexions depuis son compte tiers ou depuis les paramètres du logiciel
        iNrCy lorsque cette option est disponible. iNrCy ne garantit pas la disponibilité, la stabilité ou la continuité
        des services tiers. Les services tiers restent soumis à leurs propres conditions d’utilisation, politiques de
        confidentialité, règles techniques et limitations d’API.
      </P>

      <h2 className={styles.h2}>13. Utilisation des API Google, YouTube et services Google</h2>
      <P>
        Le logiciel iNrCy peut utiliser certaines API Google et YouTube, notamment Google Business Profile, Google
        Calendar, Google Analytics 4, Google Search Console, YouTube API Services ou d’autres API Google nécessaires aux
        fonctionnalités activées par l’utilisateur.
      </P>
      <P>
        Ces services sont utilisés uniquement lorsque l’utilisateur choisit de connecter son compte Google, YouTube ou un
        service Google compatible à iNrCy.
      </P>
      <P>
        Selon les fonctionnalités activées, iNrCy peut accéder, collecter, stocker ou traiter uniquement les données
        nécessaires au fonctionnement du service demandé, notamment :
      </P>
      <BulletList
        items={[
          "informations du compte Google connecté",
          "identifiants de compte, d’établissement, de calendrier, de chaîne YouTube ou de ressource connectée",
          "nom, adresse, informations publiques ou professionnelles d’un établissement Google Business Profile lorsque cela est nécessaire",
          "données nécessaires à la préparation, à l’envoi ou à la publication de contenus",
          "titres, descriptions, textes, images, vidéos, liens, paramètres de publication ou de confidentialité",
          "données de calendrier",
          "données statistiques et données de visibilité",
          "vues, impressions, clics, interactions et indicateurs de performance",
          "statuts, erreurs et retours techniques des API",
          "jetons d’authentification nécessaires à la connexion sécurisée",
          "données strictement nécessaires à l’affichage des ressources disponibles dans l’interface iNrCy",
        ]}
      />
      <P>Ces données sont utilisées uniquement pour fournir les fonctionnalités demandées par l’utilisateur, notamment :</P>
      <BulletList
        items={[
          "connecter son compte Google ou YouTube",
          "afficher les ressources disponibles",
          "préparer une publication",
          "publier un contenu",
          "afficher ou synchroniser des informations",
          "afficher des statistiques",
          "analyser les performances",
          "préparer des recommandations visibles dans l’interface",
          "assurer le bon fonctionnement technique du service",
          "sécuriser les accès et diagnostiquer les erreurs",
        ]}
      />
      <P>
        Les données obtenues via les API Google ou YouTube ne sont pas vendues, louées, transférées à des courtiers en
        données, utilisées pour de la publicité, du reciblage publicitaire, du profilage publicitaire ou de la
        détermination de solvabilité.
      </P>
      <P>
        iNrCy ne transfère, ne partage ou ne divulgue les données Google ou YouTube à des tiers que dans les cas
        strictement nécessaires suivants :
      </P>
      <BulletList
        items={[
          "à Google ou YouTube pour exécuter l’action demandée par l’utilisateur",
          "aux prestataires techniques nécessaires au fonctionnement de l’application, notamment l’hébergement, la base de données, le stockage, la sécurité, les journaux techniques, le support ou l’exécution des fonctionnalités",
          "aux services connectés explicitement choisis par l’utilisateur",
          "à un prestataire d’intelligence artificielle uniquement lorsque l’utilisateur utilise une fonctionnalité d’assistance ou de génération nécessitant ce traitement, et uniquement pour fournir la fonctionnalité demandée",
          "aux autorités compétentes lorsque la loi l’exige",
        ]}
      />
      <P>Les prestataires techniques pouvant intervenir dans le traitement des données Google ou YouTube incluent notamment, selon les fonctionnalités utilisées :</P>
      <BulletList
        items={[
          "OVHcloud",
          "Vercel",
          "Supabase",
          "Google",
          "YouTube",
          "OpenAI lorsque l’utilisateur utilise une fonctionnalité d’assistance ou de génération nécessitant ce traitement",
          "Stripe lorsque cela est nécessaire à la gestion de l’abonnement",
          "Microsoft, Meta, LinkedIn, TikTok / ByteDance ou d’autres services tiers uniquement lorsque l’utilisateur connecte ou utilise volontairement ces services",
          "les fournisseurs de messagerie, de sécurité, de support ou d’infrastructure nécessaires au fonctionnement de l’application",
        ]}
      />
      <P>
        iNrCy applique un principe de minimisation : seules les autorisations nécessaires aux fonctionnalités réellement
        disponibles et utilisées sont demandées.
      </P>
      <P>
        iNrCy respecte les règles d’utilisation limitée applicables aux données utilisateur Google. Les données Google ne
        sont utilisées que pour fournir ou améliorer les fonctionnalités visibles et demandées par l’utilisateur.
      </P>
      <P>iNrCy n’utilise pas les données Google ou YouTube pour entraîner des modèles d’intelligence artificielle généraux.</P>
      <P>iNrCy ne permet pas à ses employés ou prestataires de lire manuellement les données Google ou YouTube, sauf dans les cas suivants :</P>
      <BulletList
        items={[
          "accord explicite de l’utilisateur pour une demande de support ou de diagnostic",
          "nécessité de sécurité",
          "obligation légale",
          "données agrégées ou anonymisées utilisées pour le fonctionnement interne du service",
        ]}
      />
      <P>
        L’utilisateur peut à tout moment révoquer l’accès de iNrCy à son compte Google ou YouTube depuis les paramètres de
        sécurité de son compte Google, ou depuis les paramètres du logiciel iNrCy lorsque cette option est disponible.
        L’utilisateur peut également demander la suppression des données concernées en contactant iNrCy à l’adresse : <strong>contact@inrcy.com</strong>.
      </P>

      <h2 className={styles.h2}>14. Utilisation spécifique de YouTube</h2>
      <P>
        Lorsque l’utilisateur connecte une chaîne YouTube ou utilise une fonctionnalité YouTube dans iNrCy, l’application
        peut traiter les données nécessaires à la préparation, l’envoi, la publication, l’affichage ou le suivi de
        contenus YouTube.
      </P>
      <P>Ces données peuvent inclure :</P>
      <BulletList
        items={[
          "identifiant de chaîne YouTube",
          "informations du compte ou de la chaîne connectée",
          "titres de vidéos ou Shorts",
          "descriptions",
          "médias vidéo",
          "miniatures éventuelles",
          "paramètres de confidentialité",
          "statuts de publication",
          "statistiques de visibilité ou de performance lorsque ces données sont disponibles",
          "erreurs ou retours techniques des API YouTube",
          "jetons d’authentification nécessaires au fonctionnement sécurisé de la connexion",
        ]}
      />
      <P>Ces données sont utilisées uniquement pour permettre à l’utilisateur de gérer les fonctionnalités YouTube activées depuis iNrCy.</P>
      <P>
        L’utilisation des fonctionnalités YouTube dans iNrCy implique l’utilisation des <strong>YouTube API Services</strong>.
        L’utilisateur reste également soumis aux <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Conditions d’utilisation de YouTube</a>, aux <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" rel="noreferrer">Conditions d’utilisation des YouTube API Services</a> et à la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Politique de confidentialité de Google</a>.
      </P>
      <P>
        L’utilisateur reste responsable des contenus qu’il importe, prépare, valide ou publie sur YouTube depuis iNrCy,
        ainsi que du respect des règles YouTube, des droits d’auteur, des droits à l’image, des droits musicaux, des
        droits de marque et de la confidentialité des personnes apparaissant dans les contenus.
      </P>
      <P>iNrCy ne vend pas les données YouTube des utilisateurs et ne les utilise pas à des fins publicitaires propres.</P>

      <h2 className={styles.h2}>15. Utilisation de l’API TikTok</h2>
      <P>
        Le logiciel iNrCy peut permettre à l’utilisateur de connecter son compte TikTok afin de préparer, envoyer, publier
        ou suivre certains contenus via les API TikTok mises à disposition par TikTok for Developers.
      </P>
      <P>Lorsque l’utilisateur connecte son compte TikTok, iNrCy peut accéder ou traiter uniquement les données nécessaires au fonctionnement des fonctionnalités activées, notamment :</P>
      <BulletList
        items={[
          "identifiant du compte TikTok autorisé",
          "nom d’utilisateur, surnom et avatar du créateur lorsque ces informations sont fournies par l’API",
          "jetons d’authentification nécessaires à la connexion sécurisée",
          "paramètres de confidentialité disponibles pour la publication",
          "paramètres liés aux commentaires, duos, collages ou interactions lorsque ces informations sont fournies par TikTok",
          "contenus préparés ou envoyés vers TikTok",
          "textes, légendes, hashtags, images, vidéos et métadonnées techniques",
          "statuts de publication",
          "erreurs ou retours techniques de l’API TikTok",
          "quotas ou limitations techniques retournés par TikTok",
        ]}
      />
      <P>
        Ces données sont utilisées uniquement pour permettre à l’utilisateur de connecter son compte TikTok, préparer un
        contenu, afficher les options disponibles, envoyer un média, publier un contenu ou suivre le statut d’une
        publication.
      </P>
      <P>Les contenus publiés ou transmis vers TikTok sont envoyés à TikTok / ByteDance pour permettre l’exécution de l’action demandée par l’utilisateur.</P>
      <P>iNrCy ne vend pas les données TikTok des utilisateurs, ne les loue pas et ne les utilise pas à des fins publicitaires propres.</P>
      <P>iNrCy ne transmet les données TikTok à des tiers que lorsque cela est nécessaire :</P>
      <BulletList
        items={[
          "pour fournir la fonctionnalité demandée par l’utilisateur",
          "pour assurer l’hébergement, le stockage, la sécurité ou le fonctionnement technique du service",
          "pour réaliser une action explicitement demandée par l’utilisateur",
          "pour respecter une obligation légale",
        ]}
      />
      <P>
        L’utilisateur reste responsable des contenus qu’il prépare, importe, valide ou publie sur TikTok depuis iNrCy,
        ainsi que du respect des règles applicables sur TikTok, des droits d’auteur, des droits à l’image, des droits
        musicaux, des droits de marque et de la confidentialité des personnes apparaissant dans les contenus.
      </P>
      <P>
        L’utilisateur peut révoquer l’accès de iNrCy à son compte TikTok depuis les paramètres de son compte TikTok ou
        depuis les paramètres du logiciel iNrCy lorsque cette option est disponible. Il peut également demander la
        suppression des données concernées en contactant iNrCy à l’adresse : <strong>contact@inrcy.com</strong>.
      </P>

      <h2 className={styles.h2}>16. Utilisation de technologies d’intelligence artificielle</h2>
      <P>Le logiciel iNrCy peut intégrer des fonctionnalités reposant sur des technologies d’intelligence artificielle, notamment pour :</P>
      <BulletList
        items={[
          "générer des publications",
          "proposer des formulations",
          "adapter des textes",
          "analyser une intention",
          "exploiter des éléments fournis par l’utilisateur",
          "préparer des contenus marketing ou commerciaux",
          "proposer des recommandations",
          "analyser des statistiques",
          "aider à préparer certaines actions dans l’application",
        ]}
      />
      <P>
        Dans ce cadre, certaines informations fournies par l’utilisateur peuvent être transmises à un prestataire
        technique d’intelligence artificielle afin de générer le contenu demandé.
      </P>
      <P>Ces informations peuvent inclure, selon l’usage :</P>
      <BulletList
        items={[
          "nom de l’entreprise",
          "secteur d’activité",
          "description de services",
          "consignes de rédaction",
          "texte saisi",
          "médias fournis",
          "contexte de publication",
          "statistiques ou informations nécessaires à l’analyse demandée",
          "informations nécessaires à la génération demandée",
        ]}
      />
      <P>
        Les données transmises à ces services sont utilisées pour fournir la fonctionnalité demandée. iNrCy recommande aux
        utilisateurs de ne pas inclure de données sensibles, confidentielles ou inutiles dans les demandes de génération.
        Les contenus générés doivent être vérifiés par le professionnel avant toute utilisation, publication, envoi ou
        diffusion.
      </P>
      <P>
        Sauf fonctionnalité expressément activée par l’utilisateur, iNrCy ne transmet pas les données issues de services
        connectés tels que Google, YouTube ou TikTok à un prestataire d’intelligence artificielle.
      </P>

      <h2 className={styles.h2}>17. Paiements</h2>
      <P>Les paiements peuvent être traités par Stripe ou par tout autre prestataire de paiement accepté par iNrCy.</P>
      <P>iNrCy ne stocke pas les données complètes de carte bancaire.</P>
      <P>Le prestataire de paiement peut traiter notamment :</P>
      <BulletList
        items={[
          "nom",
          "email",
          "adresse de facturation",
          "moyen de paiement",
          "historique des transactions",
          "statut de paiement",
          "informations nécessaires à la prévention de la fraude",
          "informations nécessaires à la gestion des abonnements",
        ]}
      />
      <P>Ces traitements sont nécessaires à la gestion des abonnements, paiements, factures et incidents de paiement.</P>

      <h2 className={styles.h2}>18. Sites internet proposés en complément</h2>
      <P>iNrCy peut proposer la location, la mise à disposition, la création, la maintenance, la gestion ou la vente de sites internet.</P>
      <P>Dans ce cadre :</P>
      <BulletList
        items={[
          "le professionnel exploitant le site reste responsable des données collectées auprès de ses propres visiteurs, prospects ou clients",
          "iNrCy agit comme prestataire technique, hébergeur, administrateur, mainteneur ou sous-traitant selon la prestation réalisée",
          "le professionnel doit s’assurer que son site respecte les obligations applicables, notamment en matière de mentions légales, confidentialité, cookies, prospection et formulaires",
        ]}
      />
      <P>
        Lorsque iNrCy fournit ou administre un site pour le compte d’un professionnel, certaines données techniques,
        formulaires, statistiques, demandes de contact ou informations nécessaires au fonctionnement du site peuvent être
        traitées dans le cadre de la prestation.
      </P>

      <h2 className={styles.h2}>19. Finalités des traitements</h2>
      <P>Les données personnelles peuvent être traitées pour les finalités suivantes :</P>
      <BulletList
        items={[
          "Gestion des demandes de contact : intérêt légitime ou consentement selon le cas",
          "Gestion des demandes d’essai gratuit : mesures précontractuelles et consentement au contact",
          "Gestion des abonnements SaaS : exécution du contrat",
          "Création et gestion du compte utilisateur : exécution du contrat",
          "Paiement et facturation : exécution du contrat et obligations légales",
          "Support client : exécution du contrat et intérêt légitime",
          "Sécurité du service : intérêt légitime",
          "Prévention de la fraude : intérêt légitime",
          "Publication multicanale : exécution du contrat",
          "Connexion aux services tiers : exécution du contrat et autorisation de l’utilisateur",
          "Utilisation des API Google, YouTube et TikTok : exécution du contrat et autorisation de l’utilisateur",
          "Gestion CRM : exécution du contrat entre iNrCy et le professionnel utilisateur",
          "Traitement des données clients du professionnel : sous-traitance pour le compte du professionnel",
          "Création de devis et factures : exécution du contrat",
          "Envoi de mails et campagnes : exécution du contrat et responsabilité du professionnel",
          "Génération de contenus par IA : exécution du contrat",
          "Statistiques et recommandations : exécution du contrat",
          "Amélioration du service : intérêt légitime",
          "Mesure d’audience du site : consentement, sauf exemption applicable",
          "Cookies non nécessaires : consentement",
          "Respect des obligations légales : obligation légale",
          "Gestion des litiges : intérêt légitime",
        ]}
      />

      <h2 className={styles.h2}>20. Destinataires des données</h2>
      <P>Les données peuvent être accessibles, selon les besoins et les fonctionnalités utilisées, aux destinataires suivants :</P>
      <BulletList
        items={[
          "personnel habilité de iNrCy",
          "prestataires d’hébergement",
          "prestataires d’infrastructure",
          "prestataires de base de données",
          "prestataires de paiement",
          "prestataires d’intelligence artificielle",
          "services tiers connectés par l’utilisateur",
          "plateformes de publication",
          "prestataires de messagerie",
          "outils de sécurité",
          "outils de support",
          "outils de mesure d’audience",
          "prestataires de maintenance",
          "autorités administratives ou judiciaires lorsque cela est requis",
        ]}
      />
      <P>Les prestataires ou services peuvent notamment inclure, selon les services utilisés :</P>
      <BulletList
        items={[
          "OVHcloud",
          "Vercel",
          "Supabase",
          "Stripe",
          "OpenAI",
          "Google",
          "Google Business Profile",
          "Google Calendar",
          "Google Analytics",
          "Google Search Console",
          "YouTube",
          "YouTube API Services",
          "TikTok",
          "TikTok for Developers",
          "ByteDance / TikTok",
          "Microsoft",
          "Meta",
          "Facebook",
          "Instagram",
          "LinkedIn",
          "services de messagerie",
          "fournisseurs techniques nécessaires au fonctionnement de l’application",
        ]}
      />
      <P>iNrCy ne vend pas les données personnelles de ses utilisateurs.</P>
      <P>
        iNrCy ne partage les données avec des tiers que lorsque cela est nécessaire au fonctionnement du service, à
        l’exécution d’une fonctionnalité demandée par l’utilisateur, au respect d’une obligation légale, à la sécurité ou
        au support.
      </P>

      <h2 className={styles.h2}>21. Transferts hors Union européenne</h2>
      <P>Certains prestataires ou services tiers peuvent impliquer des transferts de données hors de l’Union européenne.</P>
      <P>Lorsque cela est nécessaire, ces transferts sont encadrés par des garanties appropriées, telles que :</P>
      <BulletList
        items={[
          "clauses contractuelles types approuvées par la Commission européenne",
          "décisions d’adéquation",
          "mesures contractuelles, techniques ou organisationnelles complémentaires",
          "mécanismes reconnus par la réglementation applicable",
        ]}
      />
      <P>
        L’utilisateur reconnaît que certaines plateformes tierces connectées, notamment Google, YouTube, TikTok, Meta,
        LinkedIn, Microsoft, Stripe ou OpenAI, peuvent traiter certaines données selon leurs propres conditions,
        politiques de confidentialité et infrastructures techniques.
      </P>

      <h2 className={styles.h2}>22. Durées de conservation</h2>
      <P>Les données sont conservées pendant une durée adaptée à leur finalité.</P>
      <BulletList
        items={[
          "Demandes de contact : jusqu’à 3 ans après le dernier échange",
          "Prospects : jusqu’à 3 ans après le dernier contact actif",
          "Données d’essai gratuit : jusqu’à 3 ans après le dernier contact, sauf souscription",
          "Clients abonnés : durée du contrat puis archivage selon obligations applicables",
          "Données de facturation iNrCy : durée légale applicable",
          "Documents comptables iNrCy : 10 ans",
          "Données CRM saisies par le professionnel : durée définie par le professionnel et par le fonctionnement de l’application",
          "Publications iNrSend : 12 mois d’affichage dans l’historique actif",
          "Propulsions iNrSend : 12 mois d’affichage dans l’historique actif",
          "Fidélisations iNrSend : 12 mois d’affichage dans l’historique actif",
          "Mails iNrSend : 12 mois d’affichage dans l’historique actif",
          "Devis iNrSend : 24 mois d’affichage dans l’historique actif",
          "Factures iNrSend : 24 mois d’affichage dans l’historique actif",
          "Logs techniques : jusqu’à 12 mois, sauf nécessité de sécurité, preuve ou diagnostic",
          "Jetons d’authentification aux services tiers : durée nécessaire au maintien de la connexion, jusqu’à révocation par l’utilisateur ou suppression du compte",
          "Cookies de mesure d’audience : selon le paramétrage et la réglementation applicable",
          "Préférences de consentement cookies : durée limitée conformément aux recommandations applicables",
          "Données nécessaires à la preuve : durée de prescription applicable",
        ]}
      />
      <P>
        Les durées d’affichage dans iNrSend ne remplacent pas les obligations légales de conservation du professionnel.
        Le professionnel reste responsable de la conservation légale de ses propres documents, notamment comptables,
        fiscaux et commerciaux.
      </P>

      <h2 className={styles.h2}>23. Sécurité</h2>
      <P>iNrCy met en œuvre des mesures techniques et organisationnelles destinées à protéger les données personnelles, notamment :</P>
      <BulletList
        items={[
          "connexion sécurisée",
          "accès restreints",
          "authentification",
          "stockage sécurisé des jetons d’accès",
          "limitation des accès internes",
          "sauvegardes",
          "journalisation technique",
          "surveillance des infrastructures",
          "mesures de prévention des abus",
          "séparation logique des données",
          "interventions de support limitées aux besoins nécessaires",
          "protection des accès administrateurs",
          "contrôle des droits utilisateurs",
          "mesures de diagnostic en cas d’erreur",
        ]}
      />
      <P>
        Malgré ces mesures, aucun système informatique ne peut garantir une sécurité absolue. L’utilisateur doit également
        protéger ses identifiants, mots de passe et accès aux services tiers connectés. L’utilisateur est invité à
        révoquer les connexions aux services tiers qu’il n’utilise plus.
      </P>

      <h2 className={styles.h2}>24. Cookies et traceurs</h2>
      <P>Le site internet iNrCy peut utiliser :</P>
      <BulletList
        items={[
          "des cookies techniques nécessaires au fonctionnement du site",
          "des cookies de sécurité",
          "des cookies de mesure d’audience",
          "des cookies ou traceurs soumis au consentement lorsque cela est requis",
        ]}
      />
      <P>
        Les cookies non nécessaires ne sont déposés qu’après consentement lorsque celui-ci est requis. L’utilisateur peut
        accepter, refuser ou paramétrer les cookies via le module prévu à cet effet lorsque celui-ci est disponible. Le
        refus des cookies non nécessaires n’empêche pas l’accès au site.
      </P>

      <h2 className={styles.h2}>25. Droits des personnes</h2>
      <P>Conformément à la réglementation applicable, toute personne concernée peut exercer les droits suivants :</P>
      <BulletList
        items={[
          "droit d’accès",
          "droit de rectification",
          "droit d’effacement",
          "droit à la limitation du traitement",
          "droit d’opposition",
          "droit à la portabilité",
          "droit de retrait du consentement lorsque le traitement repose sur celui-ci",
          "droit de définir des directives relatives au sort de ses données après son décès",
        ]}
      />
      <P>Les demandes peuvent être adressées à : <strong>contact@inrcy.com</strong></P>
      <P>
        Pour des raisons de sécurité, iNrCy peut demander une preuve d’identité lorsque cela est nécessaire. Lorsqu’une
        demande concerne des données traitées par iNrCy pour le compte d’un professionnel utilisateur, iNrCy peut
        rediriger la demande vers le professionnel concerné, responsable du traitement. La personne concernée peut
        également saisir la CNIL.
      </P>

      <h2 className={styles.h2}>26. Révocation des connexions aux services tiers</h2>
      <P>L’utilisateur peut révoquer les connexions aux services tiers connectés à iNrCy.</P>
      <P>Selon le service concerné, la révocation peut être effectuée :</P>
      <BulletList
        items={[
          "depuis les paramètres du logiciel iNrCy lorsque cette option est disponible",
          "depuis les paramètres du compte Google",
          "depuis les paramètres du compte YouTube ou du compte Google associé",
          "depuis les paramètres du compte TikTok",
          "depuis les paramètres des autres services tiers connectés",
        ]}
      />
      <P>
        Après révocation, certaines fonctionnalités liées au service concerné peuvent ne plus fonctionner. La révocation de
        l’accès n’entraîne pas nécessairement la suppression immédiate de toutes les données déjà nécessaires à
        l’historique, à la preuve, à la facturation, à la sécurité ou au respect d’obligations légales.
      </P>
      <P>L’utilisateur peut demander la suppression des données concernées à l’adresse : <strong>contact@inrcy.com</strong>.</P>

      <h2 className={styles.h2}>27. Suppression du compte</h2>
      <P>L’utilisateur peut demander la suppression de son compte iNrCy en contactant iNrCy à l’adresse : <strong>contact@inrcy.com</strong>.</P>
      <P>La suppression du compte peut entraîner la suppression ou l’archivage des données associées, sous réserve :</P>
      <BulletList
        items={[
          "des obligations légales de conservation",
          "des données nécessaires à la preuve",
          "des données nécessaires à la facturation",
          "des données nécessaires à la sécurité",
          "des données traitées pour le compte d’un professionnel utilisateur",
          "des délais techniques de sauvegarde ou d’archivage",
        ]}
      />
      <P>Lorsque iNrCy agit comme sous-traitant pour le compte d’un professionnel utilisateur, certaines demandes peuvent devoir être adressées directement au professionnel concerné.</P>

      <h2 className={styles.h2}>28. Mineurs</h2>
      <P>
        Les services iNrCy sont destinés exclusivement à des professionnels majeurs. Aucun service iNrCy n’est destiné aux
        mineurs. Toute donnée concernant un mineur pourra être supprimée sur demande lorsque cela est applicable.
      </P>

      <h2 className={styles.h2}>29. Modification de la présente politique</h2>
      <P>
        La présente Politique de confidentialité peut être modifiée à tout moment afin de tenir compte des évolutions du
        site, du logiciel, des services, des modules, des API utilisées, de la réglementation ou des prestataires.
      </P>
      <P>
        La version applicable est celle publiée sur le site internet et/ou dans le logiciel iNrCy au moment de la
        consultation. En cas de modification importante concernant l’utilisation des données issues de services tiers
        connectés, notamment Google, YouTube ou TikTok, iNrCy pourra informer les utilisateurs concernés et demander une
        nouvelle autorisation lorsque cela est nécessaire.
      </P>
    </section>
  );
}
