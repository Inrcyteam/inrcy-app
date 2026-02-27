export const metadata = {
  title: "Politique de confidentialité — iNrCy",
};

export default function ConfidentialitePage() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 18px", lineHeight: 1.6 }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Politique de confidentialité</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Document à compléter. Vous pourrez remplacer ce contenu par votre politique de confidentialité.
      </p>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18 }}>1. Données collectées</h2>
        <p>
          Exemple : identité (nom/prénom), email, téléphone, informations professionnelles, données de navigation, etc.
        </p>

        <h2 style={{ fontSize: 18 }}>2. Finalités</h2>
        <p>Exemple : création de compte, fourniture du service, support, facturation, amélioration produit.</p>

        <h2 style={{ fontSize: 18 }}>3. Conservation</h2>
        <p>Exemple : durée de conservation selon la finalité (compte actif, obligations légales, etc.).</p>

        <h2 style={{ fontSize: 18 }}>4. Droits</h2>
        <p>Exemple : accès, rectification, suppression, opposition, portabilité, etc.</p>

        <h2 style={{ fontSize: 18 }}>5. Contact</h2>
        <p>Exemple : contact@inrcy.com</p>
      </section>
    </main>
  );
}
