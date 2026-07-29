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
  onError?: (message: string) => void;
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
  onError,
}: UsePersistentMediaWorkspaceParams) {
  const enabled = isUniversalMediaWorkspaceEnabled();
  const [reference, setReference] = useState<MediaWorkspaceReference | null>(
    null,
  );
  const [mediaStates, setMediaStates] = useState<
    Record<string, PersistentWorkspaceMediaState>
  >({});
  const mediaStatesRef = useRef<Record<string, PersistentWorkspaceMediaState>>({});
  const referenceRef = useRef<MediaWorkspaceReference | null>(null);
  const ensurePromiseRef = useRef<Promise<MediaWorkspaceReference> | null>(null);
  const clientWorkspaceKeyRef = useRef("");
  const operationVersionRef = useRef(0);
  const operationAbortRef = useRef<AbortController | null>(null);
  const activeTaskRef = useRef<Promise<void>>(Promise.resolve());

  if (!clientWorkspaceKeyRef.current && typeof window !== "undefined") {
    clientWorkspaceKeyRef.current = getOrCreateBoosterWorkspaceClientKey(draftId);
  }

  const ensureWorkspace = useCallback(async () => {
    if (!enabled) return null;
    if (referenceRef.current) return referenceRef.current;
    if (ensurePromiseRef.current) return await ensurePromiseRef.current;

    const clientWorkspaceKey =
      clientWorkspaceKeyRef.current || getOrCreateBoosterWorkspaceClientKey(draftId);
    clientWorkspaceKeyRef.current = clientWorkspaceKey;
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
  }, [draftId, enabled, selectedChannels]);

  const adoptWorkspace = useCallback(
    (workspaceId: unknown, clientWorkspaceKey?: unknown) => {
      const cleanWorkspaceId = String(workspaceId || "").trim();
      if (!cleanWorkspaceId) return;
      const cleanClientKey = String(clientWorkspaceKey || "").trim();
      const next: MediaWorkspaceReference = {
        workspaceId: cleanWorkspaceId,
        clientWorkspaceKey:
          cleanClientKey ||
          clientWorkspaceKeyRef.current ||
          getOrCreateBoosterWorkspaceClientKey(draftId),
      };
      operationVersionRef.current += 1;
      operationAbortRef.current?.abort();
      operationAbortRef.current = null;
      ensurePromiseRef.current = null;
      clientWorkspaceKeyRef.current = next.clientWorkspaceKey;
      referenceRef.current = next;
      setReference(next);
    },
    [draftId],
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

        for (let position = 0; position < files.length; position += 1) {
          if (operationVersion !== operationVersionRef.current) return;
          const file = files[position];
          const localKey = buildWorkspaceMediaClientKey(
            workspace.clientWorkspaceKey,
            file,
          );
          setMediaStates((current) => ({
            ...current,
            [localKey]: {
              localKey,
              mediaId: null,
              mediaType,
              position,
              status: "queued",
              progress: 0,
              storagePath: "",
              error: "",
            },
          }));

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
            onError?.(
              "L’envoi immédiat du média a été interrompu. Le pipeline historique reste disponible au moment de publier.",
            );
            return;
          }
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
    [enabled, ensureWorkspace, onError, selectedChannels],
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
    return () => {
      operationVersionRef.current += 1;
      operationAbortRef.current?.abort();
    };
  }, []);

  return {
    enabled,
    workspaceId: reference?.workspaceId || null,
    clientWorkspaceKey:
      reference?.clientWorkspaceKey || clientWorkspaceKeyRef.current || null,
    mediaStates,
    ensureWorkspace,
    adoptWorkspace,
    syncImages,
    syncVideo,
    clearWorkspaceMedia,
    linkDraft,
    waitForIdle,
    archiveWorkspace,
  };
}
