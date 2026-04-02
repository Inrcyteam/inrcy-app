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
      setError(getSimpleFrenchErrorMessage(e, "Impossible d’enregistrer les préférences de notification."));
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
          Votre cloche vous aide à ne rien rater. iNrCy regroupe les rappels pour éviter de vous déranger trop souvent, avec en général <b>une vague toutes les 48 h</b>. Vous pouvez aussi recevoir le même résumé par email.
        </div>
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", fontSize: 12, color: "rgba(255,255,255,0.88)" }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "rgba(34,197,94,0.95)" }} />
          Rythme actuel : toutes les {prefs.digest_every_hours} h
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8, color: "rgba(255,255,255,0.8)", fontSize: 13, lineHeight: 1.6 }}>
          <div>• <b>Performance</b> : demandes reçues, potentiel à relancer, résultats à suivre.</div>
          <div>• <b>Action</b> : actions simples à faire maintenant pour avancer.</div>
          <div>• <b>Information</b> : rappels utiles et conseils pour garder votre iNrCy bien réglé.</div>
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
        subtitle="Recevez aussi le résumé iNrCy par email. Désactivez-le ici si vous préférez garder seulement la cloche dans l’application."
        checked={prefs.email_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, email_enabled: checked })}
        accent="rgba(167,139,250,0.12)"
      />

      <ToggleRow
        title="Performance"
        subtitle="Résumé des demandes reçues, des contacts à relancer et du potentiel à transformer en chiffre d’affaires."
        checked={prefs.performance_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, performance_enabled: checked })}
        accent="rgba(56,189,248,0.12)"
      />
      <ToggleRow
        title="Action"
        subtitle="Les prochaines actions utiles à faire : connecter un canal, lancer un booster ou finaliser ce qui est prêt."
        checked={prefs.action_enabled}
        onChange={(checked) => updatePrefs({ ...prefs, action_enabled: checked })}
        accent="rgba(244,114,182,0.12)"
      />
      <ToggleRow
        title="Information"
        subtitle="Des rappels simples pour suivre votre cockpit et garder iNrCy actif sans vous surcharger."
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
