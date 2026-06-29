"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES,
  INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES,
  INR_MEDIA_IMAGE_MAX_BYTES,
  INR_MEDIA_IMAGE_MAX_MB_LABEL,
  INR_MEDIA_UPLOAD_BATCH_SIZE,
  INR_MEDIA_VIDEO_SOURCE_MAX_BYTES,
  INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL,
} from "@/lib/mediaRules";
import styles from "./mediaLibrary.module.css";

type MediaTypeFilter = "all" | "image" | "video";
type ActiveFilter = "active" | "inactive" | "all";

type MediaItem = {
  id: string;
  bucket_name: string | null;
  storage_path: string;
  media_type: "image" | "video";
  mime_type: string | null;
  size_bytes: number | null;
  title: string | null;
  tags: string[] | null;
  source: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_active: boolean | null;
  usage_count: number | null;
  last_used_at: string | null;
  created_at: string;
  signed_url: string | null;
};

type UploadPrepareItem = {
  client_id: string;
  original_name: string;
  bucket: string;
  storage_path: string;
  token: string;
  content_type: string;
  media_type: "image" | "video";
};

type UploadFinalizeItem = {
  client_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
};


const MAX_IMAGE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_VIDEO_BYTES = INR_MEDIA_VIDEO_SOURCE_MAX_BYTES;
const MAX_IMAGE_MB_LABEL = INR_MEDIA_IMAGE_MAX_MB_LABEL;
const MAX_VIDEO_MB_LABEL = INR_MEDIA_VIDEO_SOURCE_MAX_MB_LABEL;
const UPLOAD_BATCH_SIZE = INR_MEDIA_UPLOAD_BATCH_SIZE;
const ALLOWED_IMAGE_TYPES = new Set<string>(INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES);
const ALLOWED_VIDEO_TYPES = new Set<string>(INR_MEDIA_ALLOWED_VIDEO_MIME_TYPES);

async function readApiJson(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => ({ error: fallbackMessage }));
  }

  const text = await response.text().catch(() => "");
  return { error: text.trim() || fallbackMessage };
}

function formatUploadName(file: File) {
  return file.name || "media-inrcy";
}

function getClientFileId(file: File, index: number) {
  return `${index}-${file.name}-${file.size}-${file.lastModified}`;
}

function chunkFiles<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isImageFile(file: File) {
  return ALLOWED_IMAGE_TYPES.has(file.type);
}

function isVideoFile(file: File) {
  return ALLOWED_VIDEO_TYPES.has(file.type);
}

function validateUploadFiles(selectedFiles: File[]) {
  for (const file of selectedFiles) {
    if (!isImageFile(file) && !isVideoFile(file)) {
      throw new Error(
        `${formatUploadName(file)} : format non autorisé. Utilise JPG, PNG, WebP, MP4, WebM ou MOV.`,
      );
    }
    if (isImageFile(file) && file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `${formatUploadName(file)} : image trop lourde. Maximum ${MAX_IMAGE_MB_LABEL}.`,
      );
    }
    if (isVideoFile(file) && file.size > MAX_VIDEO_BYTES) {
      throw new Error(
        `${formatUploadName(file)} : vidéo trop lourde. Maximum ${MAX_VIDEO_MB_LABEL}.`,
      );
    }
  }
}

function getImageDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    image.src = url;
  });
}

function getVideoInfo(
  file: File,
): Promise<{
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration_seconds: Number.isFinite(video.duration)
          ? video.duration
          : null,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null, duration_seconds: null });
    };
    video.src = url;
  });
}

async function getMediaInfo(file: File) {
  if (isImageFile(file)) {
    const dimensions = await getImageDimensions(file);
    return { ...dimensions, duration_seconds: null };
  }
  return getVideoInfo(file);
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function tagsToText(tags: string[] | null | undefined) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function cleanEditableTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}

