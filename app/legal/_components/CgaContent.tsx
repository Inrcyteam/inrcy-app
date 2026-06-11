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

export default function CgaContent() {
  return (
    <section>
      <h2 className={styles.h2}>Article 1 — Objet</h2>
      <P>
        Les présentes Conditions Générales d’Abonnement et Conditions d’Utilisation, ci-après les « Conditions »,
        définissent les modalités dans lesquelles la société <strong>iNrCy</strong>, SAS, met à disposition de
        professionnels un logiciel en ligne accessible par abonnement, ainsi que les règles applicables à l’utilisation
        du générateur iNrCy et de ses fonctionnalités.
      </P>
      <P>
        Le service principal consiste en la mise à disposition du logiciel iNrCy, plateforme SaaS permettant de piloter,
        centraliser et automatiser différents outils de communication, de visibilité, de publication, de statistiques et
        de gestion commerciale.
      </P>
      <P>Des services complémentaires peuvent être proposés, notamment :</P>
      <BulletList
        items={[
          "la location de générateurs iNrCy",
          "la mise à disposition ou la location de sites internet",
          "la vente de sites internet",
          "des prestations digitales associées",
          "des prestations d’accompagnement, de configuration ou de support",
          "des prestations de création, d’intégration ou de paramétrage",
          "des services de connexion à des plateformes tierces lorsque le Client les active",
        ]}
      />
      <P>
        Les présentes Conditions s’appliquent à toute souscription, utilisation, activation d’essai gratuit, création de
        compte ou accès au logiciel iNrCy. L’utilisation du logiciel iNrCy implique l’acceptation pleine et entière des
        présentes Conditions.
      </P>

      <h2 className={styles.h2}>Article 2 — Description générale du service</h2>
      <P>Le logiciel iNrCy permet notamment :</P>
      <BulletList
        items={[
          "la gestion multicanale de la communication du professionnel",
          "la publication de contenus sur plusieurs canaux connectés",
          "l’utilisation d’outils d’intelligence artificielle d’assistance rédactionnelle",
          "la préparation de campagnes commerciales ou de fidélisation",
          "l’accès à des statistiques, bilans et recommandations",
          "la gestion de contacts et d’actions commerciales",
          "l’utilisation de modules CRM",
          "la création, l’envoi, l’impression ou le suivi de devis et factures",
          "la consultation d’un historique d’actions dans iNrSend",
          "la gestion de rendez-vous ou demandes de rendez-vous lorsque la fonctionnalité est disponible",
          "l’utilisation d’un iNrBadge lorsque la fonctionnalité est activée",
          "l’utilisation d’un iNrAgent ou d’un assistant applicatif lorsque la fonctionnalité est disponible",
          "la connexion à des services tiers, tels que Google, YouTube, TikTok, Meta, Facebook, Instagram, LinkedIn, Microsoft, services de messagerie et autres plateformes compatibles",
        ]}
      />
      <P>
        L’accès s’effectue via navigateur ou application web dédiée. iNrCy s’efforce d’assurer une disponibilité normale
        du service, sans garantir une continuité ininterrompue. Des interruptions peuvent notamment survenir pour
        maintenance, mise à jour, évolution fonctionnelle, incident technique, contraintes liées à des services tiers,
        limitation imposée par une plateforme externe ou cas de force majeure.
      </P>

      <h2 className={styles.h2}>Article 3 — Nature des droits accordés</h2>
      <P>L’abonnement confère au Client un droit d’accès et d’utilisation du logiciel iNrCy.</P>
      <P>Ce droit est :</P>
      <BulletList
        items={[
          "personnel",
          "limité",
          "non exclusif",
          "non cessible",
          "non transférable",
          "valable uniquement pendant la durée de l’abonnement, de l’essai gratuit ou de l’accès accordé",
        ]}
      />
      <P>
        Aucun droit de propriété intellectuelle n’est transféré au Client. Le Client s’interdit notamment de copier,
        reproduire, revendre, louer, mettre à disposition, modifier, décompiler, désassembler, détourner ou tenter
        d’extraire tout ou partie du logiciel, sauf autorisation écrite préalable de iNrCy.
      </P>

      <h2 className={styles.h2}>Article 4 — Clients éligibles</h2>
      <P>
        Les services iNrCy sont exclusivement réservés aux professionnels. Le Client déclare agir à des fins
        professionnelles, pour les besoins de son activité commerciale, artisanale, libérale, associative,
        entrepreneuriale ou institutionnelle.
      </P>
      <P>
        Aucun service iNrCy n’est destiné aux consommateurs au sens du Code de la consommation. Le Client garantit
        disposer de la capacité juridique, des autorisations et des droits nécessaires pour souscrire, utiliser le service
        et engager l’entreprise ou l’organisation qu’il représente.
      </P>

      <h2 className={styles.h2}>Article 5 — Souscription et essai gratuit</h2>
      <P>L’abonnement peut être souscrit :</P>
      <BulletList
        items={[
          "via un lien de paiement transmis par iNrCy",
          "via un formulaire d’inscription ou d’activation",
          "via une offre commerciale",
          "via un échange écrit validé entre les parties",
          "via tout autre moyen contractuel accepté par iNrCy",
        ]}
      />
      <P>
        Lorsque iNrCy propose un essai gratuit, sa durée standard est de <strong>21 jours calendaires</strong> à compter
        de l’activation du compte ou du générateur, sauf mention contraire dans l’offre commerciale, accord écrit
        spécifique, partenariat particulier ou paramétrage différent expressément indiqué au Client.
      </P>
      <P>
        Les offres antérieures, comptes déjà activés ou accords spécifiques peuvent bénéficier d’une durée différente si
        iNrCy l’a expressément accordée.
      </P>
      <P>
        L’activation d’un essai gratuit ne vaut pas nécessairement souscription payante. En revanche, l’utilisation du
        générateur iNrCy pendant l’essai implique l’acceptation des présentes Conditions et de la Politique de
        confidentialité.
      </P>
      <P>
        La souscription payante peut intervenir pendant ou après la période d’essai. Lorsque le Client souscrit pendant
        son essai gratuit, les conditions de démarrage de l’abonnement, de facturation et de paiement sont celles
        indiquées au moment de la souscription ou dans l’accord commercial applicable.
      </P>
      <P>
        La validation du paiement, l’activation du compte, l’utilisation de l’application, la connexion à un service tiers
        ou la demande d’essai gratuit vaut acceptation pleine et entière des présentes Conditions.
      </P>
      <P>
        iNrCy se réserve le droit de refuser, suspendre ou interrompre un essai gratuit en cas d’abus, de fraude,
        d’utilisation non conforme, de tentative de contournement, de risque technique ou de comportement contraire aux
        présentes Conditions.
      </P>

      <h2 className={styles.h2}>Article 6 — Durée — Résiliation</h2>
      <P>Sauf accord contraire, l’abonnement est conclu pour une durée mensuelle, sans engagement.</P>
      <P>
        Il est reconduit tacitement chaque mois. Le Client peut résilier à tout moment depuis son espace client, via les
        moyens mis à disposition par iNrCy ou par demande écrite adressée au support. La résiliation prend effet à la fin
        de la période d’abonnement en cours. Toute période entamée est due.
      </P>
      <P>
        En cas de résiliation, l’accès au logiciel peut être désactivé à l’issue de la période en cours. Certaines données
        peuvent être conservées temporairement pour des raisons techniques, légales, comptables, contractuelles, de preuve
        ou de sécurité.
      </P>
      <P>
        La résiliation n’entraîne pas automatiquement la suppression immédiate de toutes les données, notamment lorsque
        celles-ci doivent être conservées pour respecter une obligation légale, comptable, fiscale, de sécurité ou de
        preuve.
      </P>

      <h2 className={styles.h2}>Article 7 — Prix — Paiement</h2>
      <P>
        Les prix sont indiqués en euros hors taxes, sauf mention contraire. Le paiement est effectué via Stripe ou tout
        autre prestataire de paiement accepté par iNrCy. La facturation est mensuelle et automatique, sauf stipulation
        contraire. Le Client est responsable de la validité de son moyen de paiement.
      </P>
      <P>
        iNrCy peut proposer différentes offres commerciales, notamment des offres standards, offres partenaires, offres
        fondateurs, offres promotionnelles, offres personnalisées ou offres sur mesure.
      </P>
      <P>
        Les avantages accordés dans le cadre d’une offre spécifique, notamment tarif préférentiel, durée d’essai,
        accompagnement, remise ou accès particulier, ne s’appliquent que dans les conditions indiquées par iNrCy.
      </P>
      <P>
        iNrCy peut modifier ses tarifs avec un préavis raisonnable, notamment en cas d’évolution de l’offre, des
        fonctionnalités, des coûts techniques, des services tiers, des conditions commerciales ou des charges
        d’exploitation. Toute modification tarifaire applicable à un abonnement en cours sera communiquée au Client selon
        les modalités prévues par iNrCy.
      </P>

      <h2 className={styles.h2}>Article 8 — Défaut de paiement</h2>
      <P>En cas d’échec de paiement, de retard ou d’impayé :</P>
      <BulletList
        items={[
          "le service peut être suspendu",
          "l’accès au logiciel peut être restreint",
          "certaines fonctionnalités peuvent être désactivées",
          "les connexions aux services tiers peuvent être interrompues",
          "les données peuvent être conservées pendant un délai raisonnable avant archivage ou suppression",
        ]}
      />
      <P>
        Après régularisation, le service peut être réactivé. iNrCy ne saurait être tenue responsable des conséquences
        liées à une suspension résultant d’un défaut de paiement du Client.
      </P>

      <h2 className={styles.h2}>Article 9 — Booster / Publier</h2>
      <P>
        Le module Booster / Publier permet au Client de préparer, générer, adapter et diffuser des contenus sur différents
        canaux connectés.
      </P>
      <P>Le Client peut notamment :</P>
      <BulletList
        items={[
          "rédiger ou faire générer des contenus",
          "ajouter des images ou une vidéo",
          "adapter les contenus selon les canaux",
          "prévisualiser les publications",
          "sélectionner les canaux de diffusion",
          "valider la publication avant envoi",
          "publier sur les canaux disponibles et connectés",
        ]}
      />
      <P>
        Les contenus générés, préparés ou adaptés dans Booster / Publier doivent être vérifiés par le Client avant
        publication. La validation finale appartient exclusivement au Client.
      </P>
      <P>
        iNrCy ne garantit pas que les contenus générés soient exacts, complets, conformes à une réglementation
        sectorielle, adaptés à l’activité spécifique du Client ou acceptés par les plateformes tierces. Le Client demeure
        seul responsable des contenus publiés, envoyés, validés ou diffusés depuis son compte.
      </P>

      <h2 className={styles.h2}>Article 10 — Médias, images et vidéos</h2>
      <P>Le Client peut utiliser des médias dans les limites prévues par l’application.</P>
      <P>Sauf évolution ultérieure de l’offre, Booster / Publier permet notamment d’ajouter :</P>
      <BulletList items={["jusqu’à 5 images", "ou 1 vidéo", "dans une limite média de 40 Mo maximum"]} />
      <P>
        Les limites techniques peuvent évoluer selon les besoins de stabilité, de sécurité, de performance ou les
        contraintes imposées par les plateformes tierces.
      </P>
      <P>
        Le Client garantit disposer des droits nécessaires sur les images, vidéos, logos, sons, musiques, textes, marques
        ou tout autre élément transmis dans l’application.
      </P>
      <P>
        Le Client s’interdit de publier des contenus illicites, trompeurs, diffamatoires, discriminatoires,
        contrefaisants, contraires aux droits de tiers, aux règles des plateformes connectées ou à la réglementation
        applicable à son activité.
      </P>

      <h2 className={styles.h2}>Article 11 — Vidéos et adaptation de format</h2>
      <P>
        L’application peut proposer des outils d’adaptation vidéo, notamment pour ajuster le format d’un contenu selon les
        canaux de publication. Les adaptations peuvent entraîner un traitement technique, un délai d’exécution, une
        compression, une modification visuelle du rendu ou une génération de variante.
      </P>
      <P>
        Le Client est informé que certains canaux tiers peuvent imposer leurs propres contraintes de format, de durée, de
        poids, de résolution, de ratio, de validation, de droit d’auteur ou de modération. iNrCy s’efforce de faciliter
        l’adaptation des contenus, sans garantir l’acceptation systématique par les plateformes tierces.
      </P>

      <h2 className={styles.h2}>Article 12 — Intelligence artificielle</h2>
      <P>
        Les fonctionnalités d’intelligence artificielle intégrées à iNrCy constituent des outils d’assistance. Elles
        peuvent aider à rédiger, reformuler, structurer, proposer, analyser ou préparer des contenus.
      </P>
      <P>
        Les contenus générés par intelligence artificielle doivent être vérifiés, corrigés et validés par le Client avant
        toute utilisation, publication, envoi ou diffusion.
      </P>
      <P>
        iNrCy ne garantit ni l’exactitude, ni la conformité, ni la performance commerciale, ni l’absence d’erreur, ni
        l’adéquation complète des contenus générés. Le Client demeure seul responsable des contenus diffusés, envoyés,
        publiés ou utilisés dans le cadre de son activité.
      </P>
      <P>
        Le Client s’engage à ne pas transmettre volontairement à l’intelligence artificielle de données sensibles,
        confidentielles, inutiles, illicites ou appartenant à des tiers sans autorisation appropriée.
      </P>

      <h2 className={styles.h2}>Article 13 — iNrAgent et automatisations</h2>
      <P>
        Lorsque la fonctionnalité iNrAgent est disponible, elle peut assister le Client dans la préparation d’actions, de
        contenus, de recommandations, de scénarios, de bilans ou d’automatisations.
      </P>
      <P>
        iNrAgent constitue un outil d’aide et de préparation. Sauf indication contraire ou validation explicite du Client,
        il n’a pas vocation à exécuter seul des actions sensibles, notamment publication, envoi de campagne, modification
        de données, création d’événement, relance ou action commerciale engageante.
      </P>
      <P>Le Client reste responsable de la validation finale des actions préparées ou proposées par iNrAgent.</P>
      <P>Les scénarios automatisés peuvent dépendre :</P>
      <BulletList
        items={[
          "des fonctionnalités réellement disponibles dans l’application",
          "des réglages définis par le Client",
          "des canaux connectés",
          "des autorisations accordées",
          "des limites techniques",
          "des règles des plateformes tierces",
        ]}
      />
      <P>
        iNrCy ne garantit pas qu’une automatisation produise un résultat commercial, une visibilité, une conversion, une
        prise de contact ou une performance déterminée.
      </P>

      <h2 className={styles.h2}>Article 14 — Canaux connectés et services tiers</h2>
      <P>Le logiciel peut interagir avec des services tiers, notamment :</P>
      <BulletList
        items={[
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
          "Meta",
          "Facebook",
          "Instagram",
          "LinkedIn",
          "Microsoft",
          "services de messagerie",
          "hébergeurs",
          "plateformes sociales",
          "API",
          "outils de paiement",
          "autres outils connectés compatibles",
        ]}
      />
      <P>Le Client :</P>
      <BulletList
        items={[
          "autorise les connexions nécessaires au fonctionnement du service",
          "reconnaît que ces connexions peuvent nécessiter des autorisations, jetons, identifiants, validations externes ou consentements spécifiques",
          "demeure responsable des contenus publiés ou envoyés",
          "peut révoquer certaines autorisations selon les modalités prévues par les services tiers ou par iNrCy lorsque cette option est disponible",
          "s’engage à respecter les conditions, règles, politiques et limitations propres à chaque plateforme connectée",
        ]}
      />
      <P>
        iNrCy ne garantit pas la disponibilité, la continuité, la stabilité, les délais, les règles de validation, les
        performances, les quotas, les politiques de modération ou les décisions des services tiers.
      </P>
      <P>
        Toute modification, suspension, restriction, panne, refus de publication, suppression de contenu, limitation de
        compte, blocage d’API ou interruption d’un service tiers relève de la responsabilité du fournisseur concerné. Le
        Client reconnaît utiliser ces services sous sa propre responsabilité et conformément aux conditions propres à
        chaque plateforme.
      </P>

      <h2 className={styles.h2}>Article 15 — Google, YouTube et services Google</h2>
      <P>
        Lorsque le Client connecte un compte Google, YouTube ou un service Google compatible, il autorise iNrCy à accéder
        uniquement aux données nécessaires au fonctionnement des fonctionnalités activées.
      </P>
      <P>Ces fonctionnalités peuvent notamment permettre :</P>
      <BulletList
        items={[
          "la connexion d’un compte Google",
          "la connexion d’un établissement Google Business Profile",
          "la connexion d’un calendrier Google Calendar",
          "l’affichage ou l’analyse de statistiques Google Analytics",
          "l’affichage ou l’analyse de données Google Search Console",
          "la préparation ou la publication de contenus via les services Google disponibles",
          "la préparation ou publication de contenus YouTube lorsque cette fonctionnalité est disponible",
          "l’affichage de données, ressources, chaînes, établissements ou calendriers connectés",
        ]}
      />
      <P>
        Le Client reconnaît que l’utilisation des fonctionnalités YouTube implique l’utilisation des <strong>YouTube API Services</strong>.
        Le Client reste également soumis aux <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">conditions d’utilisation de YouTube</a>, aux <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" rel="noreferrer">conditions d’utilisation des YouTube API Services</a> et à la <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">politique de confidentialité de Google</a>.
      </P>
      <P>
        Le Client peut révoquer les accès Google ou YouTube depuis son compte Google, depuis les paramètres de sécurité
        Google ou depuis l’application iNrCy lorsque cette option est disponible.
      </P>
      <P>
        iNrCy ne garantit pas l’acceptation, la publication, le maintien, le référencement, la visibilité ou la
        performance des contenus sur Google ou YouTube.
      </P>
      <P>
        Le Client demeure seul responsable des contenus publiés, envoyés ou validés via Google ou YouTube, ainsi que du
        respect des droits d’auteur, droits à l’image, droits musicaux, droits de marque, règles de confidentialité et
        règles propres à ces plateformes.
      </P>

      <h2 className={styles.h2}>Article 16 — TikTok</h2>
      <P>
        Lorsque le Client connecte un compte TikTok, il autorise iNrCy à utiliser les API TikTok disponibles afin de
        préparer, envoyer, publier ou suivre certains contenus, selon les fonctionnalités disponibles dans l’application.
      </P>
      <P>Ces fonctionnalités peuvent notamment permettre :</P>
      <BulletList
        items={[
          "la connexion d’un compte TikTok",
          "l’affichage de certaines informations du créateur lorsque l’API les fournit",
          "l’affichage des paramètres de confidentialité disponibles",
          "la préparation d’une publication",
          "l’envoi d’un média vers TikTok",
          "le suivi du statut de publication",
          "l’affichage d’erreurs ou de retours techniques de l’API TikTok",
        ]}
      />
      <P>
        Le Client reconnaît que TikTok peut imposer ses propres règles, restrictions, délais, quotas, validations,
        formats, paramètres de confidentialité, règles de publication ou décisions de modération.
      </P>
      <P>
        iNrCy ne garantit pas l’acceptation, la publication, le maintien, la visibilité ou la performance des contenus sur
        TikTok.
      </P>
      <P>
        Le Client demeure seul responsable des contenus publiés, envoyés ou validés via TikTok, ainsi que du respect des
        droits d’auteur, droits à l’image, droits musicaux, droits de marque, règles de confidentialité et règles propres
        à TikTok.
      </P>
      <P>Le Client peut révoquer l’accès iNrCy depuis son compte TikTok ou depuis iNrCy lorsque cette option est disponible.</P>

      <h2 className={styles.h2}>Article 17 — Mails, campagnes et contacts CRM</h2>
      <P>
        L’application peut permettre l’envoi de mails, de campagnes, de communications commerciales ou d’informations à
        partir des contacts renseignés ou importés par le Client.
      </P>
      <P>Le Client demeure seul responsable :</P>
      <BulletList
        items={[
          "de l’origine licite des contacts",
          "de la qualité et de la mise à jour des données",
          "du respect des règles applicables en matière de prospection",
          "de l’information des destinataires",
          "de la gestion des désinscriptions",
          "du contenu des messages envoyés",
          "de la conformité de ses campagnes",
          "du respect des obligations légales et réglementaires liées à son activité",
        ]}
      />
      <P>iNrCy agit comme prestataire technique et ne saurait être tenue responsable d’une utilisation non conforme des données ou des campagnes par le Client.</P>

      <h2 className={styles.h2}>Article 18 — CRM, données clients, devis et factures</h2>
      <P>Le Client est seul responsable :</P>
      <BulletList
        items={[
          "des données enregistrées dans le module CRM",
          "des contacts, prospects et clients intégrés",
          "des devis générés",
          "des factures créées ou envoyées",
          "des informations commerciales, fiscales, comptables ou légales saisies dans l’application",
          "des statuts, notes, montants, prestations et informations transmises à ses propres clients",
        ]}
      />
      <P>
        iNrCy agit comme prestataire technique et, lorsque cela est applicable, comme sous-traitant au sens du RGPD pour
        les traitements réalisés pour le compte du Client. Le Client reste responsable de la vérification des informations
        présentes sur ses devis, factures et documents commerciaux.
      </P>

      <h2 className={styles.h2}>Article 19 — Factures envoyées</h2>
      <P>Une facture envoyée depuis l’application est considérée comme officielle dans l’application.</P>
      <P>
        Pour des raisons de traçabilité, de sécurité et de cohérence de l’historique, les factures envoyées ne sont pas
        supprimables manuellement depuis iNrSend. Toute demande exceptionnelle de suppression, correction ou intervention
        spécifique sur une facture envoyée doit être formulée par écrit auprès du support iNrCy.
      </P>
      <P>
        Cette règle concerne uniquement le fonctionnement interne de l’application iNrCy et ne dispense pas le Client de
        ses propres obligations comptables, fiscales et légales. Le Client demeure seul responsable de la conservation
        légale de ses factures, pièces justificatives et documents comptables.
      </P>

      <h2 className={styles.h2}>Article 20 — iNrSend et historique</h2>
      <P>
        iNrSend permet de consulter l’historique de certaines actions réalisées dans l’application, notamment les
        publications, propulsions, fidélisations, mails, devis et factures.
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
        Ces durées concernent uniquement l’affichage dans l’historique iNrSend. Les anciens éléments peuvent être
        automatiquement archivés, masqués ou supprimés de l’historique actif une fois la durée prévue atteinte. Ces durées
        ne constituent pas une garantie de conservation légale ou comptable des documents du Client. Le Client reste
        responsable de ses propres sauvegardes et obligations de conservation.
      </P>

      <h2 className={styles.h2}>Article 21 — Statistiques et recommandations</h2>
      <P>
        L’application peut proposer des statistiques, indicateurs, projections, recommandations, bilans ou estimations.
        Ces éléments sont fournis à titre informatif.
      </P>
      <P>
        Ils peuvent dépendre de données internes, de connexions à des services tiers, d’algorithmes, de calculs
        automatiques, de données partielles ou de données fournies par les plateformes connectées. iNrCy ne garantit pas
        l’exactitude absolue, l’exhaustivité, la disponibilité permanente ou le résultat commercial des statistiques,
        recommandations ou projections affichées.
      </P>
      <P>Les statistiques ou recommandations ne constituent pas un conseil juridique, comptable, fiscal, financier ou stratégique personnalisé.</P>

      <h2 className={styles.h2}>Article 22 — iNrBadge et demandes entrantes</h2>
      <P>
        Lorsque la fonctionnalité iNrBadge est disponible, elle peut permettre au Client de partager une fiche publique,
        un QR code, des boutons de contact, des liens, des réseaux sociaux ou un formulaire de demande de rendez-vous.
      </P>
      <P>Le Client demeure responsable :</P>
      <BulletList
        items={[
          "des informations affichées sur sa fiche",
          "des coordonnées communiquées",
          "des liens ajoutés",
          "des canaux activés",
          "de la gestion des demandes reçues",
          "des réponses apportées à ses contacts",
          "du respect de la réglementation applicable à son activité",
        ]}
      />
      <P>iNrCy ne garantit pas qu’une consultation, un scan, un clic, une demande ou un rendez-vous aboutisse à une vente, un contrat ou un résultat commercial.</P>

      <h2 className={styles.h2}>Article 23 — iNrCalendar et rendez-vous</h2>
      <P>
        Lorsque la fonctionnalité iNrCalendar ou Agenda est disponible, elle peut permettre au Client de gérer certains
        rendez-vous, demandes de rendez-vous, créneaux ou rappels.
      </P>
      <P>Le Client demeure responsable :</P>
      <BulletList
        items={[
          "de la configuration de ses disponibilités",
          "de la validation ou du refus des demandes",
          "de la présence effective aux rendez-vous",
          "de la vérification des informations communiquées aux participants",
          "de la gestion des annulations, reports ou modifications",
        ]}
      />
      <P>
        iNrCy ne saurait être tenue responsable d’un rendez-vous manqué, d’une indisponibilité, d’une erreur de saisie,
        d’un mauvais paramétrage, d’un email non reçu ou d’une synchronisation défaillante avec un service tiers.
      </P>

      <h2 className={styles.h2}>Article 24 — Sites internet complémentaires</h2>
      <h3 className={styles.h2}>24.1 Location ou mise à disposition de site</h3>
      <P>
        En cas de location ou mise à disposition d’un site internet, le site demeure la propriété exclusive de iNrCy, sauf
        accord écrit contraire. Le Client bénéficie d’un droit d’usage limité pendant la durée de l’abonnement ou du
        contrat applicable. La suspension ou la résiliation de l’abonnement peut entraîner la suspension de l’accès au
        site mis à disposition.
      </P>
      <h3 className={styles.h2}>24.2 Vente de site internet</h3>
      <P>
        En cas de vente, le Client devient propriétaire du site livré, hors technologies, outils, scripts, méthodes,
        composants, modèles, structures ou éléments propriétaires de iNrCy, sauf stipulation écrite contraire.
      </P>
      <h3 className={styles.h2}>24.3 Contenus du site</h3>
      <P>
        Le Client est responsable des informations, textes, images, mentions, tarifs, offres, services, coordonnées et
        contenus publiés sur son site. Le Client garantit disposer des droits nécessaires sur les éléments transmis à
        iNrCy.
      </P>
      <P>
        Le Client demeure responsable de la conformité de son site, notamment en matière de mentions légales, politique de
        confidentialité, cookies, formulaires, prospection, publicité, affichage des prix et règles propres à son secteur
        d’activité.
      </P>

      <h2 className={styles.h2}>Article 25 — Données personnelles</h2>
      <P>Les traitements de données personnelles sont régis par la Politique de confidentialité de iNrCy.</P>
      <P>
        Lorsque iNrCy traite des données pour son propre compte, notamment dans le cadre de la gestion commerciale,
        administrative, contractuelle, de facturation ou de support, iNrCy agit comme responsable de traitement.
      </P>
      <P>
        Lorsque iNrCy traite des données pour le compte du Client, notamment les contacts CRM, clients finaux, prospects,
        données de campagne, devis, factures ou données commerciales du Client, iNrCy agit comme sous-traitant technique.
      </P>
      <P>
        Le Client demeure responsable des données personnelles qu’il renseigne, importe, collecte ou utilise dans
        l’application. Le Client s’engage à informer les personnes concernées et à respecter la réglementation applicable,
        notamment le RGPD et les règles relatives à la prospection commerciale.
      </P>
      <P>
        Le Client reconnaît que certaines fonctionnalités nécessitent la connexion à des services tiers et que ces services
        peuvent traiter les données selon leurs propres conditions et politiques de confidentialité.
      </P>

      <h2 className={styles.h2}>Article 26 — Sécurité et accès au compte</h2>
      <P>
        Le Client est responsable de la confidentialité de ses identifiants, mots de passe et accès. Toute action réalisée
        depuis le compte du Client est réputée effectuée par celui-ci, sauf preuve contraire.
      </P>
      <P>
        Le Client s’engage à informer rapidement iNrCy en cas d’accès non autorisé, suspicion de compromission, perte
        d’identifiant ou anomalie de sécurité. iNrCy peut mettre en œuvre des mesures techniques destinées à protéger les
        comptes, limiter les abus, bloquer certaines actions ou suspendre temporairement un accès en cas de risque.
      </P>
      <P>
        Le Client est également responsable de la sécurité de ses propres comptes tiers connectés à iNrCy, notamment
        Google, YouTube, TikTok, Meta, LinkedIn, Microsoft ou services de messagerie.
      </P>

      <h2 className={styles.h2}>Article 27 — Maintenance, évolutions et fonctionnalités à venir</h2>
      <P>
        iNrCy peut faire évoluer l’application, ses modules, ses interfaces, ses règles techniques, ses limites, ses
        canaux disponibles ou ses fonctionnalités. Certaines fonctionnalités peuvent être ajoutées, modifiées, renommées,
        suspendues, limitées ou retirées pour des raisons techniques, commerciales, de sécurité, de conformité ou de
        dépendance à des services tiers.
      </P>
      <P>
        Les fonctionnalités indiquées comme « à venir », « en développement », « bientôt disponible », « bêta », « test »
        ou similaires ne constituent pas un engagement ferme de livraison à une date déterminée.
      </P>
      <P>
        iNrCy peut également limiter temporairement ou définitivement certaines fonctionnalités si une plateforme tierce
        modifie ses règles, ses API, ses conditions d’accès, ses quotas ou ses exigences de validation.
      </P>

      <h2 className={styles.h2}>Article 28 — Obligations du Client</h2>
      <P>Le Client s’engage à utiliser l’application conformément :</P>
      <BulletList
        items={[
          "aux présentes Conditions",
          "à la Politique de confidentialité",
          "aux lois et règlements applicables",
          "aux droits des tiers",
          "aux règles des plateformes connectées",
          "à son activité professionnelle",
        ]}
      />
      <P>Le Client s’interdit notamment :</P>
      <BulletList
        items={[
          "toute utilisation frauduleuse, abusive ou illicite",
          "toute tentative d’accès non autorisé",
          "toute publication de contenu interdit ou portant atteinte aux droits de tiers",
          "toute utilisation de données personnelles sans base légale appropriée",
          "toute action susceptible de perturber le fonctionnement de l’application",
          "toute revente ou mise à disposition non autorisée du logiciel",
          "toute tentative de contournement des limites techniques",
          "toute utilisation susceptible de nuire à iNrCy, à ses clients, à ses partenaires ou aux plateformes connectées",
        ]}
      />

      <h2 className={styles.h2}>Article 29 — Responsabilité de iNrCy</h2>
      <P>iNrCy est tenue à une obligation de moyens.</P>
      <P>
        iNrCy ne garantit pas que le service sera exempt d’erreurs, disponible sans interruption ou compatible avec tous
        les besoins spécifiques du Client.
      </P>
      <P>La responsabilité totale de iNrCy, toutes causes confondues, est expressément limitée au montant le plus élevé entre :</P>
      <BulletList items={["les sommes versées par le Client au cours des douze derniers mois", "ou un plafond fixe de 1 000 euros"]} />
      <P>En aucun cas iNrCy ne pourra être tenue responsable :</P>
      <BulletList
        items={[
          "des pertes indirectes",
          "pertes d’exploitation",
          "pertes de chiffre d’affaires",
          "pertes de données",
          "atteintes à l’image",
          "pertes commerciales",
          "conséquences liées à une erreur du Client",
          "conséquences liées à un service tiers",
          "refus de publication par une plateforme",
          "suspension ou limitation imposée par un tiers",
          "suppression ou modération d’un contenu par une plateforme",
          "déréférencement, baisse de visibilité ou baisse de performance",
          "contenu publié, envoyé ou validé par le Client",
          "utilisation non conforme des données par le Client",
          "erreur présente dans un devis, une facture, un mail, une campagne ou une publication validée par le Client",
        ]}
      />

      <h2 className={styles.h2}>Article 30 — Suspension du service</h2>
      <P>iNrCy peut suspendre tout ou partie de l’accès au service en cas :</P>
      <BulletList
        items={[
          "de non-paiement",
          "d’utilisation abusive",
          "de violation des présentes Conditions",
          "de suspicion de fraude",
          "de risque pour la sécurité",
          "de demande d’une autorité compétente",
          "de comportement susceptible de porter atteinte à iNrCy, à ses clients, à ses partenaires ou à des tiers",
          "d’utilisation susceptible d’entraîner un risque pour les services tiers connectés",
          "de non-respect des règles d’une plateforme connectée",
        ]}
      />
      <P>
        La suspension peut être immédiate en cas d’urgence ou de risque grave. La suspension n’ouvre droit à aucune
        indemnisation lorsque celle-ci résulte d’un manquement du Client, d’un risque de sécurité, d’une obligation légale
        ou d’une contrainte imposée par un service tiers.
      </P>

      <h2 className={styles.h2}>Article 31 — Rétractation et remboursement</h2>
      <P>
        Le Client agit à titre professionnel. Au moment de la souscription, de l’activation ou de la demande d’essai, il
        reconnaît que le service est destiné à un usage professionnel.
      </P>
      <P>
        Lorsque le service est activé immédiatement, aucun remboursement n’est dû après activation du service, attribution
        d’un accès, mise à disposition d’un générateur, configuration d’un site ou démarrage d’une prestation, sauf accord
        écrit contraire de iNrCy. Toute période d’abonnement entamée est due.
      </P>
      <P>Les offres promotionnelles, offres partenaires, offres fondateurs ou remises commerciales ne sont pas nécessairement reconductibles, transférables ou cumulables.</P>

      <h2 className={styles.h2}>Article 32 — Propriété intellectuelle</h2>
      <P>
        Le logiciel iNrCy, ses interfaces, marques, logos, designs, textes, méthodes, composants, fonctionnalités, bases
        techniques, bases graphiques, modèles, structures, automatisations et éléments propriétaires demeurent la
        propriété exclusive de iNrCy ou de ses ayants droit.
      </P>
      <P>
        Le Client conserve les droits dont il dispose sur ses propres contenus, marques, logos, images, vidéos, données et
        documents. Le Client accorde à iNrCy les droits nécessaires pour héberger, traiter, adapter techniquement,
        afficher, transmettre et publier ces contenus dans le strict cadre de la fourniture du service.
      </P>

      <h2 className={styles.h2}>Article 33 — Preuve</h2>
      <P>
        Les enregistrements informatiques, journaux techniques, historiques applicatifs, traces de connexion, validations
        effectuées dans l’application, envois, publications, statuts, horodatages, actions utilisateur et systèmes de
        paiement font foi entre les parties, sauf preuve contraire.
      </P>

      <h2 className={styles.h2}>Article 34 — Support</h2>
      <P>Le support iNrCy peut être contacté par les moyens communiqués au Client.</P>
      <P>
        Certaines demandes, notamment celles concernant des factures envoyées, suppressions exceptionnelles, corrections
        sensibles, données, accès ou connexions à des services tiers, peuvent nécessiter une demande écrite par mail.
      </P>
      <P>
        iNrCy s’efforce de répondre dans des délais raisonnables, sans garantir un délai de résolution lorsque la demande
        dépend d’un service tiers, d’une vérification technique ou d’une intervention spécifique.
      </P>

      <h2 className={styles.h2}>Article 35 — Force majeure</h2>
      <P>
        iNrCy ne pourra être tenue responsable en cas d’inexécution ou de retard résultant d’un événement échappant
        raisonnablement à son contrôle, notamment panne généralisée, cyberattaque, interruption d’hébergement, défaillance
        d’un prestataire, blocage d’un service tiers, catastrophe naturelle, décision administrative, conflit social,
        guerre, épidémie, restriction réglementaire ou événement de force majeure reconnu par le droit français.
      </P>

      <h2 className={styles.h2}>Article 36 — Modification des Conditions</h2>
      <P>
        iNrCy peut modifier les présentes Conditions afin de tenir compte des évolutions du service, des fonctionnalités,
        de la réglementation, des prestataires, des plateformes tierces ou de son modèle commercial.
      </P>
      <P>
        La version applicable est celle publiée sur le site internet ou communiquée au Client au moment de l’utilisation du
        service. En cas de modification importante, iNrCy pourra informer le Client par tout moyen approprié. La poursuite
        de l’utilisation du service après modification vaut acceptation des nouvelles Conditions.
      </P>

      <h2 className={styles.h2}>Article 37 — Droit applicable — Tribunal compétent</h2>
      <P>
        Les présentes Conditions sont régies par le droit français. Tout litige relatif à leur interprétation, leur
        exécution ou leur validité relève, sauf disposition légale impérative contraire, du <strong>Tribunal de commerce d’Arras</strong>.
      </P>
    </section>
  );
}
