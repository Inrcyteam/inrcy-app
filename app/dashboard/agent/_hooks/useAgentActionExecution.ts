"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import type PublishExecutionResultModal from "../../_components/PublishExecutionResultModal";
import type { ChannelKey as BoosterChannelKey } from "../../booster/publier/publishModal.shared";
import type {
  ActionMutationIntent,
  ActionMutationState,
  AgentCampaignLaunchNotice,
  AgentPreparedAction,
  AgentPublishExecutionProgressState,
  AgentScheduledAction,
  ScheduledActionEditSession,
} from "../_lib/agent.types";
import { agentPublishChannelToBoosterChannel } from "../_lib/agent.config";
import {
  channelDisplayName,
  scheduledEditUpdateFromAction,
} from "../_lib/agent.schedule";
import { normalizeAgentExternalHref } from "../_lib/agent.settings";
import { asRecord } from "../_lib/agent.utils";

type Setter<T> = Dispatch<SetStateAction<T>>;
type PublishSummary = ComponentProps<typeof PublishExecutionResultModal>["summary"];

type ExitScheduledEditSession = (
  options?: { silent?: boolean; force?: boolean; onAfterExit?: () => void },
) => boolean;

type UseAgentActionExecutionParams = {
  selectedPreparedAction: AgentPreparedAction | null;
  scheduledEditSession: ScheduledActionEditSession | null;
  setActions: Setter<AgentPreparedAction[]>;
  setScheduledActions: Setter<AgentScheduledAction[]>;
  setTableMissing: Setter<boolean>;
  setNotice: Setter<string | null>;
  setValidationChoiceOpen: Setter<boolean>;
  setValidationScheduleOpen: Setter<boolean>;
  refreshActions: (silent?: boolean) => Promise<void>;
  refreshScheduledActions: (silent?: boolean) => Promise<void>;
  patchScheduledAction: (
    actionId: string,
    body: Record<string, unknown>,
  ) => Promise<AgentScheduledAction>;
  exitScheduledEditSession: ExitScheduledEditSession;
  deleteScheduledEditAction: () => Promise<void>;
  showNotice: (message: string) => void;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useAgentActionExecution({
  selectedPreparedAction,
  scheduledEditSession,
  setActions,
  setScheduledActions,
  setTableMissing,
  setNotice,
  setValidationChoiceOpen,
  setValidationScheduleOpen,
  refreshActions,
  refreshScheduledActions,
  patchScheduledAction,
  exitScheduledEditSession,
  deleteScheduledEditAction,
  showNotice,
}: UseAgentActionExecutionParams) {
  const [actionMutationState, setActionMutationState] =
    useState<ActionMutationState>("idle");
  const [actionMutationIntent, setActionMutationIntent] =
    useState<ActionMutationIntent>(null);
  const [agentPublishExecutionProgress, setAgentPublishExecutionProgress] =
    useState<AgentPublishExecutionProgressState>(null);
  const [agentPublishSuccessSummary, setAgentPublishSuccessSummary] =
    useState<PublishSummary>(null);
  const [agentCampaignLaunchNotice, setAgentCampaignLaunchNotice] =
    useState<AgentCampaignLaunchNotice>(null);
  const agentPublishProgressTimerRef = useRef<number | null>(null);


  useEffect(() => {
    return () => {
      if (agentPublishProgressTimerRef.current) {
        window.clearInterval(agentPublishProgressTimerRef.current);
        agentPublishProgressTimerRef.current = null;
      }
    };
  }, []);

  function stopAgentPublishProgressTimer() {
    if (agentPublishProgressTimerRef.current) {
      window.clearInterval(agentPublishProgressTimerRef.current);
      agentPublishProgressTimerRef.current = null;
    }
  }

  function startAgentPublishProgress(action: AgentPreparedAction) {
    stopAgentPublishProgressTimer();
    const channels = Array.isArray(action.targetChannels)
      ? action.targetChannels
          .map(
            (channel) =>
              agentPublishChannelToBoosterChannel[
                String(channel || "").trim()
              ] || String(channel || "").trim(),
          )
          .filter(Boolean)
      : [];
    const selectedChannels = channels.length ? channels : ["publication"];
    const startedAt = Date.now();
    const estimatedMs = Math.max(8500, 4200 + selectedChannels.length * 5200);

    setAgentPublishExecutionProgress({
      progress: 6,
      label: "Préparation de la publication iNr’Agent...",
    });

    agentPublishProgressTimerRef.current = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / estimatedMs);
      const progress = Math.max(6, Math.min(96, Math.round(6 + ratio * 90)));
      let label = "Préparation de la publication iNr’Agent...";
      if (ratio >= 0.12 && ratio < 0.72) {
        const channelRatio = Math.max(0, (ratio - 0.12) / 0.6);
        const channelIndex = Math.min(
          selectedChannels.length - 1,
          Math.floor(channelRatio * selectedChannels.length),
        );
        const channel = selectedChannels[channelIndex];
        const boosterChannel =
          agentPublishChannelToBoosterChannel[channel] || channel;
        const labelName = channelDisplayName(boosterChannel || channel);
        label =
          selectedChannels.length > 1
            ? `Canal ${channelIndex + 1}/${selectedChannels.length} — publication sur ${labelName}...`
            : `Publication sur ${labelName}...`;
      } else if (ratio >= 0.72 && ratio < 0.88) {
        label = "Récupération des retours canaux...";
      } else if (ratio >= 0.88) {
        label = "Finalisation dans iNr’Send...";
      }
      setAgentPublishExecutionProgress((current) =>
        current
          ? { progress: Math.max(current.progress, progress), label }
          : current,
      );
    }, 450);
  }

  async function loadAgentPublishChannelLinks() {
    try {
      const response = await fetch("/api/booster/connected-channels", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.channelDetails) return {};
      const details = asRecord(payload.channelDetails) || {};
      const links: Record<string, string> = {};
      for (const [channel, value] of Object.entries(details)) {
        const href = normalizeAgentExternalHref(asRecord(value)?.href);
        if (href) links[channel] = href;
      }
      return links;
    } catch {
      return {};
    }
  }

  function completeAgentPublishProgress(label: string) {
    stopAgentPublishProgressTimer();
    setAgentPublishExecutionProgress((current) =>
      current ? { progress: 100, label } : current,
    );
  }

  function buildAgentCampaignLaunchNotice(payload: {
    campaignResult?: Record<string, unknown> | null;
    action: AgentPreparedAction;
  }): AgentCampaignLaunchNotice {
    const campaignResult = payload.campaignResult || {};
    const folderRaw = String(
      campaignResult.folder || payload.action.payload?.folder || "",
    ).trim();
    const fallbackFolder =
      payload.action.automationKey === "loyalty"
        ? "fidelisations"
        : "propulsions";
    const folder = (
      ["propulsions", "fidelisations", "mails"].includes(folderRaw)
        ? folderRaw
        : fallbackFolder
    ) as "propulsions" | "fidelisations" | "mails";
    const queued = Math.max(
      0,
      Number(campaignResult.queued || payload.action.recipients?.length || 0),
    );
    return {
      queued,
      folder,
      title: "Campagne lancée",
      details:
        queued > 0
          ? `${queued} email${queued > 1 ? "s" : ""} en file d’envoi. Le bilan final sera envoyé par mail au pro.`
          : "La campagne a été confiée à iNr’Agent. Le bilan final sera envoyé par mail au pro.",
    };
  }

  async function executeImmediateAgentPublicationAfterSchedule(request: {
    action: AgentPreparedAction;
    actionId: string;
    channels: BoosterChannelKey[];
  }) {
    if (!request.channels.length || actionMutationState === "saving") return;
    setActionMutationIntent("validated");
    setActionMutationState("saving");
    setNotice(null);
    setAgentCampaignLaunchNotice(null);
    setAgentPublishSuccessSummary(null);
    startAgentPublishProgress(request.action);

    try {
      const response = await fetch("/api/agent/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: request.actionId,
          channels: request.channels,
          preserveActionStatus: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        publishResult?: Record<string, unknown> | null;
      } | null;

      if (payload?.action) {
        setActions((current) =>
          current.map((action) =>
            action.id === payload.action?.id ? payload.action : action,
          ),
        );
      }

      if (!response.ok) {
        const failedPublishSummary = asRecord(payload?.publishResult)?.summary;
        if (failedPublishSummary) {
          completeAgentPublishProgress("Échec");
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(failedPublishSummary) || {}),
            publicationId:
              String(
                asRecord(payload?.publishResult)?.publication_id ||
                  asRecord(payload?.publishResult)?.publicationId ||
                  "",
              ).trim() || null,
            channelLinks,
          });
          return;
        }
        throw new Error(
          payload?.error ||
            "Publication immédiate des autres canaux impossible.",
        );
      }

      const publishSummary = asRecord(payload?.publishResult)?.summary;
      completeAgentPublishProgress(
        asRecord(publishSummary)?.allFailed ? "Échec" : "Publié",
      );
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const channelLinks = await loadAgentPublishChannelLinks();
      setAgentPublishExecutionProgress(null);
      setAgentPublishSuccessSummary({
        ...(asRecord(publishSummary) || {}),
        publicationId:
          String(
            asRecord(payload?.publishResult)?.publication_id ||
              asRecord(payload?.publishResult)?.publicationId ||
              "",
          ).trim() || null,
        channelLinks,
      });
      await refreshActions(true);
    } catch (error) {
      stopAgentPublishProgressTimer();
      setAgentPublishExecutionProgress(null);
      showNotice(
        error instanceof Error
          ? error.message
          : "Publication immédiate des autres canaux impossible.",
      );
    } finally {
      setActionMutationState("idle");
      setActionMutationIntent(null);
    }
  }

  async function runScheduledEditNow() {
    const session = scheduledEditSession;
    if (!session || actionMutationState === "saving") return;

    const actionToExecute = session.action;
    const isPublishExecution =
      actionToExecute.automationKey === "publish" &&
      actionToExecute.targetTool === "booster" &&
      actionToExecute.actionType === "publication";
    const isCampaignExecution = !isPublishExecution;

    setActionMutationIntent("validated");
    setActionMutationState("saving");
    setNotice(null);
    setValidationChoiceOpen(false);
    setValidationScheduleOpen(false);
    setAgentCampaignLaunchNotice(null);
    if (isPublishExecution) {
      setAgentPublishSuccessSummary(null);
      startAgentPublishProgress(actionToExecute);
    }

    try {
      await patchScheduledAction(
        session.scheduledAction.id,
        scheduledEditUpdateFromAction(actionToExecute, {
          scheduledAt: session.scheduledAction.scheduledAt,
        }),
      );

      const response = await fetch(
        `/api/agent/scheduled-actions/${session.scheduledAction.id}/execute`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as {
        scheduledAction?: AgentScheduledAction;
        publishResult?: Record<string, unknown> | null;
        campaignResult?: Record<string, unknown> | null;
        error?: string;
      } | null;

      if (!response.ok) {
        const failedPublishSummary = asRecord(payload?.publishResult)?.summary;
        if (isPublishExecution && failedPublishSummary) {
          completeAgentPublishProgress("Échec");
          await wait(220);
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(failedPublishSummary) || {}),
            publicationId:
              String(
                asRecord(payload?.publishResult)?.publication_id ||
                  asRecord(payload?.publishResult)?.publicationId ||
                  "",
              ).trim() || null,
            channelLinks,
          });
          return;
        }
        throw new Error(
          payload?.error || "Lancement immédiat de l’action programmée impossible.",
        );
      }

      if (payload?.scheduledAction) {
        setScheduledActions((current) => [
          payload.scheduledAction as AgentScheduledAction,
          ...current.filter(
            (action) => action.id !== payload.scheduledAction?.id,
          ),
        ]);
      }

      exitScheduledEditSession({ silent: true, force: true });
      await refreshScheduledActions(true);
      await refreshActions(true);

      if (isPublishExecution) {
        const publishSummary = asRecord(payload?.publishResult)?.summary;
        completeAgentPublishProgress(
          asRecord(publishSummary)?.allFailed ? "Échec" : "Publié",
        );
        await wait(220);
        const channelLinks = await loadAgentPublishChannelLinks();
        setAgentPublishExecutionProgress(null);
        setAgentPublishSuccessSummary({
          ...(asRecord(publishSummary) || {}),
          publicationId:
            String(
              asRecord(payload?.publishResult)?.publication_id ||
                asRecord(payload?.publishResult)?.publicationId ||
                "",
            ).trim() || null,
          channelLinks,
        });
        return;
      }

      if (isCampaignExecution) {
        setAgentCampaignLaunchNotice(
          buildAgentCampaignLaunchNotice({
            campaignResult: asRecord(payload?.campaignResult),
            action: actionToExecute,
          }),
        );
      }
    } catch (error) {
      if (isPublishExecution) {
        stopAgentPublishProgressTimer();
        setAgentPublishExecutionProgress(null);
      }
      showNotice(
        error instanceof Error
          ? error.message
          : "Lancement immédiat de l’action programmée impossible.",
      );
    } finally {
      setActionMutationState("idle");
      setActionMutationIntent(null);
    }
  }

  async function updateActionStatus(status: "validated" | "refused") {
    const actionToExecute = selectedPreparedAction;
    if (!actionToExecute || actionMutationState === "saving") return;

    if (scheduledEditSession) {
      if (status === "refused") {
        void deleteScheduledEditAction();
        return;
      }
      setValidationChoiceOpen(true);
      return;
    }

    const isImmediatePublishExecution =
      status === "validated" &&
      actionToExecute.automationKey === "publish" &&
      actionToExecute.targetTool === "booster" &&
      actionToExecute.actionType === "publication";
    const isImmediateCampaignExecution =
      status === "validated" &&
      (actionToExecute.automationKey === "grow" ||
        actionToExecute.automationKey === "loyalty" ||
        actionToExecute.targetTool === "mails" ||
        actionToExecute.actionType === "mailing" ||
        actionToExecute.actionType === "campaign");

    setActionMutationIntent(status);
    setActionMutationState("saving");
    setNotice(null);
    setAgentCampaignLaunchNotice(null);
    if (isImmediatePublishExecution) {
      setValidationChoiceOpen(false);
      setValidationScheduleOpen(false);
      setAgentPublishSuccessSummary(null);
      startAgentPublishProgress(actionToExecute);
    }

    try {
      const endpoint =
        status === "validated"
          ? "/api/agent/actions/execute"
          : "/api/agent/actions";
      const response = await fetch(endpoint, {
        method: status === "validated" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: actionToExecute.id, status }),
      });
      const payload = (await response.json().catch(() => null)) as {
        action?: AgentPreparedAction;
        error?: string;
        tableMissing?: boolean;
        executed?: boolean;
        publishResult?: Record<string, unknown> | null;
        campaignResult?: Record<string, unknown> | null;
      } | null;

      const applyReturnedAction = (nextAction: AgentPreparedAction) => {
        setActions((current) =>
          current.map((action) =>
            action.id === nextAction.id ? nextAction : action,
          ),
        );
      };

      if (!response.ok) {
        if (payload?.action) applyReturnedAction(payload.action);

        const failedPublishSummary = asRecord(payload?.publishResult)?.summary;
        if (isImmediatePublishExecution && failedPublishSummary) {
          completeAgentPublishProgress("Échec");
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(failedPublishSummary) || {}),
            publicationId:
              String(
                asRecord(payload?.publishResult)?.publication_id ||
                  asRecord(payload?.publishResult)?.publicationId ||
                  "",
              ).trim() || null,
            channelLinks,
          });
          return;
        }

        throw new Error(
          payload?.error || "Mise à jour de l’action impossible.",
        );
      }

      if (payload?.tableMissing) setTableMissing(true);
      if (payload?.action) {
        applyReturnedAction(payload.action);
      } else {
        setActions((current) =>
          current.map((action) =>
            action.id === actionToExecute.id ? { ...action, status } : action,
          ),
        );
      }

      if (status === "validated") {
        setValidationChoiceOpen(false);
        setValidationScheduleOpen(false);

        if (isImmediatePublishExecution) {
          const publishSummary = asRecord(payload?.publishResult)?.summary;
          completeAgentPublishProgress(
            asRecord(publishSummary)?.allFailed ? "Échec" : "Publié",
          );
          await new Promise((resolve) => window.setTimeout(resolve, 220));
          const channelLinks = await loadAgentPublishChannelLinks();
          setAgentPublishExecutionProgress(null);
          setAgentPublishSuccessSummary({
            ...(asRecord(publishSummary) || {}),
            channelLinks,
          });
          return;
        }

        if (isImmediateCampaignExecution && payload?.campaignResult) {
          setAgentCampaignLaunchNotice(
            buildAgentCampaignLaunchNotice({
              campaignResult: payload.campaignResult,
              action: payload.action || actionToExecute,
            }),
          );
          return;
        }

        showNotice("Action validée et exécutée par iNr’Agent.");
      } else {
        showNotice("Action refusée. Rien ne sera exécuté.");
      }
    } catch (error) {
      if (isImmediatePublishExecution) {
        stopAgentPublishProgressTimer();
        setAgentPublishExecutionProgress(null);
      }
      showNotice(
        error instanceof Error
          ? error.message
          : "Mise à jour de l’action impossible.",
      );
    } finally {
      setActionMutationState("idle");
      setActionMutationIntent(null);
    }
  }
  return {
    actionMutationState,
    actionMutationIntent,
    agentPublishExecutionProgress,
    agentPublishSuccessSummary,
    setAgentPublishSuccessSummary,
    agentCampaignLaunchNotice,
    setAgentCampaignLaunchNotice,
    executeImmediateAgentPublicationAfterSchedule,
    runScheduledEditNow,
    updateActionStatus,
  };
}
