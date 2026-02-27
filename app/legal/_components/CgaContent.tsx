"use client";

import styles from "../legal.module.css";

export default function CgaContent() {
  return (
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

      <h2 className={styles.h2}>Article 2 — Description du logiciel</h2>
      <p className={styles.p}>Le logiciel iNrCy permet notamment :</p>
      <ul className={styles.ul}>
        <li>Gestion multicanale (Google, Facebook, etc.)</li>
        <li>Publication automatisée</li>
        <li>Accès à des statistiques</li>
        <li>Module CRM</li>
        <li>Émission de devis et factures</li>
        <li>Outils d’intelligence artificielle d’assistance rédactionnelle</li>
      </ul>
      <p className={styles.p}>L’accès s’effectue via navigateur ou application web dédiée.</p>

      <h2 className={styles.h2}>Article 3 — Nature des droits accordés</h2>
      <p className={styles.p}>L’abonnement confère au Client :</p>
      <ul className={styles.ul}>
        <li>un droit d’accès</li>
        <li>un droit d’utilisation limité</li>
        <li>non exclusif</li>
        <li>non cessible</li>
        <li>non transférable</li>
      </ul>
      <p className={styles.p}>
        pendant la durée de l’abonnement. Aucun droit de propriété intellectuelle n’est transféré.
      </p>

      <h2 className={styles.h2}>Article 4 — Clients éligibles</h2>
      <p className={styles.p}>
        Les services sont exclusivement réservés aux professionnels. Le Client déclare agir à des fins
        professionnelles. Aucun service n’est destiné aux consommateurs.
      </p>

      <h2 className={styles.h2}>Article 5 — Souscription</h2>
      <p className={styles.p}>
        L’abonnement peut être souscrit via un lien de paiement transmis par iNrCy, via tout autre moyen contractuel
        validé entre les parties. La validation du paiement vaut acceptation pleine et entière des présentes CGA.
      </p>

      <h2 className={styles.h2}>Article 6 — Durée — Résiliation</h2>
      <p className={styles.p}>
        L’abonnement est conclu pour une durée mensuelle, sans engagement, et est reconduit tacitement chaque mois.
        Le Client peut résilier à tout moment depuis son espace client ou par demande écrite. La résiliation prend
        effet à la fin de la période en cours. Toute période entamée est due.
      </p>

      <h2 className={styles.h2}>Article 7 — Prix — Paiement</h2>
      <p className={styles.p}>
        Les prix sont indiqués en euros hors taxes. Le paiement est effectué via Stripe. La facturation est mensuelle
        et automatique. Le Client est responsable de la validité de son moyen de paiement. iNrCy peut modifier ses
        tarifs avec un préavis de 30 jours.
      </p>

      <h2 className={styles.h2}>Article 8 — Défaut de paiement</h2>
      <p className={styles.p}>En cas d’échec de paiement :</p>
      <ul className={styles.ul}>
        <li>le service peut être suspendu</li>
        <li>l’accès au logiciel peut être restreint</li>
        <li>les données peuvent être conservées pendant un délai raisonnable avant suppression</li>
      </ul>
      <p className={styles.p}>Après régularisation, le service peut être réactivé.</p>

      <h2 className={styles.h2}>Article 9 — CRM et facturation</h2>
      <p className={styles.p}>
        Le Client est seul responsable des données enregistrées dans le module CRM, des devis et factures générés, et
        du respect des obligations légales et fiscales. iNrCy agit comme prestataire technique et sous-traitant au
        sens du RGPD.
      </p>

      <h2 className={styles.h2}>Article 10 — Connexions API et services tiers</h2>
      <p className={styles.p}>
        Le logiciel peut interagir avec des services tiers (Google, Microsoft, Meta, messagerie).
      </p>
      <p className={styles.p}>Le Client :</p>
      <ul className={styles.ul}>
        <li>autorise ces connexions</li>
        <li>demeure responsable des contenus publiés</li>
        <li>peut révoquer l’accès à tout moment</li>
      </ul>
      <p className={styles.p}>
        iNrCy ne peut être tenue responsable des modifications ou limitations imposées par ces services tiers.
      </p>

      <h2 className={styles.h2}>Article 11 — Intelligence artificielle</h2>
      <p className={styles.p}>
        Les fonctionnalités d’intelligence artificielle constituent des outils d’assistance. Les contenus générés
        doivent être vérifiés avant publication. iNrCy ne garantit ni l’exactitude ni la conformité des contenus
        générés. Le Client demeure seul responsable des contenus diffusés.
      </p>

      <h2 className={styles.h2}>Article 12 — Sites internet complémentaires</h2>
      <p className={styles.p}>
        <strong>12.1 Location</strong> — En cas de location, le site demeure la propriété exclusive de iNrCy. Le Client
        bénéficie d’un droit d’usage limité pendant la durée de l’abonnement.
      </p>
      <p className={styles.p}>
        <strong>12.2 Vente</strong> — En cas de vente, le Client devient propriétaire du site livré, hors technologies
        propriétaires iNrCy.
      </p>

      <h2 className={styles.h2}>Article 13 — Données personnelles</h2>
      <p className={styles.p}>
        Les traitements sont régis par la Politique de confidentialité. Concernant le CRM : le Client est responsable
        des données de ses propres clients ; iNrCy agit comme sous-traitant technique.
      </p>

      <h2 className={styles.h2}>Article 14 — Responsabilité</h2>
      <p className={styles.p}>
        iNrCy est tenue à une obligation de moyens. Aucune garantie de résultats (trafic, chiffre d’affaires,
        positionnement) n’est fournie. La responsabilité de iNrCy est limitée au montant des sommes versées au cours
        des trois derniers mois. iNrCy ne pourra être tenue responsable des pertes indirectes, pertes d’exploitation
        ou manque à gagner.
      </p>

      <h2 className={styles.h2}>Article 15 — Suspension</h2>
      <p className={styles.p}>iNrCy peut suspendre l’accès en cas :</p>
      <ul className={styles.ul}>
        <li>de non-paiement</li>
        <li>d’utilisation abusive</li>
        <li>de violation des présentes CGA</li>
      </ul>

      <h2 className={styles.h2}>Article 16 — Rétractation</h2>
      <p className={styles.p}>
        Le Client agit à titre professionnel. Au moment de la souscription, il demande l’exécution immédiate du
        service et renonce expressément à tout droit de rétractation. Aucun remboursement n’est dû après attribution
        du site.
      </p>

      <h2 className={styles.h2}>Article 17 — Preuve</h2>
      <p className={styles.p}>Les enregistrements informatiques et systèmes de paiement font foi entre les parties.</p>

      <h2 className={styles.h2}>Article 18 — Droit applicable — Tribunal</h2>
      <p className={styles.p}>
        Les présentes CGA sont régies par le droit français. Tout litige relève du Tribunal de commerce d’Arras.
      </p>
    </section>
  );
}
