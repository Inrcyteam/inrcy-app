"use client";

import React from "react";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { getSimpleFrenchApiError } from "@/lib/userFacingErrors";

type Preferences = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  performance_enabled: boolean;
  action_enabled: boolean;
  information_enabled: boolean;
  digest_every_hours: number;
  updated_at?: string;
};

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
  padding: 14,
};

function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
  accent,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  accent: string;
}) {
  return (
    <label
      style={{
        ...CARD_STYLE,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 14,
        alignItems: "center",
        background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.04))`,
      }}
    >
      <div>
        <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.95)", fontSize: 15 }}>{title}</div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.55 }}>{subtitle}</div>
      </div>

      <span
        style={{
          position: "relative",
          width: 56,
          height: 32,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: checked ? "rgba(56,189,248,0.28)" : "rgba(255,255,255,0.08)",
          boxShadow: checked ? "0 0 22px rgba(56,189,248,0.28)" : "none",
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          transition: "all .2s ease",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        />
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: "white",
            transform: checked ? "translateX(27px)" : "translateX(4px)",
            transition: "transform .2s ease",
            boxShadow: "0 8px 20px rgba(0,0,0,0.26)",
          }}
        />
      </span>
    </label>
  );
}

export default function NotificationsSettingsContent() {
  const [prefs, setPrefs] = React.useState<Preferences | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/notifications/preferences", { credentials: "include" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
        if (!alive) return;
        setPrefs(json.preferences);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(getSimpleFrenchErrorMessage(e, "Impossible de charger les notifications."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const updatePrefs = async (next: Preferences) => {
    setPrefs(next);
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(await getSimpleFrenchApiError(res));
      setPrefs(json.preferences);
      setNotice("Préférences enregistrées.");
      setError(null);
    } catch (e: any) {
      setError(getSimpleFrenchErrorMessage(e, "Sauvegarde impossible."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return <div style={{ color: "rgba(255,255,255,0.74)" }}>Chargement des notifications…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CARD_STYLE, background: "linear-gradient(90deg, rgba(56,189,248,0.16), rgba(167,139,250,0.12), rgba(244,114,182,0.10))" }}>
        <div style={{ fontSize: 16, fontWeight: 950, color: "rgba(255,255,255,0.95)" }}>Notifications iNrCy</div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.72)", fontSize: 13, lineHeight: 1.6 }}>
          Votre cloche vous pousse les bonnes actions au bon moment. Nous regroupons les relances par catégorie et nous limitons le rythme à <b>une vague toutes les 48 h</b> pour garder un cockpit vivant sans vous saturer. Les mêmes signaux utiles vous sont aussi envoyés par email dans un format digest iNrCy, dès qu'une nouvelle vague est générée.
        </div>
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", fontSize: 12, color: "rgba(255,255,255,0.88)" }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "rgba(34,197,94,0.95)" }} />
          Rythme actuel : toutes les {prefs.digest_every_hours} h
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8, color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.6 }}>
          <div>• <b>Performance</b> : traction, demandes générées, opportunités activables.</div>
          <div>• <b>Action</b> : canaux à brancher, boosters à lancer, dernier pas à faire.</div>
          <div>• <b>Information</b> : état du cockpit, conseils de progression, rappels utiles.</div>
        </div>
      </div>

      <ToggleRow
        title="Cloche dans l’application"
        subtitle="Affiche vos relances et actions à mener dans le cockpit iNrCy, via la cloche visible en haut du dashboard."
        checked={prefs.in_app_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, in_app_enabled: checked })}
        accent="rgba(56,189,248,0.12)"
      />
      <ToggleRow
        title="Email digest iNrCy"
        subtitle="Reçoit un beau résumé iNrCy par email lorsqu’une nouvelle vague utile est générée. Désactivez-le ici si vous ne voulez garder que la cloche."
        checked={prefs.email_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, email_enabled: checked })}
        accent="rgba(167,139,250,0.12)"
      />

      <ToggleRow
        title="Performance"
        subtitle="+X opportunités activables, demandes générées cette semaine, signaux de traction à transformer en business."
        checked={prefs.performance_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, performance_enabled: checked })}
        accent="rgba(56,189,248,0.12)"
      />
      <ToggleRow
        title="Action"
        subtitle="Connecter un canal, lancer un booster, rouvrir un levier prêt à produire. Les notifications les plus orientées passage à l’action."
        checked={prefs.action_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, action_enabled: checked })}
        accent="rgba(244,114,182,0.12)"
      />
      <ToggleRow
        title="Information"
        subtitle="État de votre cockpit, rappels doux, points de passage utiles pour garder iNrCy en mouvement sans vous noyer."
        checked={prefs.information_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, information_enabled: checked })}
        accent="rgba(251,146,60,0.12)"
      />

      {(saving || notice || error) && (
        <div style={{ ...CARD_STYLE, color: error ? "#fca5a5" : "rgba(255,255,255,0.88)", fontSize: 13 }}>
          {saving ? "Enregistrement…" : error || notice}
        </div>
      )}
    </div>
  );
}
