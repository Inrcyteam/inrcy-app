"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabaseClient";
import {
  INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES,
  INR_MEDIA_IMAGE_MAX_BYTES,
  INR_MEDIA_IMAGE_MAX_MB_LABEL,
  INR_MEDIA_UPLOAD_BATCH_SIZE,
} from "@/lib/mediaRules";
import styles from "./imageBank.module.css";

type ImageBankCategory = {
  id: string;
  sector_slug: string;
  sector_label: string;
  job_slug: string;
  job_label: string;
  storage_prefix: string;
  sort_order: number;
};

type ImageBankRow = {
  id: string;
  category_id: string | null;
  storage_path: string;
  title: string | null;
  sector: string | null;
  job: string | null;
  tags: string[] | null;
  orientation: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  source: string | null;
  source_url: string | null;
  license_ref: string | null;
  is_active: boolean | null;
  usage_count: number | null;
  created_at: string;
  signed_url: string | null;
  original_signed_url: string | null;
};

type ActiveFilter = "active" | "inactive" | "all";

type UploadPrepareItem = {
  client_id: string;
  original_name: string;
  storage_path: string;
  token: string;
  content_type: string;
};

type UploadFinalizeItem = {
  client_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

const MAX_IMAGE_BYTES = INR_MEDIA_IMAGE_MAX_BYTES;
const MAX_IMAGE_MB_LABEL = INR_MEDIA_IMAGE_MAX_MB_LABEL;
const UPLOAD_BATCH_SIZE = INR_MEDIA_UPLOAD_BATCH_SIZE;
const ALLOWED_IMAGE_TYPES = new Set<string>(INR_MEDIA_ALLOWED_IMAGE_MIME_TYPES);
const OPTIMIZED_IMAGE_MIME_TYPE = "image/webp";
const OPTIMIZED_IMAGE_MAX_SIZE = 1600;
const OPTIMIZED_IMAGE_QUALITY = 0.82;

function getOptimizedImageName(name: string) {
  const safeName = name || "image-inrcy";
  return safeName.replace(/\.[a-z0-9]{2,5}$/i, "") + ".webp";
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    image.src = url;
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      OPTIMIZED_IMAGE_MIME_TYPE,
      OPTIMIZED_IMAGE_QUALITY,
    );
  });
}

