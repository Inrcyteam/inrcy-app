"use client";

import React from "react";

type Item = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export default function GmailInboxPreview() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [email, setEmail] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/inbox/gmail/list");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erreur lors du chargement Gmail");
      }

      setEmail(data?.account?.email ?? null);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>iNr’Box — Gmail</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
            {email ? `Connecté : ${email}` : "Aucune boîte Gmail connectée"}
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.92)",
            padding: "8px 10px",
            cursor: "pointer",
          }}
        >
          Rafraîchir
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Chargement…</div>}

        {!loading && error && (
          <div style={{ fontSize: 13, color: "#fbbf24" }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            Aucun mail à afficher.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((m) => (
              <div
                key={m.id}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.18)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <b style={{ color: "rgba(255,255,255,0.92)" }}>{m.subject || "(Sans objet)"}</b>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
                    {m.date}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                  {m.from}
                </div>

                <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.70)" }}>
                  {m.snippet}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
