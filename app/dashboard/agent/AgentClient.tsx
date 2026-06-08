"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HelpButton from "../_components/HelpButton";
import styles from "./agent.module.css";

type AutomationKey = "publish" | "grow" | "loyalty" | "stats";

type ChannelKey = "gmb" | "facebook" | "instagram" | "linkedin" | "mails";

type Automation = {
  key: AutomationKey;
  title: string;
  iconLabel: string;
  settingsTitle: string;
  availableThemes: string[];
  availableChannels: ChannelKey[];
};

type AutomationConfig = {
  enabled: boolean;
  frequency: string;
  day: string;
  time: string;
  channels: ChannelKey[];
  themes: string[];
  validation: string;
  source: string;
};

const ROBOT_SRC = "/agent/inr-agent-robot-cutout.png";
const channelOptions: Record<ChannelKey, { name: string; src: string }> = {
  gmb: { name: "Google Business", src: "/icons/google.jpg" },
  facebook: { name: "Facebook", src: "/icons/facebook.png" },
  instagram: { name: "Instagram", src: "/icons/instagram.jpg" },
  linkedin: { name: "LinkedIn", src: "/icons/linkedin.png" },
  mails: { name: "Mails", src: "/icons/mails-inrcy-dashboard-v2.png" },
};

const automations: Automation[] = [
  {
    key: "publish",
    title: "Publier régulièrement",
    iconLabel: "Visibilité",
    settingsTitle: "Réglages — Publier régulièrement",
    availableThemes: ["Conseils", "Réalisations", "Offres", "Actualités"],
    availableChannels: ["gmb", "facebook", "instagram", "linkedin"],
  },
  {
    key: "grow",
    title: "Développer l’activité",
    iconLabel: "Acquisition",
    settingsTitle: "Réglages — Développer l’activité",
    availableThemes: ["Offres", "Demandes", "Avis", "Prestations"],
    availableChannels: ["mails", "gmb", "facebook", "instagram"],
  },
  {
    key: "loyalty",
    title: "Fidéliser les contacts",
    iconLabel: "Relation",
    settingsTitle: "Réglages — Fidéliser les contacts",
    availableThemes: ["Informer", "Suivre", "Enquêter", "Conseiller"],
    availableChannels: ["mails"],
  },
  {
    key: "stats",
    title: "Analyser mes statistiques",
    iconLabel: "Pilotage",
    settingsTitle: "Réglages — Analyser mes statistiques",
    availableThemes: ["Bilan", "Opportunités", "Canaux", "Recommandations"],
    availableChannels: [],
  },
];

const defaultConfigs: Record<AutomationKey, AutomationConfig> = {
  publish: {
    enabled: true,
    frequency: "1 fois par semaine",
    day: "Lundi",
    time: "09:00",
    channels: ["gmb", "facebook", "instagram", "linkedin"],
    themes: ["Conseils", "Réalisations", "Offres"],
    validation: "Obligatoire avant publication",
    source: "Contenus déjà publiés",
  },
  grow: {
    enabled: false,
    frequency: "2 fois par mois",
    day: "Mercredi",
    time: "10:00",
    channels: ["mails", "gmb", "facebook"],
    themes: ["Offres", "Demandes", "Avis"],
    validation: "Obligatoire avant envoi",
    source: "Publications + historique Propulser",
  },
  loyalty: {
    enabled: false,
    frequency: "1 fois par mois",
    day: "Vendredi",
    time: "09:30",
    channels: ["mails"],
    themes: ["Informer", "Suivre", "Conseiller"],
    validation: "Obligatoire avant envoi",
    source: "Publications + historique Fidéliser",
  },
  stats: {
    enabled: false,
    frequency: "Chaque semaine",
    day: "Lundi",
    time: "08:30",
    channels: [],
    themes: ["Bilan", "Opportunités", "Recommandations"],
    validation: "Lecture avant action",
    source: "iNrStats",
  },
};

