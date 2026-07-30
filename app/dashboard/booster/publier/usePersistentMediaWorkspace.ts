"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  prewarmMediaPublicationWorkspace,
  type MediaWorkspaceMediaSummary,
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
  selectedChannels: readonly string[];
  imageSettingsByChannel?: Record<string, unknown>;
  onError?: (message: string) => void;
  onPreparedMedia?: (media: readonly MediaWorkspaceMediaSummary[]) => void;
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    String((error as { name?: unknown })?.name || "") === "AbortError"
  );
}

export default function usePersistentMediaWorkspace({
  draftId,
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
  const backgroundPreparationTaskRef = useRef<Promise<void>>(Promise.resolve());
  const backgroundPreparationRunningRef = useRef(false);
  const backgroundPreparationRequestRef = useRef<{
    workspaceId: string;
    operationVersion: number;
  } | null>(null);
  const corePreparationReadyRef = useRef(false);
  const activeUploadFailureRef = useRef("");
  const selectedChannelsRef = useRef(selectedChannels);
  const imageSettingsByChannelRef = useRef(imageSettingsByChannel);
  const videoSettingsByChannelRef = useRef<
    Record<string, unknown> | undefined
  >(undefined);
  const onPreparedMediaRef = useRef(onPreparedMedia);

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
      selectedChannels,
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
  }, [draftId, enabled, resolveClientWorkspaceKey, selectedChannels]);

  const adoptWorkspace = useCallback(
    (workspaceId: unknown, clientWorkspaceKey?: unknown) => {
      const cleanWorkspaceId = String(workspaceId || "").trim();
      if (!cleanWorkspaceId) return;
      const cleanClientKey = String(clientWorkspaceKey || "").trim();
      const next: MediaWorkspaceReference = {
        workspaceId: cleanWorkspaceId,
        clientWorkspaceKey:
          cleanClientKey || resolveClientWorkspaceKey(),
      };
      operationVersionRef.current += 1;
      corePreparationReadyRef.current = false;
      operationAbortRef.current?.abort();
      operationAbortRef.current = null;
      ensurePromiseRef.current = null;
      clientWorkspaceKeyRef.current = next.clientWorkspaceKey;
      setClientWorkspaceKey(next.clientWorkspaceKey);
      referenceRef.current = next;
      setReference(next);
    },
    [resolveClientWorkspaceKey],
  );

  const queueBackgroundPreparation = useCallback(
    (workspaceId: string, operationVersion: number): Promise<void> => {
      backgroundPreparationRequestRef.current = {
        workspaceId,
        operationVersion,
      };
      if (backgroundPreparationRunningRef.current) {
        return backgroundPreparationTaskRef.current;
      }

      backgroundPreparationRunningRef.current = true;
      const run = (async () => {
        try {
          do {
            const request = backgroundPreparationRequestRef.current;
            backgroundPreparationRequestRef.current = null;
            if (!request) return;
            if (request.operationVersion !== operationVersionRef.current) {
              continue;
            }

            try {
              const preparation = await prepareMediaPublicationWorkspace({
                workspaceId: request.workspaceId,
              });
              if (
                request.operationVersion !== operationVersionRef.current ||
                preparation.status !== "ready"
              ) {
                continue;
              }
              corePreparationReadyRef.current = true;

              const snapshot = await loadMediaPublicationWorkspace({
                workspaceId: request.workspaceId,
                includeUrls: true,
              });
              if (request.operationVersion !== operationVersionRef.current) {
                continue;
              }
              onPreparedMediaRef.current?.(snapshot.media);

              // Les variantes propres aux réseaux sont calculées tant que le pro
              // travaille encore dans la modale. Une erreur ici ne bloque jamais
              // l’upload ni la préparation canonique.
              void prewarmMediaPublicationWorkspace({
                workspaceId: request.workspaceId,
                selectedChannels: selectedChannelsRef.current,
                imageSettingsByChannel: imageSettingsByChannelRef.current,
                videoSettingsByChannel: videoSettingsByChannelRef.current,
              }).catch((error) => {
                console.warn(
                  "[media-pipeline] background prewarm skipped",
                  error,
                );
              });
            } catch (error) {
              if (!isAbortError(error)) {
                console.warn(
                  "[media-pipeline] background preparation deferred",
                  error,
                );
              }
            }
          } while (backgroundPreparationRequestRef.current !== null);
        } finally {
          // Aucune attente entre la dernière condition de boucle et ce reset :
          // une nouvelle demande voit donc soit la boucle active, soit un worker
          // libre qu'elle peut relancer sans appel récursif.
          backgroundPreparationRunningRef.current = false;
        }
      })();

      backgroundPreparationTaskRef.current = run;
      return run;
    },
    [],
  );

  const scheduleSync = useCallback(
    async (
      files: readonly File[],
      mediaType: "image" | "video",
      metadataByIndex?: readonly Record<string, unknown>[],
    ) => {
      if (!enabled) return;

      const operationVersion = operationVersionRef.current + 1;
      operationVersionRef.current = operationVersion;
      corePreparationReadyRef.current = false;
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
                  selected_channels: selectedChannels,
                  media_settings: metadataByIndex?.[position] || {},
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
              void queueBackgroundPreparation(
                workspace.workspaceId,
                operationVersion,
              );
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
              continue;
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
        void queueBackgroundPreparation(
          workspace.workspaceId,
          operationVersion,
        );
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
    [
      enabled,
      ensureWorkspace,
      onError,
      queueBackgroundPreparation,
      selectedChannels,
    ],
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

  const prewarmWorkspace = useCallback(
    async (settings?: {
      imageSettingsByChannel?: Record<string, unknown>;
      videoSettingsByChannel?: Record<string, unknown>;
      deferUntilReady?: boolean;
    }) => {
      if (settings?.imageSettingsByChannel) {
        imageSettingsByChannelRef.current = settings.imageSettingsByChannel;
      }
      if (settings?.videoSettingsByChannel) {
        videoSettingsByChannelRef.current = settings.videoSettingsByChannel;
      }
      const workspaceId = referenceRef.current?.workspaceId;
      if (!enabled || !workspaceId) return;
      if (settings?.deferUntilReady && !corePreparationReadyRef.current) return;
      return await prewarmMediaPublicationWorkspace({
        workspaceId,
        selectedChannels: selectedChannelsRef.current,
        imageSettingsByChannel: imageSettingsByChannelRef.current,
        videoSettingsByChannel: videoSettingsByChannelRef.current,
      });
    },
    [enabled],
  );

  const clearWorkspaceMedia = useCallback(
    async () => await scheduleSync([], "image"),
    [scheduleSync],
  );

  const linkDraft = useCallback(async (nextDraftId: string) => {
    if (!enabled || !nextDraftId) return;
    const workspace = await ensureWorkspace();
    if (!workspace) return;
    await linkMediaPublicationWorkspaceDraft({
      workspaceId: workspace.workspaceId,
      draftId: nextDraftId,
    });
  }, [enabled, ensureWorkspace]);

  const waitForIdle = useCallback(
    async (
      onProgress?: (progress: number, label: string) => void,
    ) => {
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
        const uploadingCount = states.filter(
          (item) => item.status === "uploading" || item.status === "queued",
        ).length;
        const failedCount = states.filter((item) => item.status === "failed")
          .length;

        if (onProgress) {
          if (failedCount > 0) {
            onProgress(
              averageProgress,
              "Un ou plusieurs médias ont échoué pendant l’envoi.",
            );
          } else if (uploadingCount > 0) {
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
        throw new Error(
          failedMedia.error || "L’envoi du média a échoué.",
        );
      }
    },
    [],
  );

  const archiveWorkspace = useCallback(async () => {
    if (!enabled) return;
    operationVersionRef.current += 1;
    operationAbortRef.current?.abort();
    await activeTaskRef.current.catch(() => undefined);
    const workspace = referenceRef.current;
    if (!workspace) return;
    await archiveMediaPublicationWorkspace({
      workspaceId: workspace.workspaceId,
    });
    clearBoosterWorkspaceClientKey();
  }, [enabled]);

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
    const workspaceId = reference?.workspaceId;
    if (!enabled || !workspaceId || !imageSettingsByChannel) return;
    if (!corePreparationReadyRef.current) return;
    const timeoutId = window.setTimeout(() => {
      void prewarmMediaPublicationWorkspace({
        workspaceId,
        selectedChannels,
        imageSettingsByChannel,
      }).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timeoutId);
  }, [
    enabled,
    imageSettingsByChannel,
    reference?.workspaceId,
    selectedChannels,
  ]);

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
    prewarmWorkspace,
    clearWorkspaceMedia,
    linkDraft,
    waitForIdle,
    archiveWorkspace,
  };
}
