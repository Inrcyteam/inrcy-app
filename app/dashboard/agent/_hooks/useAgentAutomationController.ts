"use client";

import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  sanitizeInrAgentSettings,
  type InrAgentSettings,
} from "@/lib/inrAgentSettings";
import type {
  AutomationConfig,
  AutomationKey,
  ConnectedChannelMap,
  PrepareActionState,
  PrepareNowConfirmState,
  PrepareProgressState,
  SaveState,
  StatsProgressState,
  AgentPreparedAction,
  LoadState,
} from "../_lib/agent.types";
import {
  automations,
  pendingActionStatuses,
} from "../_lib/agent.config";
import {
  configsToSettings,
  connectedChannelMessage,
  connectedChannelsForAutomation,
  normalizeConfigScheduleSlots,
  normalizeConfigsForConnectedChannels,
  settingsToConfigs,
} from "../_lib/agent.settings";
import {
  prepareProgressLabel,
  statsProgressLabel,
} from "../_lib/agent.reports";
import { writeCachedAgentViewSnapshot } from "./useAgentRuntimeData";

type Setter<T> = Dispatch<SetStateAction<T>>;

type UseAgentAutomationControllerParams = {
  agentSettings: InrAgentSettings;
  setAgentSettings: Setter<InrAgentSettings>;
  configs: Record<AutomationKey, AutomationConfig>;
  setConfigs: Setter<Record<AutomationKey, AutomationConfig>>;
  agentConnectedChannels: ConnectedChannelMap | null;
  connectedChannelsLoadState: LoadState;
  saveState: SaveState;
  setSaveState: Setter<SaveState>;
  setTableMissing: Setter<boolean>;
  setNotice: Setter<string | null>;
  setSettingsKey: Setter<AutomationKey | null>;
  pendingActionsByAutomation: Record<AutomationKey, number>;
  setActions: Setter<AgentPreparedAction[]>;
  refreshActions: (silent?: boolean) => Promise<void>;
  setSelectedKey: Setter<AutomationKey>;
  showNotice: (message: string) => void;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useAgentAutomationController({
  agentSettings,
  setAgentSettings,
  configs,
  setConfigs,
  agentConnectedChannels,
  connectedChannelsLoadState,
  saveState,
  setSaveState,
  setTableMissing,
  setNotice,
  setSettingsKey,
  pendingActionsByAutomation,
  setActions,
  refreshActions,
  setSelectedKey,
  showNotice,
}: UseAgentAutomationControllerParams) {
  const [prepareActionState, setPrepareActionState] =
    useState<PrepareActionState>("idle");
  const [prepareProgress, setPrepareProgress] =
    useState<PrepareProgressState>(null);
  const [testNowKey, setTestNowKey] = useState<AutomationKey | null>(null);
  const [prepareNowConfirm, setPrepareNowConfirm] =
    useState<PrepareNowConfirmState>(null);
  const [statsProgress, setStatsProgress] = useState<StatsProgressState>(null);

  function updateConfig(key: AutomationKey, patch: Partial<AutomationConfig>) {
    setConfigs((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
    setSaveState("idle");
    setNotice(null);
  }

  function updateConfigFrequency(key: AutomationKey, frequency: string) {
    setConfigs((current) => {
      const currentConfig = current[key];
      const normalizedSlots = normalizeConfigScheduleSlots(currentConfig);
      return {
        ...current,
        [key]: {
          ...currentConfig,
          frequency,
          scheduleSlots: normalizedSlots,
          day: normalizedSlots[0].day,
          time: normalizedSlots[0].time,
        },
      };
    });
    setSaveState("idle");
    setNotice(null);
  }

  function updateConfigScheduleSlot(
    key: AutomationKey,
    index: number,
    patch: Partial<{ day: string; time: string }>,
  ) {
    setConfigs((current) => {
      const currentConfig = current[key];
      const slots = normalizeConfigScheduleSlots(currentConfig);
      slots[index] = { ...slots[index], ...patch };
      return {
        ...current,
        [key]: {
          ...currentConfig,
          scheduleSlots: slots,
          ...(index === 0 ? { day: slots[0].day, time: slots[0].time } : {}),
        },
      };
    });
    setSaveState("idle");
    setNotice(null);
  }

  async function persistSettings(
    options: { closeModal?: boolean; showSuccess?: boolean } = {},
  ) {
    const { closeModal = true, showSuccess = true } = options;
    const safeConfigs = agentConnectedChannels
      ? normalizeConfigsForConnectedChannels(configs, agentConnectedChannels)
      : configs;
    const nextSettings = configsToSettings(agentSettings, safeConfigs);
    setConfigs(safeConfigs);
    setSaveState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const payload = (await response.json().catch(() => null)) as {
        settings?: Partial<InrAgentSettings>;
        error?: string;
        tableMissing?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Enregistrement impossible.");
      }

      const savedSettings = sanitizeInrAgentSettings(
        payload?.settings ?? nextSettings,
      );
      setAgentSettings(savedSettings);
      setConfigs(settingsToConfigs(savedSettings));
      setTableMissing((current) => current || Boolean(payload?.tableMissing));
      writeCachedAgentViewSnapshot({
        settings: savedSettings,
        tableMissing: Boolean(payload?.tableMissing),
      });
      setSaveState("saved");
      if (closeModal) setSettingsKey(null);
      if (showSuccess) showNotice("Réglages iNr’Agent enregistrés.");
      return true;
    } catch (error) {
      setSaveState("error");
      showNotice(
        error instanceof Error ? error.message : "Enregistrement impossible.",
      );
      return false;
    }
  }

  async function saveSettings() {
    await persistSettings();
  }

  async function runAutomationNow(key: AutomationKey) {
    if (testNowKey || prepareActionState === "saving" || saveState === "saving")
      return;

    const progressKey = key === "stats" ? null : key;
    let progressTimer: number | null = null;

    setTestNowKey(key);

    if (progressKey) {
      setPrepareProgress({
        key: progressKey,
        label: prepareProgressLabel(progressKey, 6),
        percent: 6,
      });
      progressTimer = window.setInterval(() => {
        setPrepareProgress((current) => {
          if (!current || current.key !== progressKey || current.percent >= 97)
            return current;
          const increment =
            current.percent < 22
              ? 7
              : current.percent < 52
                ? 5
                : current.percent < 78
                  ? 3
                  : 1;
          const nextPercent = Math.min(97, current.percent + increment);
          return {
            key: progressKey,
            label: prepareProgressLabel(progressKey, nextPercent),
            percent: nextPercent,
          };
        });
      }, 520);
    }

    let completed = false;

    try {
      const saved = await persistSettings({
        closeModal: false,
        showSuccess: false,
      });
      if (!saved) return;

      if (key === "publish") {
        completed = await preparePublishAction();
      } else if (key === "grow" || key === "loyalty") {
        completed = await prepareCampaignAction(key);
      } else {
        await sendStatsReport();
        completed = true;
      }

      if (completed) setSettingsKey(null);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      if (progressKey) {
        setPrepareProgress((current) =>
          current?.key === progressKey
            ? {
                key: progressKey,
                label: completed ? "Finalisation" : "Préparation arrêtée",
                percent: 100,
              }
            : current,
        );
        await wait(completed ? 520 : 850);
        setPrepareProgress((current) =>
          current?.key === progressKey ? null : current,
        );
      }
      setTestNowKey(null);
    }
  }

  function testAutomationNow(key: AutomationKey) {
    if (testNowKey || prepareActionState === "saving" || saveState === "saving")
      return;

    const automation = automations.find((item) => item.key === key) ?? null;
    if (
      automation &&
      key !== "stats" &&
      connectedChannelsLoadState === "ready" &&
      connectedChannelsForAutomation(automation, agentConnectedChannels)
        .length === 0
    ) {
      showNotice(connectedChannelMessage(automation));
      return;
    }

    if (
      (key === "grow" || key === "loyalty") &&
      pendingActionsByAutomation[key] > 0
    ) {
      setPrepareNowConfirm({
        key,
        label: key === "grow" ? "Propulser" : "Fidéliser",
        pendingCount: pendingActionsByAutomation[key],
      });
      return;
    }

    void runAutomationNow(key);
  }

  async function confirmPrepareNowReplacement() {
    const confirm = prepareNowConfirm;
    if (!confirm) return;
    setPrepareNowConfirm(null);
    await runAutomationNow(confirm.key);
  }

  async function preparePublishAction() {
    if (prepareActionState === "saving") return false;

    setPrepareActionState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions/prepare-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Préparation de la publication impossible.",
        );
      }

      const preparedAction = payload.action;
      setActions((current) => [
        preparedAction,
        ...current.filter((action) => action.id !== preparedAction.id),
      ]);
      setSelectedKey("publish");
      showNotice("Publication Booster préparée par iNr’Agent.");
      return true;
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la publication impossible.",
      );
      return false;
    } finally {
      setPrepareActionState("idle");
    }
  }

  async function prepareCampaignAction(
    key: Extract<AutomationKey, "grow" | "loyalty">,
  ) {
    if (prepareActionState === "saving") return false;

    setPrepareActionState("saving");
    setNotice(null);

    try {
      const response = await fetch("/api/agent/actions/prepare-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationKey: key }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        movedDrafts?: Array<{
          actionId?: string | null;
          draftId?: string | null;
        }>;
        error?: string;
        detail?: string;
      } | null;

      if (!response.ok || !payload?.action) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Préparation de la campagne impossible.",
        );
      }

      const preparedAction = payload.action;
      const movedActionIds = new Set(
        (payload.movedDrafts ?? [])
          .map((draft) => String(draft.actionId || "").trim())
          .filter(Boolean),
      );
      setActions((current) => [
        preparedAction,
        ...current.filter(
          (action) =>
            action.id !== preparedAction.id &&
            !movedActionIds.has(action.id) &&
            !(
              action.automationKey === key &&
              pendingActionStatuses.has(action.status)
            ),
        ),
      ]);
      void refreshActions(true);
      setSelectedKey(key);
      showNotice(
        key === "grow"
          ? "Campagne Propulser préparée par iNr’Agent."
          : "Campagne Fidéliser préparée par iNr’Agent.",
      );
      return true;
    } catch (error) {
      showNotice(
        error instanceof Error
          ? error.message
          : "Préparation de la campagne impossible.",
      );
      return false;
    } finally {
      setPrepareActionState("idle");
    }
  }

  async function sendStatsReport() {
    if (prepareActionState === "saving") return;

    setPrepareActionState("saving");
    setStatsProgress({ label: "Stats", percent: 3 });
    setNotice(null);

    let progressTimer: number | null = null;

    try {
      progressTimer = window.setInterval(() => {
        setStatsProgress((current) => {
          const currentPercent = current?.percent ?? 3;
          if (currentPercent >= 98) return current;

          const increment =
            currentPercent < 20
              ? 4
              : currentPercent < 45
                ? 3
                : currentPercent < 70
                  ? 2
                  : 1;
          const nextPercent = Math.min(98, currentPercent + increment);
          return {
            label: statsProgressLabel(nextPercent),
            percent: nextPercent,
          };
        });
      }, 420);

      const response = await fetch("/api/agent/actions/send-stats-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction | null;
        error?: string;
        detail?: string;
        sent?: boolean;
        recipientEmail?: string;
        filename?: string;
      } | null;

      if (!response.ok || !payload?.sent) {
        throw new Error(
          payload?.error ||
            payload?.detail ||
            "Génération ou envoi du bilan iNr’Stats impossible.",
        );
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setStatsProgress({ label: "Bilan envoyé", percent: 100 });

      await refreshActions(true);
      setSelectedKey("stats");
      showNotice(
        `Bilan iNr’Stats PDF envoyé${payload.recipientEmail ? ` à ${payload.recipientEmail}` : ""}.`,
      );
      await wait(800);
    } catch (error) {
      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setStatsProgress({ label: "Erreur", percent: 100 });
      showNotice(
        error instanceof Error
          ? error.message
          : "Génération ou envoi du bilan iNr’Stats impossible.",
      );
      await wait(900);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setPrepareActionState("idle");
      setStatsProgress(null);
    }
  }

  return {
    prepareActionState,
    prepareProgress,
    testNowKey,
    prepareNowConfirm,
    setPrepareNowConfirm,
    statsProgress,
    updateConfig,
    updateConfigFrequency,
    updateConfigScheduleSlot,
    saveSettings,
    testAutomationNow,
    confirmPrepareNowReplacement,
  };
}
