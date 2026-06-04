"use client";

import { useEffect, useMemo, useState } from "react";
import {
  INR_AGENT_ACTIONS,
  INR_AGENT_CHANNELS,
  INR_AGENT_DAYS,
  INR_AGENT_DEFAULT_SETTINGS,
  INR_AGENT_FREQUENCIES,
  INR_AGENT_GOALS,
  INR_AGENT_LABELS,
  INR_AGENT_MODES,
  INR_AGENT_TONES,
  sanitizeInrAgentSettings,
  type InrAgentAction,
  type InrAgentChannel,
  type InrAgentFrequency,
  type InrAgentGoal,
  type InrAgentMode,
  type InrAgentSettings,
  type InrAgentTone,
} from "@/lib/inrAgentSettings";
import styles from "./InrAgentSettingsContent.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function InrAgentSettingsContent() {
  const [settings, setSettings] = useState<InrAgentSettings>(INR_AGENT_DEFAULT_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      setLoadState("loading");
      setNotice(null);

      try {
        const response = await fetch("/api/agent/settings", { method: "GET", cache: "no-store" });
        const payload = await response.json().catch(() => null) as { settings?: Partial<InrAgentSettings>; error?: string; tableMissing?: boolean } | null;

        if (!alive) return;

        if (!response.ok) {
          throw new Error(payload?.error || "Configuration iNr'Agent indisponible.");
        }

        setSettings(sanitizeInrAgentSettings(payload?.settings));
        setTableMissing(Boolean(payload?.tableMissing));
        setLoadState("ready");
      } catch (error) {
        if (!alive) return;
        setLoadState("error");
        setNotice(error instanceof Error ? error.message : "Configuration iNr'Agent indisponible.");
      }
    }

    loadSettings();

    return () => {
      alive = false;
    };
  }, []);

  const selectedDayLabel = useMemo(
    () => INR_AGENT_DAYS.find((day) => day.value === settings.dayOfWeek)?.label ?? "Lundi",
    [settings.dayOfWeek],
  );

  const summary = settings.enabled
    ? `${INR_AGENT_LABELS.frequencies[settings.frequency]} • ${selectedDayLabel} ${settings.time} • ${INR_AGENT_LABELS.modes[settings.mode]}`
    : "Agent inactif : aucune action automatique ne sera préparée.";

  function patchSettings(patch: Partial<InrAgentSettings>) {
    setSettings((current) => sanitizeInrAgentSettings({ ...current, ...patch }));
    setSaveState("idle");
    setNotice(null);
  }

  async function saveSettings() {
    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = await response.json().catch(() => null) as { settings?: Partial<InrAgentSettings>; error?: string; tableMissing?: boolean } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Enregistrement impossible.");
      }

      setSettings(sanitizeInrAgentSettings(payload?.settings));
      setTableMissing(Boolean(payload?.tableMissing));
      setSaveState("saved");
      setNotice("Configuration iNr'Agent enregistrée.");
    } catch (error) {
      setSaveState("error");
      setNotice(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  }

  return (
    <section className={styles.shell}>
      <div className={`${styles.card} ${styles.hero}`}>
        <p className={styles.eyebrow}>iNr'Agent</p>
        <h2 className={styles.title}>Configuration d’iNr'Agent</h2>
        <p className={styles.text}>
          Définissez quand l'agent prépare les actions, quels outils il peut utiliser et si le professionnel doit valider avant publication ou envoi.
        </p>

        <div className={styles.statusLine}>
          <div>
            <p className={styles.statusTitle}>{settings.enabled ? "Agent actif" : "Agent désactivé"}</p>
            <p className={styles.statusText}>{summary}</p>
          </div>
          <label className={styles.switch} title={settings.enabled ? "Désactiver l'agent" : "Activer l'agent"}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => patchSettings({ enabled: event.target.checked })}
              aria-label="Activer ou désactiver iNr'Agent"
            />
            <span className={styles.slider} aria-hidden />
          </label>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className={styles.notice}>Chargement de la configuration iNr'Agent...</div>
      ) : null}

      {tableMissing ? (
        <div className={`${styles.notice} ${styles.noticeWarning}`}>
          La table Supabase <strong>inr_agent_settings</strong> doit être créée pour enregistrer ces réglages. L’interface peut déjà être préparée, mais la sauvegarde attend la table.
        </div>
      ) : null}

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Rythme de travail</h3>
        <div className={styles.pillGrid}>
          {INR_AGENT_FREQUENCIES.map((frequency) => (
            <button
              key={frequency}
              type="button"
              className={`${styles.pillButton} ${settings.frequency === frequency ? styles.pillButtonActive : ""}`}
              onClick={() => patchSettings({ frequency: frequency as InrAgentFrequency })}
            >
              {INR_AGENT_LABELS.frequencies[frequency]}
            </button>
          ))}
        </div>

        <div className={styles.formGrid} style={{ marginTop: 12 }}>
          <label className={styles.field}>
            <span className={styles.label}>Jour de préparation</span>
            <select
              className={styles.select}
              value={settings.dayOfWeek}
              onChange={(event) => patchSettings({ dayOfWeek: Number(event.target.value) })}
            >
              {INR_AGENT_DAYS.map((day) => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Heure</span>
            <input
              className={styles.input}
              type="time"
              value={settings.time}
              onChange={(event) => patchSettings({ time: event.target.value })}
            />
          </label>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Mode de validation</h3>
        <div className={styles.pillGrid}>
          {INR_AGENT_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.pillButton} ${settings.mode === mode ? styles.pillButtonActive : ""}`}
              onClick={() => patchSettings({ mode: mode as InrAgentMode })}
            >
              {INR_AGENT_LABELS.modes[mode]}
            </button>
          ))}
        </div>
        <p className={styles.text}>
          Pour la V1, le mode recommandé reste <strong>Validation obligatoire</strong> : l’agent prépare, le pro valide.
        </p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Objectif et ton</h3>
        <div className={styles.pillGrid}>
          {INR_AGENT_GOALS.map((goal) => (
            <button
              key={goal}
              type="button"
              className={`${styles.pillButton} ${settings.goal === goal ? styles.pillButtonActive : ""}`}
              onClick={() => patchSettings({ goal: goal as InrAgentGoal })}
            >
              {INR_AGENT_LABELS.goals[goal]}
            </button>
          ))}
        </div>

        <label className={styles.field} style={{ marginTop: 12 }}>
          <span className={styles.label}>Ton de communication</span>
          <select
            className={styles.select}
            value={settings.tone}
            onChange={(event) => patchSettings({ tone: event.target.value as InrAgentTone })}
          >
            {INR_AGENT_TONES.map((tone) => (
              <option key={tone} value={tone}>{INR_AGENT_LABELS.tones[tone]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Actions autorisées</h3>
        <div className={styles.checkGrid}>
          {INR_AGENT_ACTIONS.map((action) => (
            <label
              key={action}
              className={`${styles.checkLabel} ${settings.allowedActions.includes(action) ? styles.checkLabelActive : ""}`}
            >
              <input
                type="checkbox"
                checked={settings.allowedActions.includes(action)}
                onChange={() => patchSettings({ allowedActions: toggleValue(settings.allowedActions, action as InrAgentAction) })}
              />
              {INR_AGENT_LABELS.actions[action]}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Canaux autorisés</h3>
        <div className={styles.checkGrid}>
          {INR_AGENT_CHANNELS.map((channel) => (
            <label
              key={channel}
              className={`${styles.checkLabel} ${settings.allowedChannels.includes(channel) ? styles.checkLabelActive : ""}`}
            >
              <input
                type="checkbox"
                checked={settings.allowedChannels.includes(channel)}
                onChange={() => patchSettings({ allowedChannels: toggleValue(settings.allowedChannels, channel as InrAgentChannel) })}
              />
              {INR_AGENT_LABELS.channels[channel]}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Médias</h3>
        <div className={styles.checkGrid}>
          <label className={`${styles.checkLabel} ${settings.useMediaLibrary ? styles.checkLabelActive : ""}`}>
            <input
              type="checkbox"
              checked={settings.useMediaLibrary}
              onChange={(event) => patchSettings({ useMediaLibrary: event.target.checked })}
            />
            Utiliser la médiathèque du pro
          </label>
          <label className={`${styles.checkLabel} ${settings.allowAiImages ? styles.checkLabelActive : ""}`}>
            <input
              type="checkbox"
              checked={settings.allowAiImages}
              onChange={(event) => patchSettings({ allowAiImages: event.target.checked })}
            />
            Autoriser les images IA
          </label>
        </div>
      </div>

      {notice ? (
        <div className={`${styles.notice} ${saveState === "saved" ? styles.noticeSuccess : saveState === "error" || loadState === "error" ? styles.noticeError : ""}`}>
          {notice}
        </div>
      ) : null}

      <div className={styles.footerActions}>
        <button className={styles.secondaryButton} type="button" onClick={() => patchSettings(INR_AGENT_DEFAULT_SETTINGS)}>
          Réinitialiser
        </button>
        <button className={styles.primaryButton} type="button" onClick={saveSettings} disabled={saveState === "saving" || loadState === "loading"}>
          {saveState === "saving" ? "Enregistrement..." : "Enregistrer la configuration"}
        </button>
      </div>
    </section>
  );
}