function AutomationIcon({ type }: { type: AutomationKey }) {
  if (type === "publish") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M16 36h-4a6 6 0 0 1 0-12h4" />
        <path d="M18 24 44 14v36L18 40V24Z" />
        <path d="M25 42v7a5 5 0 0 0 5 5h3" />
        <path d="M49 24c3 3 3 13 0 16" />
      </svg>
    );
  }

  if (type === "grow") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M34 37 23 26c6-11 16-17 30-16-1 14-7 24-19 27Z" />
        <path d="M25 35 14 46" />
        <path d="M21 43 15 49" />
        <path d="M37 16l11 11" />
        <path d="M20 28H10l9-9" />
        <path d="M36 44v10l9-9" />
      </svg>
    );
  }

  if (type === "loyalty") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 51S13 39 13 24c0-7 5-12 12-12 4 0 7 2 9 5 2-3 5-5 9-5 7 0 12 5 12 12 0 15-23 27-23 27Z" />
        <path d="M21 37h9l4-8 5 12 4-7h8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path d="M14 50V34h9v16h-9Z" />
      <path d="M28 50V22h9v28h-9Z" />
      <path d="M42 50V12h9v38h-9Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
      <path d="M19.4 14.4c.1-.8.1-1.2.1-2.4s0-1.6-.1-2.4l-2.3-.6c-.3-.7-.5-1.1-.9-1.6l.9-2.2c-.6-.5-1.3-.9-2.1-1.2l-1.6 1.7c-.7-.1-1.1-.1-1.8 0L10 4c-.8.3-1.5.7-2.1 1.2l.9 2.2c-.4.5-.6.9-.9 1.6l-2.3.6c-.1.8-.1 1.2-.1 2.4s0 1.6.1 2.4l2.3.6c.3.7.5 1.1.9 1.6l-.9 2.2c.6.5 1.3.9 2.1 1.2l1.6-1.7c.7.1 1.1.1 1.8 0L15 20c.8-.3 1.5-.7 2.1-1.2l-.9-2.2c.4-.5.6-.9.9-1.6l2.3-.6Z" />
    </svg>
  );
}

function ImageMetaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="m7 16 4-4 3 3 2-2 3 3" />
      <path d="M8.5 9.5h.1" />
    </svg>
  );
}

function ContentMetaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 5h12v14H6V5Z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </svg>
  );
}

function CalendarMetaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="M9 14h.1" />
      <path d="M13 14h.1" />
    </svg>
  );
}

function toggleItem<T extends string>(items: T[], item: T) {
  return items.includes(item) ? items.filter((current) => current !== item) : [...items, item];
}

