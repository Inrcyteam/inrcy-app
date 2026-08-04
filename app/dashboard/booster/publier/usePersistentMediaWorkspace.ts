"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoosterCreationMode } from "@/lib/boosterCreationMode";
import {
  buildBoosterSourceMediaMetadata,
  requiresBoosterServerImagePreview,
  type BoosterMediaPipelineMission,
} from "@/lib/boosterMediaPipelineMissions";
import {
  archiveMediaPublicationWorkspace,
  buildWorkspaceMediaClientKey,
  clearBoosterWorkspaceClientKey,
  clearMediaPublicationWorkspace,
  ensureMediaPublicationWorkspace,
  getOrCreateBoosterWorkspaceClientKey,
  isUniversalMediaWorkspaceEnabled,
  linkMediaPublicationWorkspaceDraft,
  loadMediaPublicationWorkspace,
  prepareMediaPublicationWorkspace,
  prepareMediaWorkspaceSourcePreviews,
  prewarmMediaPublicationWorkspace,
  type MediaWorkspaceMediaSummary,
  type MediaWorkspacePreparationResult,
  type MediaWorkspaceReference,
} from "@/lib/mediaWorkspaceClient";
import { uploadUniversalMediaFile } from "@/lib/universalMediaUploadClient";

export type PersistentWorkspaceMediaState = {
  localKey: string;
  mediaId: string | null;
  mediaType: "image" | "video";
  position: number;
  status: "queued" | "uploading" | "ready" | "failed";
  progress: number;
  storagePath: string;
  error: string;
};

type UsePersistentMediaWorkspaceParams = {
  draftId?: string | null;
  creationMode: BoosterCreationMode | null;
  selectedChannels: readonly string[];
  imageSettingsByChannel?: Record<string, unknown>;
  onError?: (message: string) => void;
  onPreparedMedia?: (media: readonly MediaWorkspaceMediaSummary[]) => void;
};

