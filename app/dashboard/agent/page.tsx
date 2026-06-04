import Link from "next/link";

export default function InrAgentPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "32px", background: "linear-gradient(135deg, #f8fbff 0%, #eef2ff 48%, #f8fafc 100%)", color: "#111827" }}>
      <section style={{ maxWidth: 960, margin: "0 auto", borderRadius: 28, padding: "32px", background: "rgba(255,255,255,0.88)", boxShadow: "0 24px 70px rgba(15,23,42,0.12)", border: "1px solid rgba(148,163,184,0.2)" }}>
        <p style={{ margin: 0, color: "#7c3aed", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>iNr'Agent</p>
        <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1 }}>Vos actions iNrCy à valider</h1>
        <p style={{ margin: 0, maxWidth: 720, color: "#475569", fontSize: 18, lineHeight: 1.7 }}>
          Cette page accueillera les actions préparées par l'agent : publications, campagnes mails, demandes d'avis et actions de fidélisation à valider.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 28 }}>
          {[
            ["À valider", "Publications et campagnes préparées"],
            ["Programmées", "Actions prévues automatiquement"],
            ["Historique", "Actions validées, refusées ou envoyées"],
          ].map(([title, body]) => (
            <article key={title} style={{ borderRadius: 22, padding: 20, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{title}</h2>
              <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>{body}</p>
            </article>
          ))}
        </div>
        <Link href="/dashboard" style={{ display: "inline-flex", marginTop: 28, color: "#4f46e5", fontWeight: 800, textDecoration: "none" }}>← Retour dashboard</Link>
      </section>
    </main>
  );
}