export default function MediaLibraryClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    images: 0,
    videos: 0,
    total_bytes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [search, setSearch] = useState("");
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [helperOpen, setHelperOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  );

  const selectedFiles = files;
  const selectedStats = useMemo(() => {
    const images = selectedFiles.filter(isImageFile).length;
    const videos = selectedFiles.filter(isVideoFile).length;
    const bytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    return { images, videos, bytes };
  }, [selectedFiles]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.has(item.id)),
    [items, selectedItemIds],
  );
  const selectedItemCount = selectedItems.length;
  const allVisibleItemsSelected =
    items.length > 0 && items.every((item) => selectedItemIds.has(item.id));
  const bulkDeleting = savingId === "__bulk__";

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "180");
      params.set("type", typeFilter);
      params.set("active", activeFilter);
      if (search.trim()) params.set("q", search.trim());

      const response = await fetch(
        `/api/media-library/items?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = await readApiJson(
        response,
        "Impossible de charger la médiathèque.",
      );
      if (!response.ok)
        throw new Error(json?.error || "Impossible de charger la médiathèque.");

      const nextItems = (json.items ?? []) as MediaItem[];
      setItems(nextItems);
      setSelectedItemIds((prev) => {
        const visibleIds = new Set(nextItems.map((item) => item.id));
        return new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      });
      setStats(
        json.stats ?? {
          total: nextItems.length,
          images: 0,
          videos: 0,
          total_bytes: 0,
        },
      );
    } catch (e: any) {
      setError(e?.message || "Impossible de charger la médiathèque.");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search, typeFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  function mergeSelectedFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) return;
    setError(null);
    setSuccess(null);

    try {
      validateUploadFiles(nextFiles);
      const byKey = new Map<string, File>();
      for (const file of files) {
        byKey.set(getClientFileId(file, 0), file);
      }
      for (const file of nextFiles) {
        byKey.set(getClientFileId(file, 0), file);
      }
      const merged = Array.from(byKey.values());
      validateUploadFiles(merged);
      setFiles(merged);
      setFileInputKey((value) => value + 1);
    } catch (e: any) {
      setFileInputKey((value) => value + 1);
      setError(e?.message || "Fichier non autorisé.");
    }
  }

  function removeSelectedFile(indexToRemove: number) {
    setFiles((current) =>
      current.filter((_, index) => index !== indexToRemove),
    );
    setFileInputKey((value) => value + 1);
  }

  function clearSelectedFiles() {
    setFiles([]);
    setFileInputKey((value) => value + 1);
  }

  function onDropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    mergeSelectedFiles(Array.from(event.dataTransfer.files || []));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setUploadProgress(null);

    if (selectedFiles.length === 0) {
      setError("Ajoute au moins une image ou une vidéo.");
      return;
    }

    const uploadFiles = selectedFiles;
    setUploading(true);
    setUploadPercent(0);

    try {
      validateUploadFiles(uploadFiles);
      const supabase = createClient();
      const batches = chunkFiles(uploadFiles, UPLOAD_BATCH_SIZE);
      let uploaded = 0;
      let failed = 0;
      let processed = 0;
      const failures: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        const startIndex = batchIndex * UPLOAD_BATCH_SIZE;
        setUploadProgress(
          `Préparation du lot ${batchNumber}/${batches.length}…`,
        );
        setUploadPercent(
          Math.max(2, Math.round((processed / uploadFiles.length) * 90)),
        );

        const prepareResponse = await fetch("/api/media-library/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "prepare",
            files: batch.map((file, localIndex) => ({
              client_id: getClientFileId(file, startIndex + localIndex),
              name: file.name,
              type: file.type,
              size: file.size,
              last_modified: file.lastModified,
            })),
          }),
        });
        const prepareJson = await readApiJson(
          prepareResponse,
          "Préparation de l’import impossible.",
        );
        if (!prepareResponse.ok)
          throw new Error(
            prepareJson?.error || "Préparation de l’import impossible.",
          );

        const preparedItems = (
          (prepareJson?.items ?? []) as UploadPrepareItem[]
        ).filter((item) => item?.token && item?.storage_path);
        const preparedById = new Map(
          preparedItems.map((item) => [item.client_id, item]),
        );
        const finalizeItems: UploadFinalizeItem[] = [];

        for (let localIndex = 0; localIndex < batch.length; localIndex += 1) {
          const file = batch[localIndex];
          const clientId = getClientFileId(file, startIndex + localIndex);
          const prepared = preparedById.get(clientId);
          if (!prepared) {
            processed += 1;
            failed += 1;
            setUploadPercent(
              Math.min(
                90,
                Math.max(5, Math.round((processed / uploadFiles.length) * 90)),
              ),
            );
            failures.push(
              `${formatUploadName(file)} : préparation impossible.`,
            );
            continue;
          }

          try {
            setUploadProgress(
              `Import du lot ${batchNumber}/${batches.length} · fichier ${localIndex + 1}/${batch.length}…`,
            );
            const info = await getMediaInfo(file);
            const { error: uploadError } = await supabase.storage
              .from(prepared.bucket || "inrcy-pro-media")
              .uploadToSignedUrl(prepared.storage_path, prepared.token, file, {
                contentType:
                  prepared.content_type ||
                  file.type ||
                  "application/octet-stream",
              });

            if (uploadError) throw uploadError;

            processed += 1;
            setUploadPercent(
              Math.min(
                90,
                Math.max(5, Math.round((processed / uploadFiles.length) * 90)),
              ),
            );

            finalizeItems.push({
              client_id: clientId,
              original_name: prepared.original_name || file.name,
              storage_path: prepared.storage_path,
              mime_type:
                prepared.content_type ||
                file.type ||
                "application/octet-stream",
              size_bytes: file.size,
              width: info.width,
              height: info.height,
              duration_seconds: info.duration_seconds,
            });
          } catch (uploadError: any) {
            processed += 1;
            failed += 1;
            setUploadPercent(
              Math.min(
                90,
                Math.max(5, Math.round((processed / uploadFiles.length) * 90)),
              ),
            );
            failures.push(
              `${formatUploadName(file)} : ${uploadError?.message || "upload Supabase impossible."}`,
            );
          }
        }

        if (finalizeItems.length > 0) {
          setUploadProgress(
            `Finalisation du lot ${batchNumber}/${batches.length}…`,
          );
          setUploadPercent(
            Math.max(92, Math.round((processed / uploadFiles.length) * 92)),
          );
          const finalizeResponse = await fetch("/api/media-library/upload", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "finalize",
              title,
              tags,
              source: "mediatheque",
              uploads: finalizeItems,
            }),
          });
          const finalizeJson = await readApiJson(
            finalizeResponse,
            "Finalisation de l’import impossible.",
          );
          if (!finalizeResponse.ok)
            throw new Error(
              finalizeJson?.error || "Finalisation de l’import impossible.",
            );
          uploaded += Number(finalizeJson?.uploaded || 0);
          failed += Number(finalizeJson?.failed || 0);
          const results = Array.isArray(finalizeJson?.results)
            ? finalizeJson.results
            : [];
          for (const result of results) {
            if (result && result.ok === false && result.original_name) {
              failures.push(
                `${result.original_name} : ${result.error || "finalisation impossible."}`,
              );
            }
          }
        }
      }

      setUploadPercent(100);
      setSuccess(
        `${uploaded} média(s) importé(s). ${failed ? `${failed} échec(s).` : ""}`.trim(),
      );
      if (failures.length > 0) setError(failures.slice(0, 4).join("\n"));
      setFiles([]);
      setFileInputKey((value) => value + 1);
      setTitle("");
      await loadItems();
    } catch (e: any) {
      setError(e?.message || "Import impossible.");
    } finally {
      setUploadProgress(null);
      setUploadPercent(null);
      setUploading(false);
    }
  }

  function toggleItemSelection(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleItemDetails(id: string) {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleMobileRowSelection(
    event: MouseEvent<HTMLElement>,
    item: MediaItem,
  ) {
    if (savingId === item.id || bulkDeleting) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 680px)").matches) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, label, select, textarea")) return;

    toggleItemSelection(item.id);
  }

  function toggleAllVisibleItems() {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allVisibleItemsSelected) {
        for (const item of items) next.delete(item.id);
      } else {
        for (const item of items) next.add(item.id);
      }
      return next;
    });
  }

  function clearItemSelection() {
    setSelectedItemIds(new Set());
  }

  function getDeleteUsageLabel(source: unknown) {
    if (source === "inr_agent_scheduled_action") return "Programmation iNrAgent";
    if (source === "publish_draft") return "Brouillon Publier";
    if (source === "mail_campaign") return "Campagne programmée";
    if (source === "send_item_draft") return "Brouillon iNrSend";
    return "Action iNrAgent";
  }

  function buildDeleteUsageConfirmMessage(payload: any, count: number) {
    const usages = Array.isArray(payload?.usages) ? payload.usages : [];
    const usageLines = usages
      .slice(0, 6)
      .map((usage: any) => {
        const title = String(usage?.title || "Élément iNrCy").trim();
        const label = getDeleteUsageLabel(usage?.source);
        const scheduledFor = usage?.scheduledFor
          ? ` · ${formatDate(String(usage.scheduledFor))}`
          : "";
        return `• ${label} : ${title}${scheduledFor}`;
      })
      .join("\n");
    const hiddenCount = Math.max(0, Number(payload?.usageCount || usages.length || 0) - 6);
    return [
      `Attention : ${count > 1 ? "un ou plusieurs médias sélectionnés sont utilisés" : "ce média est utilisé"} dans iNrAgent, une programmation, une campagne ou un brouillon.`,
      "",
      usageLines,
      hiddenCount ? `… et ${hiddenCount} autre(s) utilisation(s).` : "",
      "",
      "Si vous supprimez maintenant, ces actions, campagnes ou brouillons peuvent perdre leur média.",
      "Confirmer quand même la suppression définitive ?",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function requestMediaDelete(ids: string[], force = false): Promise<any> {
    const response = await fetch("/api/media-library/items", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, force }),
    });
    const json = await readApiJson(response, "Suppression impossible.");
    if (
      response.status === 409 &&
      json?.requiresConfirmation &&
      !force
    ) {
      const ok = window.confirm(buildDeleteUsageConfirmMessage(json, ids.length));
      if (!ok) return { ok: false, cancelled: true };
      return await requestMediaDelete(ids, true);
    }
    if (!response.ok) throw new Error(json?.error || "Suppression impossible.");
    return json;
  }

  async function deleteSelectedItems() {
    const ids = selectedItems.map((item) => item.id);
    if (!ids.length) return;

    const ok = window.confirm(
      `Supprimer définitivement ${ids.length} média(s) de votre médiathèque ?`,
    );
    if (!ok) return;

    setSavingId("__bulk__");
    setError(null);
    setSuccess(null);
    try {
      const json = await requestMediaDelete(ids);
      if (json?.cancelled) return;
      setSuccess(`${Number(json?.deleted || ids.length)} média(s) supprimé(s).`);
      clearItemSelection();
      await loadItems();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(item: MediaItem) {
    const ok = window.confirm(
      "Supprimer définitivement ce média de votre médiathèque ?",
    );
    if (!ok) return;
    setSavingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      const json = await requestMediaDelete([item.id]);
      if (json?.cancelled) return;
      setSuccess("Média supprimé.");
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      await loadItems();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroIcon} aria-hidden="true">
            🖼️
          </div>
          <div className={styles.heroContent}>
            <h1 className={styles.title}>
              <span className={styles.titleFull}>Vos images et vidéos iNrCy</span>
              <span className={styles.titleMobile}>Médiathèque iNrCy</span>
            </h1>
            <p className={styles.subtitle}>
              Médias privés pour vos publications et iNrAgent.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.helperButton}
              onClick={() => setHelperOpen(true)}
              aria-label="Aide médiathèque"
            >
              ?
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={loadItems}
              disabled={loading}
              aria-label={loading ? "Chargement de la médiathèque" : "Rafraîchir la médiathèque"}
            >
              <span className={styles.actionIcon} aria-hidden="true">↻</span>
              <span className={styles.actionText}>
                {loading ? "Chargement…" : "Rafraîchir"}
              </span>
            </button>
            <Link href="/dashboard" className={styles.closeButton} aria-label="Fermer la médiathèque">
              <span className={styles.closeText}>Fermer</span>
              <span className={styles.closeIcon} aria-hidden="true">×</span>
            </Link>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Médias</span>
            <strong className={styles.metricValue}>{stats.total}</strong>
            <small className={styles.metricSub}>éléments affichés</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Images</span>
            <strong className={styles.metricValue}>{stats.images}</strong>
            <small className={styles.metricSub}>JPG · PNG · WebP</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Vidéos</span>
            <strong className={styles.metricValue}>{stats.videos}</strong>
            <small className={styles.metricSub}>MP4 · WebM · MOV</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Poids affiché</span>
            <strong className={styles.metricValueSmall}>
              {formatBytes(stats.total_bytes)}
            </strong>
            <small className={styles.metricSub}>sur cette vue</small>
          </article>
        </section>

        <div className={styles.grid}>
          <form className={styles.card} onSubmit={onSubmit}>
            <div className={styles.cardHeader}>
              <h2>Importer dans ma médiathèque</h2>
              <p>
                Les médias restent privés et rattachés au compte du
                professionnel.
              </p>
            </div>

            <label
              className={`${styles.label} ${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
              }}
              onDrop={onDropFiles}
            >
              <span>Fichiers</span>
              <input
                key={fileInputKey}
                className={styles.fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
                multiple
                disabled={uploading}
                onChange={(event) =>
                  mergeSelectedFiles(Array.from(event.target.files || []))
                }
              />
              <small className={styles.helper}>
                {selectedFiles.length
                  ? `${selectedFiles.length} fichier(s) · ${selectedStats.images} image(s) · ${selectedStats.videos} vidéo(s) · ${formatBytes(selectedStats.bytes)}`
                  : `Glissez-déposez ou sélectionnez vos médias. Images ${MAX_IMAGE_MB_LABEL} max · Vidéos ${MAX_VIDEO_MB_LABEL} max · import par lots de ${UPLOAD_BATCH_SIZE}.`}
              </small>
            </label>

            {selectedFiles.length > 0 ? (
              <div className={styles.selectedFilesBox}>
                <div className={styles.selectedFilesHeader}>
                  <strong>Sélection prête à importer</strong>
                  <button
                    type="button"
                    className={styles.clearSelectionButton}
                    onClick={clearSelectedFiles}
                    disabled={uploading}
                  >
                    Vider
                  </button>
                </div>
                <div className={styles.selectedFilesList}>
                  {selectedFiles.map((file, index) => (
                    <div
                      key={getClientFileId(file, index)}
                      className={styles.selectedFileItem}
                    >
                      <span
                        className={styles.selectedFileIcon}
                        aria-hidden="true"
                      >
                        {isVideoFile(file) ? "🎬" : "🖼️"}
                      </span>
                      <span className={styles.selectedFileName}>
                        {file.name}
                      </span>
                      <span className={styles.selectedFileSize}>
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        className={styles.removeFileButton}
                        onClick={() => removeSelectedFile(index)}
                        disabled={uploading}
                        aria-label={`Retirer ${file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <label className={styles.label}>
              <span>Titre commun optionnel</span>
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex : Réalisations toiture 2026"
              />
            </label>

            <label className={styles.label}>
              <span>Tags</span>
              <input
                className={styles.input}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="chantier, avant-après, équipe, produit…"
              />
              <small className={styles.helper}>
                Les tags aideront iNrAgent à choisir le bon média.
              </small>
            </label>

            {uploadProgress ? (
              <div className={styles.uploadProgressBox} aria-live="polite">
                <span>{uploadProgress}</span>
                <div className={styles.progressTrack} aria-hidden="true">
                  <span
                    className={styles.progressFill}
                    style={{ width: `${uploadPercent ?? 8}%` }}
                  />
                </div>
              </div>
            ) : null}

            <button
              className={styles.primaryButton}
              type="submit"
              disabled={uploading || selectedFiles.length === 0}
            >
              {uploading ? "Import en cours…" : "Importer dans ma médiathèque"}
            </button>

            {(success || error) && (
              <div className={styles.formFeedback} aria-live="polite">
                {success ? <div className={styles.success}>{success}</div> : null}
                {error ? <div className={styles.error}>{error}</div> : null}
              </div>
            )}
          </form>

          <section className={styles.libraryCard}>
            <div className={styles.libraryHeader}>
              <div>
                <h2>Mes médias</h2>
                <p>
                  Photos et vidéos disponibles pour iNrAgent et vos futures
                  publications.
                </p>
              </div>
            </div>

            <div className={styles.filters}>
              <label>
                <span>Type</span>
                <select
                  className={styles.select}
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as MediaTypeFilter)
                  }
                >
                  <option value="all">Tous</option>
                  <option value="image">Images</option>
                  <option value="video">Vidéos</option>
                </select>
              </label>
              <label>
                <span>Statut</span>
                <select
                  className={styles.select}
                  value={activeFilter}
                  onChange={(event) =>
                    setActiveFilter(event.target.value as ActiveFilter)
                  }
                >
                  <option value="active">Actifs</option>
                  <option value="inactive">Masqués</option>
                  <option value="all">Tous</option>
                </select>
              </label>
              <label className={styles.searchLabel}>
                <span>Recherche</span>
                <input
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="titre, tag, fichier…"
                />
              </label>
              <button
                type="button"
                className={styles.applyButton}
                onClick={loadItems}
              >
                Appliquer
              </button>
            </div>

            <div className={styles.bulkToolbar}>
              <button
                type="button"
                className={styles.smallGhostButton}
                onClick={toggleAllVisibleItems}
                disabled={loading || items.length === 0 || bulkDeleting}
              >
                {allVisibleItemsSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              {selectedItemCount > 0 ? (
                <>
                  <span className={styles.selectedCount}>
                    {selectedItemCount} média(s) sélectionné(s)
                  </span>
                  <button
                    type="button"
                    className={styles.bulkDangerButton}
                    onClick={deleteSelectedItems}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? "Suppression…" : "Supprimer la sélection"}
                  </button>
                </>
              ) : null}
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                Chargement de votre médiathèque…
              </div>
            ) : items.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Aucun média pour le moment.</strong>
                <span>
                  Importez vos premières photos ou vidéos pour alimenter
                  iNrAgent.
                </span>
              </div>
            ) : (
              <div className={styles.mediaList}>
                <div className={styles.mediaListHead} aria-hidden="true">
                  <span></span>
                  <span>Média</span>
                  <span>Type</span>
                  <span>Poids</span>
                  <span>Format</span>
                  <span>Date</span>
                  <span></span>
                </div>
                {items.map((item) => {
                  const isSelected = selectedItemIds.has(item.id);
                  const detailsOpen = expandedItemIds.has(item.id);
                  const isSaving = savingId === item.id;
                  return (
                  <article
                    key={item.id}
                    className={`${styles.mediaRow} ${isSelected ? styles.mediaRowSelected : ""} ${detailsOpen ? styles.mediaRowDetailsOpen : ""} ${item.is_active === false ? styles.mediaRowDisabled : ""}`}
                    onClick={(event) => handleMobileRowSelection(event, item)}
                  >
                    <label
                      className={styles.rowCheck}
                      aria-label={`Sélectionner ${item.title || "ce média"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.id)}
                        disabled={isSaving || bulkDeleting}
                      />
                      <span aria-hidden="true" />
                    </label>
                    <div className={styles.mediaRowFile}>
                      <button
                        type="button"
                        className={styles.mediaRowPreview}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewItem(item);
                        }}
                        aria-label="Agrandir le média"
                      >
                        {item.media_type === "video" ? (
                          <video
                            src={item.signed_url || undefined}
                            className={styles.mediaRowThumb}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : item.signed_url ? (
                          <img
                            src={item.signed_url}
                            alt={item.title || "Média"}
                            className={styles.mediaRowThumb}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.noPreview}>Aperçu indisponible</div>
                        )}
                      </button>

                      <div className={styles.mediaRowMain}>
                        <strong>{item.title || "Média sans titre"}</strong>
                        <span>{tagsToText(item.tags) || "Aucun tag"}</span>
                      </div>
                    </div>

                    <div className={styles.mediaRowActionRail}>
                      {isSelected ? (
                        <span
                          className={styles.mediaRowSelectionBadge}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={styles.mediaRowDetailsButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleItemDetails(item.id);
                        }}
                        aria-label={detailsOpen ? "Masquer les détails" : "Afficher les détails"}
                        aria-expanded={detailsOpen}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className={styles.detailsChevron}
                        >
                          <path
                            d="M5.25 7.5 10 12.25 14.75 7.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>

                    <span className={styles.mediaRowPill} data-label="Type">
                      {item.media_type === "video" ? "Vidéo" : "Image"}
                    </span>
                    <span className={styles.mediaRowMeta} data-label="Poids">
                      {formatBytes(item.size_bytes)}
                    </span>
                    <span className={styles.mediaRowMeta} data-label="Format">
                      {item.media_type === "video"
                        ? formatDuration(item.duration_seconds)
                        : item.width && item.height
                          ? `${item.width}×${item.height}`
                          : "—"}
                    </span>
                    <span className={styles.mediaRowMeta} data-label="Date">
                      {formatDate(item.created_at)}
                    </span>

                    <button
                      type="button"
                      className={styles.mediaRowDelete}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteItem(item);
                      }}
                      disabled={isSaving || bulkDeleting}
                    >
                      Supprimer
                    </button>
                  </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {helperOpen ? (
        <div
          className={styles.helperOverlay}
          role="presentation"
          onClick={() => setHelperOpen(false)}
        >
          <div
            className={styles.helperModal}
            role="dialog"
            aria-modal="true"
            aria-label="Aide médiathèque iNrCy"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.helperClose}
              onClick={() => setHelperOpen(false)}
              aria-label="Fermer l’aide"
            >
              ×
            </button>
            <div className={styles.helperModalTop}>
              <div className={styles.helperModalIcon} aria-hidden="true">
                🖼️
              </div>
              <div className={styles.helperModalIntro}>
                <div className={styles.helperModalKicker}>Médiathèque iNrCy</div>
                <h2>Comment utiliser vos médias ?</h2>
                <p>
                  Vos photos, logos et vidéos restent privés. iNrAgent les utilise en
                  priorité pour préparer des publications plus authentiques.
                </p>
              </div>
            </div>
            <div className={styles.helperModalPills}>
              <span>🔒 Privé</span>
              <span>🖼️ Images {MAX_IMAGE_MB_LABEL}</span>
              <span>🎬 Vidéos {MAX_VIDEO_MB_LABEL}</span>
              <span>🤖 Priorité iNrAgent</span>
            </div>
            <div className={styles.helperModalGrid}>
              <div className={styles.helperInfoCard}>
                <strong>🔒 Médias privés</strong>
                <span>Chaque fichier reste rattaché au compte du professionnel.</span>
              </div>
              <div className={styles.helperInfoCard}>
                <strong>🖼️ Images</strong>
                <span>JPG, PNG ou WebP · {MAX_IMAGE_MB_LABEL} maximum par image.</span>
              </div>
              <div className={styles.helperInfoCard}>
                <strong>🎬 Vidéos</strong>
                <span>MP4, WebM ou MOV · {MAX_VIDEO_MB_LABEL} maximum par vidéo.</span>
              </div>
              <div className={styles.helperInfoCard}>
                <strong>🤖 iNrAgent</strong>
                <span>iNrAgent privilégie cette médiathèque avant la banque d’images iNrCy.</span>
              </div>
            </div>
            <div className={styles.helperModalFooter}>
              Importez vos meilleurs visuels ici pour qu’iNrAgent privilégie vos vrais médias.
            </div>
          </div>
        </div>
      ) : null}

      {previewItem ? (
        <div
          className={styles.previewOverlay}
          role="presentation"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className={styles.previewModal}
            role="dialog"
            aria-modal="true"
            aria-label="Aperçu du média"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.previewClose}
              onClick={() => setPreviewItem(null)}
              aria-label="Fermer"
            >
              ×
            </button>
            <div className={styles.previewMediaWrap}>
              {previewItem.media_type === "video" ? (
                <video
                  src={previewItem.signed_url || undefined}
                  controls
                  className={styles.previewMedia}
                />
              ) : (
                <img
                  src={previewItem.signed_url || ""}
                  alt={previewItem.title || "Média"}
                  className={styles.previewMedia}
                />
              )}
            </div>
            <div className={styles.previewInfo}>
              <strong>{previewItem.title || "Média sans titre"}</strong>
              <span>{tagsToText(previewItem.tags) || "Aucun tag"}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