type PublicationPreparationSettings = {
  imageSettingsByChannel?: Record<string, unknown>;
  videoSettingsByChannel?: Record<string, unknown>;
  selectedChannels?: readonly string[];
  deferUntilReady?: boolean;
  generateMissingVideoVariants?: boolean;
  allowOriginalVideoFallback?: boolean;
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    String((error as { name?: unknown })?.name || "") === "AbortError"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default function usePersistentMediaWorkspace({
  draftId,
  creationMode,
  selectedChannels,
  imageSettingsByChannel,
  onError,
  onPreparedMedia,
}: UsePersistentMediaWorkspaceParams) {
  const enabled = isUniversalMediaWorkspaceEnabled();
  const [reference, setReference] = useState<MediaWorkspaceReference | null>(
    null,
  );
  const [mediaStates, setMediaStates] = useState<
    Record<string, PersistentWorkspaceMediaState>
  >({});
  const [clientWorkspaceKey, setClientWorkspaceKey] = useState("");
  const mediaStatesRef = useRef<Record<string, PersistentWorkspaceMediaState>>({});
  const referenceRef = useRef<MediaWorkspaceReference | null>(null);
  const ensurePromiseRef = useRef<Promise<MediaWorkspaceReference> | null>(null);
  const clientWorkspaceKeyRef = useRef("");
  const operationVersionRef = useRef(0);
  const operationAbortRef = useRef<AbortController | null>(null);
  const activeTaskRef = useRef<Promise<void>>(Promise.resolve());
  const activePreparationRef = useRef<
    Partial<
      Record<
        Exclude<BoosterMediaPipelineMission, "source_metadata">,
        Promise<MediaWorkspacePreparationResult>
      >
    >
  >({});
  const missionReadyRef = useRef({
    ai_preparation: false,
    publication_preparation: false,
  });
  const activeUploadFailureRef = useRef("");
  const selectedChannelsRef = useRef(selectedChannels);
  const imageSettingsByChannelRef = useRef(imageSettingsByChannel);
  const videoSettingsByChannelRef = useRef<
    Record<string, unknown> | undefined
  >(undefined);
  const creationModeRef = useRef(creationMode);
  const onPreparedMediaRef = useRef(onPreparedMedia);

  const resetMissionReadiness = useCallback(() => {
    missionReadyRef.current.ai_preparation = false;
    missionReadyRef.current.publication_preparation = false;
    activePreparationRef.current = {};
  }, []);

  const resolveClientWorkspaceKey = useCallback(() => {
    if (clientWorkspaceKeyRef.current) {
      return clientWorkspaceKeyRef.current;
    }

    const nextClientWorkspaceKey = getOrCreateBoosterWorkspaceClientKey(draftId);
    clientWorkspaceKeyRef.current = nextClientWorkspaceKey;
    setClientWorkspaceKey(nextClientWorkspaceKey);
    return nextClientWorkspaceKey;
  }, [draftId]);

  const ensureWorkspace = useCallback(async () => {
    if (!enabled) return null;
    if (referenceRef.current) return referenceRef.current;
    if (ensurePromiseRef.current) return await ensurePromiseRef.current;

    const clientWorkspaceKey = resolveClientWorkspaceKey();
    const promise = ensureMediaPublicationWorkspace({
      clientWorkspaceKey,
      draftId,
      selectedChannels: selectedChannelsRef.current,
    })
      .then((next) => {
        referenceRef.current = next;
        setReference(next);
        return next;
      })
      .finally(() => {
        ensurePromiseRef.current = null;
      });
    ensurePromiseRef.current = promise;
    return await promise;
  }, [draftId, enabled, resolveClientWorkspaceKey]);

  const adoptWorkspace = useCallback(
    (workspaceId: unknown, clientWorkspaceKey?: unknown) => {
      const cleanWorkspaceId = String(workspaceId || "").trim();
      if (!cleanWorkspaceId) return;
      const cleanClientKey = String(clientWorkspaceKey || "").trim();
      const next: MediaWorkspaceReference = {
        workspaceId: cleanWorkspaceId,
        clientWorkspaceKey: cleanClientKey || resolveClientWorkspaceKey(),
      };
      operationVersionRef.current += 1;
      resetMissionReadiness();
      operationAbortRef.current?.abort();
      operationAbortRef.current = null;
      ensurePromiseRef.current = null;
      clientWorkspaceKeyRef.current = next.clientWorkspaceKey;
      setClientWorkspaceKey(next.clientWorkspaceKey);
      referenceRef.current = next;
      setReference(next);
    },
    [resetMissionReadiness, resolveClientWorkspaceKey],
  );

  const refreshPreparedMedia = useCallback(async (workspaceId: string) => {
    const snapshot = await loadMediaPublicationWorkspace({
      workspaceId,
      includeUrls: true,
    });
    onPreparedMediaRef.current?.(snapshot.media);
    return snapshot;
  }, []);

  const scheduleSync = useCallback(
    async (
      files: readonly File[],
      mediaType: "image" | "video",
      metadataByIndex?: readonly Record<string, unknown>[],
    ) => {
      if (!enabled) return;

      const operationVersion = operationVersionRef.current + 1;
      operationVersionRef.current = operationVersion;
      resetMissionReadiness();
      activeUploadFailureRef.current = "";
      operationAbortRef.current?.abort();
      const controller = new AbortController();
      operationAbortRef.current = controller;
      const previousTask = activeTaskRef.current;

      const task = (async () => {
        await previousTask.catch(() => undefined);
        if (operationVersion !== operationVersionRef.current) return;

        const workspace = await ensureWorkspace();
        if (!workspace || operationVersion !== operationVersionRef.current) return;

        await clearMediaPublicationWorkspace({
          workspaceId: workspace.workspaceId,
          reason: files.length
            ? `activate_${mediaType}_media`
            : "remove_all_media",
          signal: controller.signal,
        });
        if (operationVersion !== operationVersionRef.current) return;
        setMediaStates({});
        if (!files.length) return;

        const entries = files.map((file, position) => ({
          file,
          position,
          localKey: buildWorkspaceMediaClientKey(
            workspace.clientWorkspaceKey,
            file,
          ),
        }));
        setMediaStates(
          Object.fromEntries(
            entries.map(({ localKey, position }) => [
              localKey,
              {
                localKey,
                mediaId: null,
                mediaType,
                position,
                status: "queued" as const,
                progress: 0,
                storagePath: "",
                error: "",
              },
            ]),
          ),
        );

        let nextPosition = 0;
        const uploadNext = async () => {
          while (nextPosition < entries.length) {
            const entryIndex = nextPosition;
            nextPosition += 1;
            if (operationVersion !== operationVersionRef.current) return;
            const { file, position, localKey } = entries[entryIndex];
            const rawSettings = asRecord(metadataByIndex?.[position]);
            const nestedSource = asRecord(rawSettings.source_metadata);
            const sourceMetadata = buildBoosterSourceMediaMetadata({
              file,
              mediaType,
              creationMode: creationModeRef.current,
              source: Object.keys(nestedSource).length
                ? nestedSource
                : rawSettings,
              mediaSettings: rawSettings,
            });

            try {
              const result = await uploadUniversalMediaFile(file, {
                target: "workspace_source",
                workspaceId: workspace.workspaceId,
                workspacePosition: position,
                clientMediaKey: localKey,
                source: "booster_workspace",
                persistProgress: true,
                signal: controller.signal,
                metadata: {
                  ...sourceMetadata,
                  selected_channels: selectedChannelsRef.current,
                  media_settings: rawSettings,
                  source_metadata: sourceMetadata,
                  inserted_from: "booster",
                  inserted_at: new Date().toISOString(),
                },
                onProgress: (progress) => {
                  if (operationVersion !== operationVersionRef.current) return;
                  setMediaStates((current) => ({
                    ...current,
                    [localKey]: {
                      ...(current[localKey] || {
                        localKey,
                        mediaId: null,
                        mediaType,
                        position,
                        storagePath: "",
                        error: "",
                      }),
                      status: "uploading",
                      progress: progress.percent,
                    },
                  }));
                },
              });
              if (operationVersion !== operationVersionRef.current) return;
              setMediaStates((current) => ({
                ...current,
                [localKey]: {
                  localKey,
                  mediaId: result.mediaId,
                  mediaType,
                  position,
                  status: "ready",
                  progress: 100,
                  storagePath: result.storagePath,
                  error: "",
                },
              }));
            } catch (error) {
              if (
                isAbortError(error) ||
                operationVersion !== operationVersionRef.current
              ) {
                return;
              }
              const message =
                error instanceof Error
                  ? error.message
                  : "L’envoi immédiat du média a échoué.";
              activeUploadFailureRef.current = message;
              setMediaStates((current) => ({
                ...current,
                [localKey]: {
                  ...(current[localKey] || {
                    localKey,
                    mediaId: null,
                    mediaType,
                    position,
                    storagePath: "",
                  }),
                  status: "failed",
                  progress: 0,
                  error: message,
                },
              }));
              onError?.(message);
            }
          }
        };

        const uploadConcurrency = Math.min(
          mediaType === "video" ? 1 : 3,
          entries.length,
        );
        await Promise.all(
          Array.from({ length: uploadConcurrency }, () => uploadNext()),
        );

        if (
          operationVersion === operationVersionRef.current &&
          !activeUploadFailureRef.current
        ) {
          if (
            mediaType === "image" &&
            entries.some(({ file }) => requiresBoosterServerImagePreview(file))
          ) {
            await prepareMediaWorkspaceSourcePreviews({
              workspaceId: workspace.workspaceId,
              signal: controller.signal,
            }).catch((error) => {
              if (!isAbortError(error)) {
                console.warn(
                  "[media-pipeline] interface thumbnail deferred",
                  error,
                );
              }
            });
          }
          await refreshPreparedMedia(workspace.workspaceId).catch((error) => {
            if (!isAbortError(error)) {
              console.warn("[media-pipeline] source snapshot deferred", error);
            }
          });
        }
      })().catch((error) => {
        if (!isAbortError(error)) {
          onError?.(
            error instanceof Error
              ? error.message
              : "Impossible de synchroniser l’espace média.",
          );
        }
      });

      activeTaskRef.current = task;
      await task;
    },
    [enabled, ensureWorkspace, onError, refreshPreparedMedia, resetMissionReadiness],
  );

  const syncImages = useCallback(
    async (
      files: readonly File[],
      metadataByIndex?: readonly Record<string, unknown>[],
    ) => await scheduleSync(files, "image", metadataByIndex),
    [scheduleSync],
  );

  const syncVideo = useCallback(
    async (file: File | null, metadata?: Record<string, unknown>) =>
      await scheduleSync(file ? [file] : [], "video", metadata ? [metadata] : []),
    [scheduleSync],
  );

  const runPreparationMission = useCallback(
    async (
      mission: "ai_preparation" | "publication_preparation",
    ): Promise<MediaWorkspacePreparationResult> => {
      if (!enabled) {
        throw new Error("Le workspace média persistant n’est pas activé.");
      }
      await activeTaskRef.current;
      if (activeUploadFailureRef.current) {
        throw new Error(activeUploadFailureRef.current);
      }
      const workspace = await ensureWorkspace();
      if (!workspace) {
        throw new Error("Impossible de préparer l’espace média.");
      }

      const existing = activePreparationRef.current[mission];
      if (existing) return await existing;

      const operationVersion = operationVersionRef.current;
      let task: Promise<MediaWorkspacePreparationResult>;
      task = prepareMediaPublicationWorkspace({
        workspaceId: workspace.workspaceId,
        mission,
      })
        .then(async (result) => {
          if (result.status === "ready") {
            missionReadyRef.current[mission] = true;
          }
          if (operationVersion === operationVersionRef.current) {
            await refreshPreparedMedia(workspace.workspaceId).catch(() => undefined);
          }
          return result;
        })
        .finally(() => {
          if (activePreparationRef.current[mission] === task) {
            delete activePreparationRef.current[mission];
          }
        });
      activePreparationRef.current[mission] = task;
      return await task;
    },
    [enabled, ensureWorkspace, refreshPreparedMedia],
  );

  const prepareAiMedia = useCallback(async () => {
    if (creationModeRef.current !== "ai") {
      throw new Error(
        "La préparation IA est disponible uniquement dans le mode Créer avec iNrCy.",
      );
    }
    return await runPreparationMission("ai_preparation");
  }, [runPreparationMission]);

  const preparePublicationMedia = useCallback(
    async () => await runPreparationMission("publication_preparation"),
    [runPreparationMission],
  );

  const preparePublicationVariants = useCallback(
    async (settings?: PublicationPreparationSettings) => {
      if (settings?.imageSettingsByChannel) {
        imageSettingsByChannelRef.current = settings.imageSettingsByChannel;
      }
      if (settings?.videoSettingsByChannel) {
        videoSettingsByChannelRef.current = settings.videoSettingsByChannel;
      }
      const workspaceId = referenceRef.current?.workspaceId;
      if (!enabled || !workspaceId) return;
      if (
        settings?.deferUntilReady &&
        !missionReadyRef.current.publication_preparation
      ) {
        return;
      }
      return await prewarmMediaPublicationWorkspace({
        workspaceId,
        selectedChannels:
          settings?.selectedChannels || selectedChannelsRef.current,
        imageSettingsByChannel: imageSettingsByChannelRef.current,
        videoSettingsByChannel: videoSettingsByChannelRef.current,
        generateMissingVideoVariants:
          settings?.generateMissingVideoVariants,
        allowOriginalVideoFallback: settings?.allowOriginalVideoFallback,
      });
    },
    [enabled],
  );

  const clearWorkspaceMedia = useCallback(
    async () => await scheduleSync([], "image"),
    [scheduleSync],
  );

  const linkDraft = useCallback(
    async (nextDraftId: string) => {
      if (!enabled || !nextDraftId) return;
      const workspace = await ensureWorkspace();
      if (!workspace) return;
      await linkMediaPublicationWorkspaceDraft({
        workspaceId: workspace.workspaceId,
        draftId: nextDraftId,
      });
    },
    [enabled, ensureWorkspace],
  );

  const waitForIdle = useCallback(
    async (onProgress?: (progress: number, label: string) => void) => {
      while (true) {
        if (activeUploadFailureRef.current) {
          throw new Error(activeUploadFailureRef.current);
        }
        const states = Object.values(mediaStatesRef.current).sort(
          (a, b) => a.position - b.position,
        );
        const total = states.length;
        const averageProgress = total
          ? Math.round(
              states.reduce(
                (sum, item) =>
                  sum +
                  (item.status === "ready"
                    ? 100
                    : Math.max(0, Math.min(100, item.progress || 0))),
                0,
              ) / total,
            )
          : 0;
        const queuedCount = states.filter(
          (item) => item.status === "queued",
        ).length;
        const uploadingCount = states.filter(
          (item) => item.status === "uploading",
        ).length;
        const failedCount = states.filter((item) => item.status === "failed")
          .length;

        if (onProgress) {
          if (failedCount > 0) {
            onProgress(
              averageProgress,
              "Un ou plusieurs médias ont échoué pendant l’envoi.",
            );
          } else if (queuedCount > 0 && uploadingCount === 0) {
            onProgress(
              averageProgress,
              total > 1
                ? "Initialisation des envois sécurisés..."
                : "Initialisation de l’envoi sécurisé...",
            );
          } else if (uploadingCount > 0 || queuedCount > 0) {
            onProgress(
              averageProgress,
              total > 1
                ? `Upload des médias ${averageProgress}%`
                : `Upload du média ${averageProgress}%`,
            );
          } else if (total > 0) {
            onProgress(
              100,
              total > 1 ? "Upload des médias terminé" : "Upload du média terminé",
            );
          }
        }

        const settled = await Promise.race<"done" | "tick">([
          activeTaskRef.current
            .then(() => "done" as const)
            .catch(() => "done" as const),
          new Promise<"tick">((resolve) =>
            window.setTimeout(() => resolve("tick"), 220),
          ),
        ]);
        if (settled === "done") break;
      }

      await activeTaskRef.current.catch(() => undefined);
      if (activeUploadFailureRef.current) {
        throw new Error(activeUploadFailureRef.current);
      }
      const failedMedia = Object.values(mediaStatesRef.current).find(
        (item) => item.status === "failed",
      );
      if (failedMedia) {
        throw new Error(failedMedia.error || "L’envoi du média a échoué.");
      }
    },
    [],
  );

  const archiveWorkspace = useCallback(async () => {
    if (!enabled) return;
    operationVersionRef.current += 1;
    resetMissionReadiness();
    operationAbortRef.current?.abort();
    await activeTaskRef.current.catch(() => undefined);
    const workspace = referenceRef.current;
    if (!workspace) return;
    await archiveMediaPublicationWorkspace({
      workspaceId: workspace.workspaceId,
    });
    clearBoosterWorkspaceClientKey();
  }, [enabled, resetMissionReadiness]);

  useEffect(() => {
    mediaStatesRef.current = mediaStates;
  }, [mediaStates]);

  useEffect(() => {
    selectedChannelsRef.current = selectedChannels;
  }, [selectedChannels]);

  useEffect(() => {
    imageSettingsByChannelRef.current = imageSettingsByChannel;
  }, [imageSettingsByChannel]);

  useEffect(() => {
    creationModeRef.current = creationMode;
  }, [creationMode]);

  useEffect(() => {
    onPreparedMediaRef.current = onPreparedMedia;
  }, [onPreparedMedia]);

  useEffect(() => {
    resolveClientWorkspaceKey();
  }, [resolveClientWorkspaceKey]);

  useEffect(() => {
    return () => {
      operationVersionRef.current += 1;
      operationAbortRef.current?.abort();
    };
  }, []);

  return {
    enabled,
    workspaceId: reference?.workspaceId || null,
    clientWorkspaceKey:
      reference?.clientWorkspaceKey || clientWorkspaceKey || null,
    mediaStates,
    ensureWorkspace,
    adoptWorkspace,
    syncImages,
    syncVideo,
    prepareAiMedia,
    preparePublicationMedia,
    preparePublicationVariants,
    // Alias conservé pendant la transition : il représente désormais
    // explicitement la mission 3 et n'est jamais déclenché à l'ajout.
    prewarmWorkspace: preparePublicationVariants,
    clearWorkspaceMedia,
    linkDraft,
    waitForIdle,
    archiveWorkspace,
  };
}
