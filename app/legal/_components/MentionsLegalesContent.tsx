"use client";

import styles from "../legal.module.css";

export default function MentionsLegalesContent() {
  return (
    <section>
      <h2 className={styles.h2}>Éditeur du site et du logiciel</h2>
      <p className={styles.p}>
        Le présent site internet ainsi que le logiciel en ligne (SaaS) iNrCy sont édités par :
        <br />
        <strong>iNrCy</strong>, société par actions simplifiée (SAS) au capital de 10 000 €, immatriculée au Registre
        du Commerce et des Sociétés d’Arras sous le numéro <strong>994 652 378</strong>.
        <br />
        Siège social : 1, rue de Fouquières — 62440 Harnes — France
        <br />
        SIRET : 994 652 378 00013
        <br />
        TVA intracommunautaire : FR 78 994 652 378
      </p>

      <h2 className={styles.h2}>Contact</h2>
      <p className={styles.p}>
        Email : contact@inrcy.com
        <br />
        Téléphone : 06 22 08 21 79
      </p>

      <h2 className={styles.h2}>Directeur de la publication</h2>
      <p className={styles.p}>
        Monsieur Jimmy WRIGHT — Président de la société iNrCy
        <br />
        Contact : contact@inrcy.com
      </p>

      <h2 className={styles.h2}>Hébergement</h2>
      <p className={styles.p}>
        Les infrastructures techniques du site internet et du logiciel en ligne iNrCy sont hébergées par :
        <br />
        <strong>OVH SAS</strong> — 2, rue Kellermann — 59100 Roubaix — France
        <br />
        Téléphone : 1007
      </p>

      <h2 className={styles.h2}>Conception et exploitation</h2>
      <p className={styles.p}>
        Le site institutionnel est développé via le CMS WordPress.
        <br />
        Le logiciel en ligne iNrCy est développé, exploité et administré par la société iNrCy.
        <br />
        L’accès au logiciel iNrCy s’effectue via navigateur internet et peut également être accessible via une
        application dédiée ou interface web applicative, sans installation locale obligatoire.
      </p>

      <h2 className={styles.h2}>Propriété intellectuelle</h2>
      <p className={styles.p}>
        L’ensemble des éléments constituant le site et le logiciel en ligne iNrCy (textes, images, graphismes, logos,
        bases de données, architecture, code source, interfaces, modules, fonctionnalités, scripts, contenus SEO et
        éléments techniques) est protégé par le droit de la propriété intellectuelle.
        <br />
        Ils sont la propriété exclusive de iNrCy ou font l’objet d’une licence d’exploitation.
        <br />
        Toute reproduction, représentation, modification ou exploitation non autorisée est strictement interdite.
      </p>

      <h2 className={styles.h2}>Mise à disposition du logiciel</h2>
      <p className={styles.p}>
        L’abonnement au logiciel iNrCy confère au client : un droit d’accès, un droit d’utilisation limité, non
        exclusif, non cessible et non transférable, pendant la durée de l’abonnement.
        <br />
        Aucun droit de propriété intellectuelle n’est transféré au client.
      </p>

      <h2 className={styles.h2}>Sites internet proposés en complément</h2>
      <ul className={styles.ul}>
        <li>
          Vente de site internet : en cas de vente, le client devient propriétaire du site livré, hors composants sous
          licence et technologies propriétaires iNrCy.
        </li>
        <li>
          Location de site internet : en cas de location, les structures, développements, éléments techniques et
          dispositifs restent la propriété exclusive de iNrCy. Aucun transfert de propriété n’intervient.
        </li>
      </ul>

      <h2 className={styles.h2}>Responsabilité relative aux sites clients</h2>
      <p className={styles.p}>
        Les professionnels exploitant un site internet fourni par iNrCy (vente ou location) sont seuls responsables :
      </p>
      <ul className={styles.ul}>
        <li>des contenus publiés,</li>
        <li>de la conformité légale et réglementaire,</li>
        <li>des mentions légales et politiques de confidentialité,</li>
        <li>des données collectées auprès de leurs visiteurs.</li>
      </ul>
      <p className={styles.p}>iNrCy intervient en qualité de prestataire technique et d’hébergeur.</p>

      <h2 className={styles.h2}>Données personnelles</h2>
      <p className={styles.p}>
        iNrCy traite les données personnelles conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique
        et Libertés. Les modalités détaillées sont accessibles dans la Politique de confidentialité iNrCy.
        <br />
        Contact RGPD : contact@inrcy.com
      </p>

      <h2 className={styles.h2}>Cookies</h2>
      <p className={styles.p}>
        Le site utilise des cookies nécessaires à son fonctionnement et, sous réserve de consentement, des cookies de
        mesure d’audience ou de services tiers. Les préférences peuvent être modifiées à tout moment via le
        gestionnaire de consentement.
      </p>

      <h2 className={styles.h2}>Liens hypertextes</h2>
      <p className={styles.p}>
        Le site et le logiciel peuvent contenir des liens vers des services externes. iNrCy ne saurait être tenue
        responsable du contenu ou des pratiques de ces services.
      </p>

      <h2 className={styles.h2}>Responsabilité</h2>
      <p className={styles.p}>
        iNrCy met en œuvre tous les moyens raisonnables pour assurer l’exactitude des informations diffusées.
        L’utilisateur reconnaît utiliser le site et le logiciel sous sa responsabilité exclusive. La responsabilité de
        iNrCy ne saurait être engagée sauf en cas de faute lourde ou intentionnelle.
      </p>

      <h2 className={styles.h2}>Conditions d’utilisation</h2>
      <p className={styles.p}>L’accès au site internet et au logiciel en ligne implique l’acceptation :</p>
      <ul className={styles.ul}>
        <li>des présentes mentions légales,</li>
        <li>de la Politique de confidentialité,</li>
        <li>des Conditions Générales d’Abonnement (CGA) et/ou de Vente applicables.</li>
      </ul>

      <h2 className={styles.h2}>Droit applicable — Juridiction compétente</h2>
      <p className={styles.p}>
        Les présentes mentions légales sont soumises au droit français. Tout litige relève de la compétence exclusive
        du Tribunal de commerce d’Arras, sauf disposition légale impérative contraire.
      </p>
    </section>
  );
}
