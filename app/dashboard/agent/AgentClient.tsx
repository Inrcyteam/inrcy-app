"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INR_AGENT_ACTION_ICONS,
  INR_AGENT_ACTION_LABELS,
  INR_AGENT_STATUS_LABELS,
  INR_AGENT_TOOL_LABELS,
  summarizeInrAgentActions,
  type InrAgentAction,
  type InrAgentActionStats,
  type InrAgentActionStatus,
} from "@/lib/inrAgentActions";
import {
  INR_AGENT_DEFAULT_SETTINGS,
  INR_AGENT_DAYS,
  INR_AGENT_LABELS,
  sanitizeInrAgentSettings,
  type InrAgentChannel,
  type InrAgentSettings,
} from "@/lib/inrAgentSettings";
import styles from "./agent.module.css";

const previewTemplates = [
  {
    icon: "📢",
    title: "Publication multicanale",
    type: "Booster",
    meta: "Aperçu prêt pour Facebook, Instagram, Google Business et Site iNrCy.",
    state: "Prêt pour le moteur",
  },
  {
    icon: "📧",
    title: "Campagne mailing",
    type: "Mails",
    meta: "Objet, message, destinataires CRM et pièces jointes regroupés avant validation.",
    state: "Prêt pour le moteur",
  },
  {
    icon: "⭐",
    title: "Demande d’avis",
    type: "Propulser",
    meta: "Campagne Récolter préparée pour les clients récents.",
    state: "Prêt pour le moteur",
  },
];

const defaultTimeline = [
  ["Aujourd’hui", "Interface prête pour centraliser les actions préparées par iNr'Agent."],
  ["Prochaine orbite", "Connexion aux brouillons Booster, Propulser, Fidéliser et Mails."],
  ["Objectif V1", "Faire valider, modifier ou refuser chaque action avant publication."],
];

const orbitNodes = ["Booster", "Mails", "Propulser", "Fidéliser"];

type LoadState = "loading" | "ready" | "error";

type ActionsPayload = {
  actions?: InrAgentAction[];
  stats?: InrAgentActionStats;
  tableMissing?: boolean;
  error?: string;
};

type SettingsPayload = {
  settings?: Partial<InrAgentSettings>;
  tableMissing?: boolean;
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Date non définie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non définie";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function channelLabel(channel: string): string {
  return INR_AGENT_LABELS.channels[channel as InrAgentChannel] || channel;
}

function actionSummary(action: InrAgentAction): string {
  if (action.previewText) return action.previewText;
  if (action.summary) return action.summary;
  return "Action préparée par iNr'Agent.";
}

