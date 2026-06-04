export default function InrAgentSettingsContent() {
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ border: "1px solid rgba(148, 163, 184, 0.24)", borderRadius: 22, padding: 22, background: "rgba(255,255,255,0.72)" }}>
        <p style={{ margin: "0 0 8px", color: "#7c3aed", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>iNr'Agent</p>
        <h2 style={{ margin: "0 0 10px", fontSize: 22 }}>Configuration d’iNr'Agent</h2>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
          Ici viendront les réglages de fréquence, objectifs, canaux autorisés, mode brouillon, validation ou automatique.
        </p>
      </div>
    </section>
  );
}
