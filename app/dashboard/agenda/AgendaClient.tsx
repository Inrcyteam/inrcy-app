
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type EventItem = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
};

export default function AgendaClient() {
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    const r = await fetch("/api/calendar/status");
    if (!r.ok) {
      setConnected(false);
      return;
    }
    const j = await r.json().catch(() => ({}));
    setConnected(Boolean(j.connected));
  }

  async function loadEvents() {
    setLoading(true);
    setError(null);
    const r = await fetch("/api/calendar/events?days=14");
    const j = await r.json().catch(() => ({}));
    setLoading(false);

    if (!r.ok || !j.ok) {
      setError(j?.error ?? "Impossible de charger l’agenda");
      return;
    }
    setEvents(Array.isArray(j.events) ? j.events : []);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (connected) loadEvents();
  }, [connected]);

  const connectGoogle = () => {
    window.location.href = "/api/integrations/google-calendar/start";
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Agenda</h1>
        <button onClick={() => router.push("/dashboard")} style={{ padding: "10px 12px" }}>
          Retour dashboard
        </button>
      </div>

      {connected === false && (
        <div style={{ marginTop: 16 }}>
          <p>Ton Google Agenda n’est pas encore connecté.</p>
          <button onClick={connectGoogle} style={{ padding: "10px 12px" }}>
            Connecter Google Agenda
          </button>
        </div>
      )}

      {connected && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Prochains RDV (14 jours)</h2>
            <button onClick={loadEvents} disabled={loading} style={{ padding: "10px 12px" }}>
              {loading ? "Chargement..." : "Rafraîchir"}
            </button>
          </div>

          {error && <p style={{ marginTop: 12 }}>{error}</p>}

          {!loading && events.length === 0 && <p style={{ marginTop: 12 }}>Aucun événement à venir.</p>}

          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {events.map((e) => (
              <li key={e.id} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700 }}>{e.summary}</div>
                <div style={{ opacity: 0.8 }}>
                  {e.start ? new Date(e.start).toLocaleString() : "?"}
                  {e.location ? ` — ${e.location}` : ""}
                  {e.htmlLink ? (
                    <>
                      {" "}
                      —{" "}
                      <a href={e.htmlLink} target="_blank" rel="noreferrer">
                        ouvrir dans Google
                      </a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