async function optimizeImageForUpload(file: File): Promise<File> {
  try {
    const image = await loadImageElement(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return file;

    const ratio = Math.min(
      1,
      OPTIMIZED_IMAGE_MAX_SIZE / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToWebpBlob(canvas);
    if (!blob || blob.size <= 0) return file;

    return new File([blob], getOptimizedImageName(file.name), {
      type: OPTIMIZED_IMAGE_MIME_TYPE,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

async function optimizeUploadFiles(selectedFiles: File[]) {
  const optimized: File[] = [];
  for (const file of selectedFiles) {
    optimized.push(await optimizeImageForUpload(file));
  }
  return optimized;
}

async function readApiJson(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => ({ error: fallbackMessage }));
  }

  const text = await response.text().catch(() => "");
  return { error: text.trim() || fallbackMessage };
}

function formatUploadName(file: File) {
  return file.name || "image-inrcy";
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

function validateUploadFiles(selectedFiles: File[]) {
  for (const file of selectedFiles) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error(
        `${formatUploadName(file)} : format non autorisé. Utilise JPG, PNG ou WebP.`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `${formatUploadName(file)} : image trop lourde. Maximum ${MAX_IMAGE_MB_LABEL} par image.`,
      );
    }
  }
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function toSafeFileNamePart(value: string, fallback = "selection") {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return cleaned || fallback;
}

function getZipDownloadName(
  category: ImageBankCategory | null,
  selectedCount: number,
) {
  const job = toSafeFileNamePart(category?.job_label || "images", "images");
  return `inrcy-banque-images-${job}-${selectedCount}-image${
    selectedCount > 1 ? "s" : ""
  }.zip`;
}

function groupBySector(categories: ImageBankCategory[]) {
  const map = new Map<
    string,
    { sector_slug: string; sector_label: string; jobs: ImageBankCategory[] }
  >();
  for (const category of categories) {
    const existing = map.get(category.sector_slug);
    if (existing) existing.jobs.push(category);
    else
      map.set(category.sector_slug, {
        sector_slug: category.sector_slug,
        sector_label: category.sector_label,
        jobs: [category],
      });
  }
  return Array.from(map.values());
}

export default function ImageBankAdminClient() {
  const [categories, setCategories] = useState<ImageBankCategory[]>([]);
  const [images, setImages] = useState<ImageBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [sectorSlug, setSectorSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("freepik");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseRef, setLicenseRef] = useState("");

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<
    "delete" | "download" | null
  >(null);

  const sectors = useMemo(() => groupBySector(categories), [categories]);
  const selectedSectorJobs = useMemo(() => {
    if (!sectorSlug) return [];
    return categories.filter((category) => category.sector_slug === sectorSlug);
  }, [categories, sectorSlug]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const selectedSector = useMemo(
    () => sectors.find((sector) => sector.sector_slug === sectorSlug) ?? null,
    [sectors, sectorSlug],
  );

  const currentImagesStats = useMemo(() => {
    const active = images.filter((image) => image.is_active !== false).length;
    return {
      active,
      inactive: images.length - active,
      totalBytes: images.reduce(
        (sum, image) => sum + (image.size_bytes || 0),
        0,
      ),
    };
  }, [images]);

  const selectedImageIdSet = useMemo(
    () => new Set(selectedImageIds),
    [selectedImageIds],
  );

  const selectedImages = useMemo(
    () => images.filter((image) => selectedImageIdSet.has(image.id)),
    [images, selectedImageIdSet],
  );

  const selectedCount = selectedImages.length;
  const allVisibleSelected =
    images.length > 0 && images.every((image) => selectedImageIdSet.has(image.id));

  const loadCategories = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/image-bank/categories", {
        cache: "no-store",
      });
      const json = await readApiJson(
        response,
        "Impossible de charger les métiers.",
      );
      if (!response.ok)
        throw new Error(json?.error || "Impossible de charger les métiers.");
      const nextCategories = (json.categories ?? []) as ImageBankCategory[];
      setCategories(nextCategories);
      if (!sectorSlug && nextCategories[0]) {
        setSectorSlug(nextCategories[0].sector_slug);
        setCategoryId(nextCategories[0].id);
      }
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les métiers.");
    } finally {
      setLoading(false);
    }
  }, [sectorSlug]);

  const loadImages = useCallback(
    async (nextCategoryId = categoryId) => {
      setImagesLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (nextCategoryId) params.set("category_id", nextCategoryId);
        params.set("limit", "120");
        params.set("active", activeFilter);
        if (sourceFilter !== "all") params.set("source", sourceFilter);
        if (search.trim()) params.set("q", search.trim());

        const response = await fetch(
          `/api/admin/image-bank/images?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await readApiJson(
          response,
          "Impossible de charger les images.",
        );
        if (!response.ok)
          throw new Error(json?.error || "Impossible de charger les images.");
        const nextImages = (json.images ?? []) as ImageBankRow[];
        setImages(nextImages);
        setSelectedImageIds([]);
      } catch (e: any) {
        setError(e?.message || "Impossible de charger les images.");
      } finally {
        setImagesLoading(false);
      }
    },
    [activeFilter, categoryId, search, sourceFilter],
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (categoryId) loadImages(categoryId);
  }, [categoryId, loadImages]);

  function onSectorChange(nextSector: string) {
    setSectorSlug(nextSector);
    const firstJob = categories.find(
      (category) => category.sector_slug === nextSector,
    );
    setCategoryId(firstJob?.id ?? "");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setUploadProgress(null);

    if (!categoryId) {
      setError("Choisis un métier.");
      return;
    }
    if (!files || files.length === 0) {
      setError("Ajoute au moins une image.");
      return;
    }

    const selectedFiles = Array.from(files);

    setUploading(true);
    try {
      validateUploadFiles(selectedFiles);
      setUploadProgress("Optimisation des images avant import…");
      const uploadFiles = await optimizeUploadFiles(selectedFiles);
      validateUploadFiles(uploadFiles);

      const supabase = createClient();
      const batches = chunkFiles(uploadFiles, UPLOAD_BATCH_SIZE);
      let uploaded = 0;
      let failed = 0;
      const failures: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        const startIndex = batchIndex * UPLOAD_BATCH_SIZE;
        setUploadProgress(
          `Préparation du lot ${batchNumber}/${batches.length}…`,
        );

        const prepareResponse = await fetch("/api/admin/image-bank/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "prepare",
            category_id: categoryId,
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
            failed += 1;
            failures.push(
              `${formatUploadName(file)} : préparation impossible.`,
            );
            continue;
          }

          try {
            setUploadProgress(
              `Import du lot ${batchNumber}/${batches.length} · image ${localIndex + 1}/${batch.length}…`,
            );
            const dimensions = await getImageDimensions(file);
            const { error: uploadError } = await supabase.storage
              .from("inrcy-image-bank")
              .uploadToSignedUrl(prepared.storage_path, prepared.token, file, {
                contentType: prepared.content_type || file.type || "image/jpeg",
              });

            if (uploadError) throw uploadError;

            finalizeItems.push({
              client_id: clientId,
              original_name: prepared.original_name || file.name,
              storage_path: prepared.storage_path,
              mime_type: prepared.content_type || file.type || "image/jpeg",
              size_bytes: file.size,
              width: dimensions.width,
              height: dimensions.height,
            });
          } catch (uploadError: any) {
            failed += 1;
            failures.push(
              `${formatUploadName(file)} : ${uploadError?.message || "upload Supabase impossible."}`,
            );
          }
        }

        if (finalizeItems.length > 0) {
          setUploadProgress(
            `Finalisation du lot ${batchNumber}/${batches.length}…`,
          );
          const finalizeResponse = await fetch("/api/admin/image-bank/upload", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "finalize",
              category_id: categoryId,
              tags,
              title,
              source,
              source_url: sourceUrl,
              license_ref: licenseRef,
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

      setSuccess(
        `${uploaded} image(s) importée(s). ${failed ? `${failed} échec(s).` : ""}`.trim(),
      );
      if (failures.length > 0) {
        setError(failures.slice(0, 4).join("\n"));
      }
      setFiles(null);
      setFileInputKey((value) => value + 1);
      setTitle("");
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Import impossible.");
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  }

  async function deleteImage(image: ImageBankRow) {
    const ok = window.confirm(
      "Supprimer définitivement cette image de la banque iNrCy ?",
    );
    if (!ok) return;

    setSavingId(image.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/admin/image-bank/images?id=${encodeURIComponent(image.id)}`,
        {
          method: "DELETE",
        },
      );
      const json = await readApiJson(response, "Suppression impossible.");
      if (!response.ok)
        throw new Error(json?.error || "Suppression impossible.");
      setSuccess("Image supprimée définitivement.");
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSavingId(null);
    }
  }

  function toggleImageSelection(imageId: string) {
    setSelectedImageIds((current) =>
      current.includes(imageId)
        ? current.filter((id) => id !== imageId)
        : [...current, imageId],
    );
  }

  function toggleVisibleSelection() {
    if (allVisibleSelected) {
      setSelectedImageIds([]);
      return;
    }

    setSelectedImageIds(images.map((image) => image.id));
  }

  async function deleteSelectedImages() {
    const ids = selectedImages.map((image) => image.id);
    if (!ids.length) return;

    const confirmationMessage = `Supprimer définitivement ${ids.length} image(s) sélectionnée(s) de la banque iNrCy ?`;
    if (ids.length >= 50) {
      const typed = window.prompt(
        `${confirmationMessage}\n\nPour confirmer cette suppression de masse, tape SUPPRIMER.`,
      );
      if (typed !== "SUPPRIMER") return;
    } else if (!window.confirm(confirmationMessage)) {
      return;
    }

    setBulkAction("delete");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/image-bank/images", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await readApiJson(response, "Suppression impossible.");
      if (!response.ok)
        throw new Error(json?.error || "Suppression impossible.");

      setSuccess(
        `${Number(json?.deleted || ids.length)} image(s) supprimée(s) définitivement.`,
      );
      setSelectedImageIds([]);
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setBulkAction(null);
    }
  }

  async function downloadSelectedImages() {
    const ids = selectedImages.map((image) => image.id);
    if (!ids.length) return;

    const filename = getZipDownloadName(selectedCategory, ids.length);
    setBulkAction("download");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/image-bank/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, filename }),
      });

      if (!response.ok) {
        const json = await readApiJson(
          response,
          "Téléchargement impossible.",
        );
        throw new Error(json?.error || "Téléchargement impossible.");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("Le ZIP généré est vide.");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setSuccess(`${ids.length} image(s) préparée(s) en téléchargement ZIP.`);
    } catch (e: any) {
      setError(e?.message || "Téléchargement impossible.");
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.heroCard}>
          <div className={styles.heroContent}>
            <div className={styles.kicker}>Dashboard admin</div>
            <h1 className={styles.title}>Banque d’images iNrCy</h1>
            <p className={styles.subtitle}>
              Gestion de la banque d’images privée.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.ghostButton} ${styles.refreshButton}`}
              onClick={() => loadImages(categoryId)}
              disabled={imagesLoading}
              aria-label="Rafraîchir"
            >
              <span className={styles.actionIcon} aria-hidden="true">
                ↻
              </span>
              <span className={styles.actionLabel}>
                {imagesLoading ? "Chargement…" : "Rafraîchir"}
              </span>
            </button>
            <Link
              href="/dashboard/admin"
              className={`${styles.closeButton} ${styles.closeIconButton}`}
              aria-label="Fermer"
            >
              <span className={styles.actionIcon} aria-hidden="true">
                ×
              </span>
              <span className={styles.actionLabel}>Fermer</span>
            </Link>
          </div>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Secteurs</span>
            <strong className={styles.metricValue}>{sectors.length}</strong>
            <small className={styles.metricSub}>Catalogue iNrCy</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Métiers</span>
            <strong className={styles.metricValue}>{categories.length}</strong>
            <small className={styles.metricSub}>Prêts à être alimentés</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Images actives</span>
            <strong className={styles.metricValue}>
              {currentImagesStats.active}
            </strong>
            <small className={styles.metricSub}>
              {currentImagesStats.inactive} inactive(s)
            </small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Poids affiché</span>
            <strong className={styles.metricValueSmall}>
              {formatBytes(currentImagesStats.totalBytes)}
            </strong>
            <small className={styles.metricSub}>
              {images.length} image(s) chargée(s)
            </small>
          </article>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <div className={styles.grid}>
          <form className={styles.card} onSubmit={onSubmit}>
            <div className={styles.cardHeader}>
              <h2>Importer des images</h2>
            </div>

            {loading ? (
              <div className={styles.loading}>Chargement des métiers…</div>
            ) : (
              <>
                <label className={styles.label}>
                  <span>Secteur d’activité</span>
                  <select
                    className={styles.select}
                    value={sectorSlug}
                    onChange={(event) => onSectorChange(event.target.value)}
                  >
                    {sectors.map((sector) => (
                      <option
                        key={sector.sector_slug}
                        value={sector.sector_slug}
                      >
                        {sector.sector_label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Métier</span>
                  <select
                    className={styles.select}
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    {selectedSectorJobs.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.job_label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div className={styles.pathPreview}>
              <span>Dossier généré</span>
              <code>{selectedCategory?.storage_prefix || "—"}</code>
            </div>

            <label className={styles.label}>
              <span>Images à importer</span>
              <input
                key={fileInputKey}
                className={styles.fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => setFiles(event.target.files)}
              />
              <small className={styles.helper}>
                {files?.length
                  ? `${files.length} fichier(s) sélectionné(s)`
                  : "JPEG, PNG ou WebP · import multiple autorisé"}
              </small>
              <small className={styles.uploadRules}>
                JPG, PNG ou WebP · {MAX_IMAGE_MB_LABEL} maximum par image ·
                optimisation WebP automatique avant import.
              </small>
            </label>

            {uploadProgress ? (
              <div className={styles.uploadProgressBox} aria-live="polite">
                <span>{uploadProgress}</span>
              </div>
            ) : null}

            <div className={styles.twoCols}>
              <label className={styles.label}>
                <span>Tags</span>
                <input
                  className={styles.input}
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="toiture, rénovation, chantier"
                />
              </label>

              <label className={styles.label}>
                <span>Source</span>
                <select
                  className={styles.select}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="freepik">Freepik / Magnific</option>
                  <option value="inrcy">iNrCy</option>
                  <option value="client">Client</option>
                  <option value="autre">Autre</option>
                </select>
              </label>
            </div>

            <label className={styles.label}>
              <span>Titre optionnel</span>
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Laisse vide pour générer automatiquement"
              />
            </label>

            <label className={styles.label}>
              <span>Référence licence / fichier licence</span>
              <input
                className={styles.input}
                value={licenseRef}
                onChange={(event) => setLicenseRef(event.target.value)}
                placeholder="ex: freepik-couvreur-pack-001"
              />
            </label>

            <label className={styles.label}>
              <span>URL source optionnelle</span>
              <input
                className={styles.input}
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="URL Freepik/Magnific si tu veux tracer"
              />
            </label>

            <button
              className={styles.primaryButton}
              type="submit"
              disabled={uploading || loading}
            >
              {uploading ? "Import en cours…" : "Importer dans la banque iNrCy"}
            </button>
          </form>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Images du métier sélectionné</h2>
              <p>
                {selectedCategory
                  ? `${selectedCategory.job_label} · ${selectedSector?.sector_label || ""}`
                  : "Aucun métier sélectionné"}
              </p>
            </div>

            <div className={styles.filtersBar}>
              <label className={styles.compactLabel}>
                Statut
                <select
                  className={styles.compactSelect}
                  value={activeFilter}
                  onChange={(event) =>
                    setActiveFilter(event.target.value as ActiveFilter)
                  }
                >
                  <option value="active">Actives</option>
                  <option value="inactive">Inactives</option>
                  <option value="all">Toutes</option>
                </select>
              </label>

              <label className={styles.compactLabel}>
                Source
                <select
                  className={styles.compactSelect}
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value)}
                >
                  <option value="all">Toutes</option>
                  <option value="freepik">Freepik / Magnific</option>
                  <option value="inrcy">iNrCy</option>
                  <option value="client">Client</option>
                  <option value="autre">Autre</option>
                </select>
              </label>

              <label className={styles.searchLabel}>
                Recherche
                <input
                  className={styles.compactInput}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="titre, chemin, licence…"
                />
              </label>

              <button
                type="button"
                className={styles.smallButton}
                onClick={() => loadImages(categoryId)}
                disabled={imagesLoading}
              >
                Appliquer
              </button>
            </div>

            <div className={styles.galleryHeader}>
              <div className={styles.galleryHeaderInfo}>
                <span className={styles.galleryChip}>
                  {imagesLoading ? "Chargement…" : `${images.length} image(s)`}
                </span>
                <span className={styles.galleryChipSecondary}>
                  {selectedCategory?.storage_prefix || "—"}
                </span>
              </div>

              <div className={styles.bulkActions}>
                <button
                  type="button"
                  className={styles.smallGhostButton}
                  onClick={toggleVisibleSelection}
                  disabled={imagesLoading || images.length === 0 || Boolean(bulkAction)}
                >
                  {allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
                </button>
                <span className={styles.selectionCounter}>
                  {selectedCount} sélectionnée(s)
                </span>
                <button
                  type="button"
                  className={styles.smallButton}
                  onClick={downloadSelectedImages}
                  disabled={!selectedCount || Boolean(bulkAction)}
                >
                  {bulkAction === "download" ? "Préparation…" : "Télécharger ZIP"}
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={deleteSelectedImages}
                  disabled={!selectedCount || Boolean(bulkAction)}
                >
                  {bulkAction === "delete" ? "Suppression…" : "Supprimer"}
                </button>
              </div>
            </div>

            {images.length === 0 ? (
              <div className={styles.empty}>
                Aucune image pour ce métier avec ces filtres.
              </div>
            ) : (
              <div className={styles.imageGrid}>
                {images.map((image) => {
                  const isSelected = selectedImageIdSet.has(image.id);
                  const isSaving =
                    savingId === image.id ||
                    (bulkAction === "delete" && isSelected);
                  const cardTitle = `${image.title || image.job || "Image"} · ${image.storage_path}`;

                  return (
                    <article
                      key={image.id}
                      title={cardTitle}
                      className={`${styles.imageCard} ${
                        image.is_active === false ? styles.imageCardInactive : ""
                      } ${isSelected ? styles.imageCardSelected : ""}`}
                    >
                      <div className={styles.thumbWrap}>
                        {image.signed_url ? (
                          <img
                            src={image.signed_url}
                            alt={image.title || image.storage_path}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                            onError={(event) => {
                              if (
                                image.original_signed_url &&
                                event.currentTarget.src !==
                                  image.original_signed_url
                              ) {
                                event.currentTarget.src =
                                  image.original_signed_url;
                              }
                            }}
                          />
                        ) : (
                          <span>Aperçu indisponible</span>
                        )}
                        <button
                          type="button"
                          className={`${styles.cubeSelectButton} ${
                            isSelected ? styles.cubeSelectButtonActive : ""
                          }`}
                          onClick={() => toggleImageSelection(image.id)}
                          disabled={Boolean(bulkAction)}
                          aria-pressed={isSelected}
                          aria-label={`${
                            isSelected ? "Désélectionner" : "Sélectionner"
                          } ${image.title || image.storage_path}`}
                          title={
                            isSelected ? "Désélectionner" : "Sélectionner"
                          }
                        >
                          {isSelected ? "✓" : ""}
                        </button>
                        <button
                          type="button"
                          className={styles.cubeDeleteButton}
                          onClick={() => deleteImage(image)}
                          disabled={isSaving || Boolean(bulkAction)}
                          aria-label={`Supprimer ${image.title || image.storage_path}`}
                          title="Supprimer"
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
