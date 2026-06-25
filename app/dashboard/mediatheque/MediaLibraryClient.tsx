"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
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

type EditDraft = {
  title: string;
  tags: string;
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  const selectedFiles = files;
  const selectedStats = useMemo(() => {
    const images = selectedFiles.filter(isImageFile).length;
    const videos = selectedFiles.filter(isVideoFile).length;
    const bytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    return { images, videos, bytes };
  }, [selectedFiles]);

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
      setStats(
        json.stats ?? {
          total: nextItems.length,
          images: 0,
          videos: 0,
          total_bytes: 0,
        },
      );
      setEditDrafts((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          if (!next[item.id]) {
            next[item.id] = {
              title: item.title || "",
              tags: tagsToText(item.tags),
            };
          }
        }
        return next;
      });
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

  async function patchItem(
    id: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/media-library/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const json = await readApiJson(response, "Mise à jour impossible.");
      if (!response.ok)
        throw new Error(json?.error || "Mise à jour impossible.");
      setSuccess(successMessage);
      await loadItems();
    } catch (e: any) {
      setError(e?.message || "Mise à jour impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveMetadata(item: MediaItem) {
    const draft = editDrafts[item.id];
    if (!draft) return;
    await patchItem(
      item.id,
      {
        title: draft.title,
        tags: cleanEditableTags(draft.tags),
      },
      "Média mis à jour.",
    );
    setEditingId(null);
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
      const response = await fetch(
        `/api/media-library/items?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      const json = await readApiJson(response, "Suppression impossible.");
      if (!response.ok)
        throw new Error(json?.error || "Suppression impossible.");
      setSuccess("Média supprimé.");
      await loadItems();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setEditDrafts((prev) => ({
      ...prev,
      [id]: {
        title: prev[id]?.title ?? "",
        tags: prev[id]?.tags ?? "",
        [field]: value,
      },
    }));
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroIcon} aria-hidden="true">
            🖼️
          </div>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>Médiathèque</div>
            <h1 className={styles.title}>Vos images et vidéos iNrCy</h1>
            <p className={styles.subtitle}>
              Stockez vos réalisations, photos, logos et vidéos. iNrAgent pourra
              privilégier ces médias avant la banque d’images iNrCy.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={loadItems}
              disabled={loading}
            >
              <span aria-hidden="true">↻</span>
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
            <Link href="/dashboard" className={styles.closeButton}>
              Fermer
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

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

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
              <div className={styles.mediaGrid}>
                {items.map((item) => {
                  const draft = editDrafts[item.id] ?? {
                    title: item.title || "",
                    tags: tagsToText(item.tags),
                  };
                  const isEditing = editingId === item.id;
                  return (
                    <article
                      key={item.id}
                      className={`${styles.mediaCard} ${item.is_active === false ? styles.mediaCardDisabled : ""}`}
                    >
                      <button
                        type="button"
                        className={styles.previewButton}
                        onClick={() => setPreviewItem(item)}
                        aria-label="Agrandir le média"
                      >
                        {item.media_type === "video" ? (
                          <video
                            src={item.signed_url || undefined}
                            className={styles.mediaThumb}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : item.signed_url ? (
                          <img
                            src={item.signed_url}
                            alt={item.title || "Média"}
                            className={styles.mediaThumb}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.noPreview}>
                            Aperçu indisponible
                          </div>
                        )}
                        <span className={styles.mediaTypeBadge}>
                          {item.media_type === "video" ? "Vidéo" : "Image"}
                        </span>
                      </button>

                      <div className={styles.mediaBody}>
                        {isEditing ? (
                          <>
                            <input
                              className={styles.inlineInput}
                              value={draft.title}
                              onChange={(event) =>
                                updateDraft(
                                  item.id,
                                  "title",
                                  event.target.value,
                                )
                              }
                              placeholder="Titre"
                            />
                            <input
                              className={styles.inlineInput}
                              value={draft.tags}
                              onChange={(event) =>
                                updateDraft(item.id, "tags", event.target.value)
                              }
                              placeholder="Tags séparés par virgules"
                            />
                          </>
                        ) : (
                          <>
                            <h3>{item.title || "Média sans titre"}</h3>
                            <p>{tagsToText(item.tags) || "Aucun tag"}</p>
                          </>
                        )}

                        <div className={styles.metaRow}>
                          <span>{formatBytes(item.size_bytes)}</span>
                          <span>
                            {item.media_type === "video"
                              ? formatDuration(item.duration_seconds)
                              : item.width && item.height
                                ? `${item.width}×${item.height}`
                                : "—"}
                          </span>
                          <span>{formatDate(item.created_at)}</span>
                        </div>

                        <div className={styles.cardActions}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className={styles.smallButton}
                                onClick={() => saveMetadata(item)}
                                disabled={savingId === item.id}
                              >
                                Enregistrer
                              </button>
                              <button
                                type="button"
                                className={styles.smallGhostButton}
                                onClick={() => setEditingId(null)}
                              >
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={styles.smallButton}
                                onClick={() => setEditingId(item.id)}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className={styles.smallGhostButton}
                                onClick={() =>
                                  patchItem(
                                    item.id,
                                    { is_active: item.is_active === false },
                                    item.is_active === false
                                      ? "Média réactivé."
                                      : "Média masqué.",
                                  )
                                }
                                disabled={savingId === item.id}
                              >
                                {item.is_active === false
                                  ? "Réactiver"
                                  : "Masquer"}
                              </button>
                              <button
                                type="button"
                                className={styles.smallDangerButton}
                                onClick={() => deleteItem(item)}
                                disabled={savingId === item.id}
                              >
                                Supprimer
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

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
