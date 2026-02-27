export const metadata = {
  title: "Mentions légales — iNrCy",
};

export default function MentionsLegalesPage() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 18px", lineHeight: 1.6 }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Mentions légales</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>Document à compléter.</p>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18 }}>Éditeur du site</h2>
        <p>
          Raison sociale : [À compléter]
          <br />
          Adresse : [À compléter]
          <br />
          Email : [À compléter]
        </p>

        <h2 style={{ fontSize: 18 }}>Hébergement</h2>
        <p>Hébergeur : [À compléter]</p>

        <h2 style={{ fontSize: 18 }}>Propriété intellectuelle</h2>
        <p>Contenu à compléter.</p>

        <h2 style={{ fontSize: 18 }}>Responsabilité</h2>
        <p>Contenu à compléter.</p>
      </section>
    </main>
  );
}