export default function AgentClient() {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<AutomationKey>("publish");
  const [settingsKey, setSettingsKey] = useState<AutomationKey | null>(null);
  const [configs, setConfigs] = useState<Record<AutomationKey, AutomationConfig>>(defaultConfigs);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => automations.find((automation) => automation.key === selectedKey) ?? automations[0],
    [selectedKey],
  );

  const settingsAutomation = useMemo(
    () => automations.find((automation) => automation.key === settingsKey) ?? null,
    [settingsKey],
  );

  const selectedConfig = configs[selected.key];
  const settingsConfig = settingsKey ? configs[settingsKey] : null;
  const hasPreparedAction = false;

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2600);
  }

  function updateConfig(key: AutomationKey, patch: Partial<AutomationConfig>) {
    setConfigs((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  return (
    <main className={styles.agentPage}>
      <section className={styles.agentCanvas} aria-label="iNrAgent - automatisations">
        <header className={styles.moduleHeader}>
          <div className={styles.moduleTitleBlock}>
            <img
              className={styles.moduleLogo}
              src="/icons/inr-agent-header.png"
              alt="iNr’Agent"
              width={68}
              height={68}
              loading="eager"
              decoding="sync"
            />
            <div className={styles.moduleTitleText}>
              <h1>iNr’Agent</h1>
              <p>Programmateur d’automatisations connecté à vos outils.</p>
            </div>
          </div>

          <div className={styles.moduleHeaderActions}>
            <HelpButton onClick={() => showNotice("iNr’Agent prépare vos actions, vous validez avant exécution.")} title="Aide iNr’Agent" />
            <button
              type="button"
              className={styles.headerSettingsButton}
              onClick={() => setSettingsKey(selectedKey)}
            >
              Réglages de iNr’Agent
            </button>
            <button type="button" className={styles.headerCloseButton} onClick={() => router.push("/dashboard")}>
              Fermer
            </button>
          </div>
        </header>

        <nav className={styles.automationGrid} aria-label="Automatisations iNrAgent">
          {automations.map((automation) => {
            const selectedCard = automation.key === selectedKey;
            const active = configs[automation.key].enabled;

            return (
              <article
                key={automation.key}
                className={`${styles.automationCard} ${selectedCard ? styles.automationCardActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.automationSelect}
                  onClick={() => setSelectedKey(automation.key)}
                  aria-pressed={selectedCard}
                >
                  <span className={styles.cardIcon} aria-hidden><AutomationIcon type={automation.key} /></span>
                  <span className={styles.cardTitle}>{automation.title}</span>
                  {active && <span className={styles.cardStatus} aria-label="Automatisation activée" />}
                </button>
                <button
                  type="button"
                  className={styles.settingsButton}
                  onClick={() => setSettingsKey(automation.key)}
                  aria-label={`Ouvrir les réglages — ${automation.title}`}
                >
                  <SettingsIcon />
                </button>
              </article>
            );
          })}
        </nav>

        <div className={styles.mainGrid}>
          <aside className={styles.robotCard} aria-label="Fonctionnement iNrAgent">
            <div className={styles.robotHalo} aria-hidden>
              <span className={styles.starOne} />
              <span className={styles.starTwo} />
              <span className={styles.starThree} />
              <img src={ROBOT_SRC} alt="" />
            </div>

            <ol className={styles.robotSteps}>
              <li><span>1</span><strong>J’analyse vos contenus publiés</strong></li>
              <li><span>2</span><strong>Je prépare la prochaine action</strong></li>
              <li><span>3</span><strong>Vous validez avant exécution</strong></li>
            </ol>
          </aside>

          <section className={styles.previewCard} aria-label="Aperçu de la prochaine publication">
            <h2>Aperçu de la prochaine publication</h2>

            <div className={styles.previewBody}>
              {hasPreparedAction ? (
                <>
                  <div className={styles.previewImageWrap}>
                    <img src="/agent/terrasse-preview.png" alt="Aperçu du visuel préparé" />
                  </div>
                  <div className={styles.previewText}>
                    <h3>3 conseils pour entretenir votre terrasse en bois 🌿</h3>
                    <p>Un entretien régulier prolonge la beauté et la durabilité de votre terrasse.</p>
                    <p>Découvrez nos conseils simples et efficaces.</p>
                  </div>
                </>
              ) : (
                <div className={styles.emptyPreview}>
                  <span className={styles.emptyOrb} aria-hidden>
                    <AutomationIcon type={selected.key} />
                  </span>
                  <h3>Aucune action préparée</h3>
                  <p>
                    Quand iNrAgent aura préparé la prochaine action, son image, son contenu, ses canaux et sa date apparaîtront ici.
                  </p>
                  <small>Automatisation sélectionnée : {selected.title}</small>
                </div>
              )}
            </div>

            <div className={styles.previewMeta}>
              <div className={styles.metaItem}>
                <span className={styles.metaIcon} aria-hidden><ImageMetaIcon /></span>
                <span>
                  <small>Image</small>
                  <strong>{hasPreparedAction ? "Prête" : "—"}</strong>
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaIcon} aria-hidden><ContentMetaIcon /></span>
                <span>
                  <small>Contenu</small>
                  <strong>{hasPreparedAction ? "Prêt" : "—"}</strong>
                </span>
              </div>
              <div className={`${styles.metaItem} ${styles.channelsItem}`}>
                <small>Canaux</small>
                <div className={styles.channelIcons}>
                  {selectedConfig.channels.length > 0 ? (
                    selectedConfig.channels.map((channelKey) => {
                      const channel = channelOptions[channelKey];
                      return <img key={channelKey} src={channel.src} alt={channel.name} title={channel.name} />;
                    })
                  ) : (
                    <strong>—</strong>
                  )}
                </div>
              </div>
              <div className={`${styles.metaItem} ${styles.dateItem}`}>
                <span className={styles.metaIcon} aria-hidden><CalendarMetaIcon /></span>
                <span>
                  <small>Date programmée</small>
                  <strong>{hasPreparedAction ? `${selectedConfig.day} ${selectedConfig.time}` : "—"}</strong>
                </span>
              </div>
            </div>
          </section>
        </div>

        <footer className={styles.actionBar}>
          <button
            type="button"
            className={styles.validateButton}
            disabled={!hasPreparedAction}
            onClick={() => showNotice("Action validée. iNrAgent préparera l’exécution.")}
          >
            <span aria-hidden>✓</span>
            Valider
          </button>
          <button
            type="button"
            className={styles.refuseButton}
            disabled={!hasPreparedAction}
            onClick={() => showNotice("Action refusée. Rien ne sera exécuté.")}
          >
            <span aria-hidden>×</span>
            Refuser
          </button>
        </footer>
      </section>

      {settingsAutomation && settingsConfig && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setSettingsKey(null)}>
          <section
            className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-label={settingsAutomation.settingsTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className={styles.modalClose} onClick={() => setSettingsKey(null)} aria-label="Fermer">×</button>
            <p className={styles.modalEyebrow}>Automatisation</p>
            <h2>{settingsAutomation.settingsTitle}</h2>

            <label className={styles.switchLine}>
              <span>
                <strong>Statut</strong>
                <small>{settingsConfig.enabled ? "Le robot peut préparer cette action." : "Cette automatisation est en pause."}</small>
              </span>
              <input
                type="checkbox"
                checked={settingsConfig.enabled}
                onChange={(event) => updateConfig(settingsAutomation.key, { enabled: event.target.checked })}
              />
            </label>

            <div className={styles.modalGrid}>
              <label>
                <span>Fréquence</span>
                <select
                  value={settingsConfig.frequency}
                  onChange={(event) => updateConfig(settingsAutomation.key, { frequency: event.target.value })}
                >
                  <option>1 fois par semaine</option>
                  <option>2 fois par mois</option>
                  <option>1 fois par mois</option>
                  <option>Chaque semaine</option>
                </select>
              </label>
              <label>
                <span>Jour</span>
                <select
                  value={settingsConfig.day}
                  onChange={(event) => updateConfig(settingsAutomation.key, { day: event.target.value })}
                >
                  <option>Lundi</option>
                  <option>Mardi</option>
                  <option>Mercredi</option>
                  <option>Jeudi</option>
                  <option>Vendredi</option>
                </select>
              </label>
              <label>
                <span>Heure</span>
                <input
                  type="time"
                  value={settingsConfig.time}
                  onChange={(event) => updateConfig(settingsAutomation.key, { time: event.target.value })}
                />
              </label>
              <label>
                <span>Validation</span>
                <input value={settingsConfig.validation} readOnly />
              </label>
            </div>

            {settingsAutomation.availableChannels.length > 0 && (
              <div className={styles.modalSection}>
                <span>Canaux</span>
                <div className={styles.choiceGrid}>
                  {settingsAutomation.availableChannels.map((channelKey) => {
                    const channel = channelOptions[channelKey];
                    const checked = settingsConfig.channels.includes(channelKey);
                    return (
                      <button
                        type="button"
                        key={channelKey}
                        className={checked ? styles.choiceActive : ""}
                        onClick={() => updateConfig(settingsAutomation.key, { channels: toggleItem(settingsConfig.channels, channelKey) })}
                      >
                        <img src={channel.src} alt="" />
                        {channel.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.modalSection}>
              <span>Thèmes</span>
              <div className={styles.choiceGrid}>
                {settingsAutomation.availableThemes.map((theme) => {
                  const checked = settingsConfig.themes.includes(theme);
                  return (
                    <button
                      type="button"
                      key={theme}
                      className={checked ? styles.choiceActive : ""}
                      onClick={() => updateConfig(settingsAutomation.key, { themes: toggleItem(settingsConfig.themes, theme) })}
                    >
                      {theme}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className={styles.modalNote}>Source des idées : {settingsConfig.source}</p>
            <button type="button" className={styles.modalAction} onClick={() => setSettingsKey(null)}>Enregistrer les réglages</button>
          </section>
        </div>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}
    </main>
  );
}