export default function AgentClient() {
  const [actions, setActions] = useState<InrAgentAction[]>([]);
  const [settings, setSettings] = useState<InrAgentSettings>(INR_AGENT_DEFAULT_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionsTableMissing, setActionsTableMissing] = useState(false);
  const [settingsTableMissing, setSettingsTableMissing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setNotice(null);

    try {
      const [actionsResponse, settingsResponse] = await Promise.all([
        fetch("/api/agent/actions", { method: "GET", cache: "no-store" }),
        fetch("/api/agent/settings", { method: "GET", cache: "no-store" }),
      ]);

      const actionsPayload = await actionsResponse.json().catch(() => null) as ActionsPayload | null;
      const settingsPayload = await settingsResponse.json().catch(() => null) as SettingsPayload | null;

      if (!actionsResponse.ok) {
        throw new Error(actionsPayload?.error || "Actions iNr'Agent indisponibles.");
      }
      if (!settingsResponse.ok) {
        throw new Error(settingsPayload?.error || "Configuration iNr'Agent indisponible.");
      }

      setActions(Array.isArray(actionsPayload?.actions) ? actionsPayload.actions : []);
      setSettings(sanitizeInrAgentSettings(settingsPayload?.settings));
      setActionsTableMissing(Boolean(actionsPayload?.tableMissing));
      setSettingsTableMissing(Boolean(settingsPayload?.tableMissing));
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setNotice(error instanceof Error ? error.message : "Chargement iNr'Agent impossible.");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => summarizeInrAgentActions(actions), [actions]);
  const pendingActions = useMemo(() => actions.filter((action) => action.status === "pending" || action.status === "draft"), [actions]);
  const historyActions = useMemo(() => actions.filter((action) => !["pending", "draft"].includes(action.status)).slice(0, 6), [actions]);
  const selectedDayLabel = INR_AGENT_DAYS.find((day) => day.value === settings.dayOfWeek)?.label ?? "Lundi";
  const quickSettings = [
    ["Statut", settings.enabled ? "Agent actif" : "Agent désactivé"],
    ["Rythme", `${INR_AGENT_LABELS.frequencies[settings.frequency]} • ${selectedDayLabel} ${settings.time}`],
    ["Mode", INR_AGENT_LABELS.modes[settings.mode]],
    ["Objectif", INR_AGENT_LABELS.goals[settings.goal]],
  ];

  const statusLabel = settings.enabled ? "Agent configuré" : "Agent prêt à configurer";
  const tableNotice = actionsTableMissing || settingsTableMissing
    ? "Les tables Supabase iNr'Agent doivent être créées pour activer les données dynamiques."
    : null;

  async function updateActionStatus(actionId: string, status: InrAgentActionStatus) {
    setProcessingId(actionId);
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, status }),
      });
      const payload = await response.json().catch(() => null) as { action?: InrAgentAction; error?: string } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(payload?.error || "Mise à jour impossible.");
      }

      setActions((current) => current.map((action) => action.id === actionId ? payload.action! : action));
      setNotice(status === "validated" ? "Action validée." : status === "refused" ? "Action refusée." : "Action mise à jour.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Mise à jour impossible.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className={styles.agentPage}>
      <div className={styles.agentShell}>
        <header className={styles.topbar}>
          <div className={styles.brandBlock}>
            <span className={styles.logoRing} aria-hidden>
              <img src="/icons/inr-agent.png" alt="" className={styles.logoImage} />
            </span>
            <div>
              <p className={styles.eyebrow}>Centre de pilotage</p>
              <h1 className={styles.topbarTitle}>iNr'Agent</h1>
            </div>
          </div>
          <div className={styles.topbarActions}>
            <Link href="/dashboard?panel=inr_agent" className={styles.configButton}>Configurer</Link>
            <Link href="/dashboard" className={styles.closeButton}>Fermer</Link>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden />
              {loadState === "loading" ? "Synchronisation..." : statusLabel}
            </span>
            <h2 className={styles.title}>La tour de contrôle de vos actions iNrCy.</h2>
            <p className={styles.subtitle}>
              iNr'Agent regroupe les publications, campagnes mails, demandes d'avis et actions de fidélisation préparées par le générateur. Le professionnel garde la main : il valide, modifie ou refuse avant diffusion.
            </p>

            <div className={styles.commandStrip} aria-label="Fonctionnement iNr'Agent">
              <div>
                <span className={styles.commandLabel}>Analyse</span>
                <strong>Activité & canaux</strong>
              </div>
              <span className={styles.commandArrow}>→</span>
              <div>
                <span className={styles.commandLabel}>Prépare</span>
                <strong>Actions utiles</strong>
              </div>
              <span className={styles.commandArrow}>→</span>
              <div>
                <span className={styles.commandLabel}>Validation</span>
                <strong>Le pro décide</strong>
              </div>
            </div>
          </div>

          <div className={styles.orbitPanel} aria-label="Outils pilotés par iNr'Agent">
            <div className={styles.orbitHalo} aria-hidden />
            <div className={styles.orbitCore}>
              <img src="/icons/inr-agent.png" alt="" className={styles.orbitLogo} />
              <span>iNr'Agent</span>
            </div>
            {orbitNodes.map((node, index) => (
              <span className={`${styles.orbitNode} ${styles[`orbitNode${index + 1}`]}`} key={node}>
                {node}
              </span>
            ))}
          </div>
        </section>

        {tableNotice || notice ? (
          <div className={styles.noticeBar}>
            {tableNotice || notice}
          </div>
        ) : null}

        <section className={styles.kpiGrid} aria-label="Résumé iNr'Agent">
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{stats.pending}</span>
            <span className={styles.kpiLabel}>à valider</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{stats.scheduled}</span>
            <span className={styles.kpiLabel}>programmées</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{stats.validated}</span>
            <span className={styles.kpiLabel}>validées</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{stats.refused}</span>
            <span className={styles.kpiLabel}>refusées</span>
          </div>
        </section>

        <div className={styles.mainGrid}>
          <div className={styles.column}>
            <section className={`${styles.panel} ${styles.panelGlow}`}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>Mission principale</p>
                  <h2 className={styles.panelTitle}>Actions à valider</h2>
                  <p className={styles.panelHint}>L’espace où arrivent les actions préparées automatiquement.</p>
                </div>
                <span className={styles.badge}>Validation pro</span>
              </div>

              {pendingActions.length > 0 ? (
                <div className={styles.actionList}>
                  {pendingActions.map((action) => (
                    <article className={styles.actionCard} key={action.id}>
                      <div className={styles.actionIcon} aria-hidden>{INR_AGENT_ACTION_ICONS[action.actionType]}</div>
                      <div className={styles.actionContent}>
                        <div className={styles.actionTitleRow}>
                          <h3 className={styles.actionTitle}>{action.title}</h3>
                          <span className={styles.actionType}>{INR_AGENT_TOOL_LABELS[action.targetTool]}</span>
                        </div>
                        <p className={styles.actionMeta}>{action.summary}</p>
                        {action.previewText ? <p className={styles.previewText}>{action.previewText}</p> : null}
                        {action.targetChannels.length > 0 ? (
                          <div className={styles.channelList}>
                            {action.targetChannels.map((channel) => <span key={channel}>{channelLabel(channel)}</span>)}
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.actionButtons}>
                        <span className={styles.actionState}>{INR_AGENT_STATUS_LABELS[action.status]}</span>
                        <button className={styles.secondaryButton} type="button" disabled>Modifier</button>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          disabled={processingId === action.id}
                          onClick={() => updateActionStatus(action.id, "validated")}
                        >
                          {processingId === action.id ? "..." : "Valider"}
                        </button>
                        <button
                          className={styles.ghostButton}
                          type="button"
                          disabled={processingId === action.id}
                          onClick={() => updateActionStatus(action.id, "refused")}
                        >
                          Refuser
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon} aria-hidden>✦</span>
                  <strong>{loadState === "loading" ? "Synchronisation des actions..." : "Aucune action en attente pour le moment."}</strong>
                  <p>Dès que le moteur iNr'Agent préparera une action, elle apparaîtra ici avec les boutons Valider, Modifier et Refuser.</p>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>Aperçus intelligents</p>
                  <h2 className={styles.panelTitle}>Actions prévues</h2>
                  <p className={styles.panelHint}>Structure prête pour afficher les aperçus des outils pilotés par l’agent.</p>
                </div>
                <span className={styles.badge}>Brouillons</span>
              </div>

              <div className={styles.actionList}>
                {previewTemplates.map((action) => (
                  <article className={styles.actionCard} key={action.title}>
                    <div className={styles.actionIcon} aria-hidden>{action.icon}</div>
                    <div className={styles.actionContent}>
                      <div className={styles.actionTitleRow}>
                        <h3 className={styles.actionTitle}>{action.title}</h3>
                        <span className={styles.actionType}>{action.type}</span>
                      </div>
                      <p className={styles.actionMeta}>{action.meta}</p>
                    </div>
                    <div className={styles.actionButtons}>
                      <span className={styles.actionState}>{action.state}</span>
                      <button className={styles.secondaryButton} type="button" disabled>Modifier</button>
                      <button className={styles.primaryButton} type="button" disabled>Valider</button>
                      <button className={styles.ghostButton} type="button" disabled>Refuser</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.column}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>Réglages rapides</p>
                  <h2 className={styles.panelTitle}>Configuration</h2>
                  <p className={styles.panelHint}>Résumé du comportement configuré pour le moteur automatique.</p>
                </div>
              </div>

              <div className={styles.settingList}>
                {quickSettings.map(([label, value]) => (
                  <div className={styles.settingRow} key={label}>
                    <span className={styles.settingLabel}>{label}</span>
                    <span className={styles.settingValue}>{value}</span>
                  </div>
                ))}
              </div>

              <Link href="/dashboard?panel=inr_agent" className={styles.fullButton}>Configurer iNr'Agent</Link>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelKicker}>Journal de bord</p>
                  <h2 className={styles.panelTitle}>Historique</h2>
                  <p className={styles.panelHint}>Suivi des actions créées, validées, refusées ou envoyées.</p>
                </div>
              </div>

              <div className={styles.timeline}>
                {historyActions.length > 0 ? historyActions.map((action) => (
                  <div className={styles.timelineItem} key={action.id}>
                    <span className={styles.timelineDot} aria-hidden />
                    <div>
                      <p className={styles.timelineTitle}>{INR_AGENT_STATUS_LABELS[action.status]} • {INR_AGENT_ACTION_LABELS[action.actionType]}</p>
                      <p className={styles.timelineText}>{formatDate(action.updatedAt || action.createdAt)} — {actionSummary(action)}</p>
                    </div>
                  </div>
                )) : defaultTimeline.map(([title, text]) => (
                  <div className={styles.timelineItem} key={title}>
                    <span className={styles.timelineDot} aria-hidden />
                    <div>
                      <p className={styles.timelineTitle}>{title}</p>
                      <p className={styles.timelineText}>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
