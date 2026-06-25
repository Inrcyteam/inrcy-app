"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabaseClient";
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
};

type ActiveFilter = "active" | "inactive" | "all";

type EditDraft = {
  title: string;
  tags: string;
  source: string;
  source_url: string;
  license_ref: string;
};

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

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_MB_LABEL = "10 Mo";
const UPLOAD_BATCH_SIZE = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);


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

function getImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
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
      throw new Error(`${formatUploadName(file)} : format non autorisé. Utilise JPG, PNG ou WebP.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${formatUploadName(file)} : image trop lourde. Maximum ${MAX_IMAGE_MB_LABEL} par image.`);
    }
  }
}


function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR");
  } catch {
    return iso;
  }
}

function groupBySector(categories: ImageBankCategory[]) {
  const map = new Map<string, { sector_slug: string; sector_label: string; jobs: ImageBankCategory[] }>();
  for (const category of categories) {
    const existing = map.get(category.sector_slug);
    if (existing) existing.jobs.push(category);
    else map.set(category.sector_slug, { sector_slug: category.sector_slug, sector_label: category.sector_label, jobs: [category] });
  }
  return Array.from(map.values());
}

function tagsToText(tags: string[] | null | undefined) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function cleanEditableTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

export default function ImageBankAdminClient() {
  const [categories, setCategories] = useState<ImageBankCategory[]>([]);
  const [images, setImages] = useState<ImageBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});

  const sectors = useMemo(() => groupBySector(categories), [categories]);
  const selectedSectorJobs = useMemo(() => {
    if (!sectorSlug) return [];
    return categories.filter((category) => category.sector_slug === sectorSlug);
  }, [categories, sectorSlug]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const selectedSector = useMemo(
    () => sectors.find((sector) => sector.sector_slug === sectorSlug) ?? null,
    [sectors, sectorSlug]
  );

  const currentImagesStats = useMemo(() => {
    const active = images.filter((image) => image.is_active !== false).length;
    return {
      active,
      inactive: images.length - active,
      totalBytes: images.reduce((sum, image) => sum + (image.size_bytes || 0), 0),
    };
  }, [images]);

  const loadCategories = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/image-bank/categories", { cache: "no-store" });
      const json = await readApiJson(response, "Impossible de charger les métiers.");
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les métiers.");
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

  const loadImages = useCallback(async (nextCategoryId = categoryId) => {
    setImagesLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextCategoryId) params.set("category_id", nextCategoryId);
      params.set("limit", "120");
      params.set("active", activeFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (search.trim()) params.set("q", search.trim());

      const response = await fetch(`/api/admin/image-bank/images?${params.toString()}`, { cache: "no-store" });
      const json = await readApiJson(response, "Impossible de charger les images.");
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les images.");
      const nextImages = (json.images ?? []) as ImageBankRow[];
      setImages(nextImages);
      setEditDrafts((prev) => {
        const next = { ...prev };
        for (const image of nextImages) {
          if (!next[image.id]) {
            next[image.id] = {
              title: image.title || "",
              tags: tagsToText(image.tags),
              source: image.source || "freepik",
              source_url: image.source_url || "",
              license_ref: image.license_ref || "",
            };
          }
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les images.");
    } finally {
      setImagesLoading(false);
    }
  }, [activeFilter, categoryId, search, sourceFilter]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (categoryId) loadImages(categoryId);
  }, [categoryId, loadImages]);

  function onSectorChange(nextSector: string) {
    setSectorSlug(nextSector);
    const firstJob = categories.find((category) => category.sector_slug === nextSector);
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

      const supabase = createClient();
      const batches = chunkFiles(selectedFiles, UPLOAD_BATCH_SIZE);
      let uploaded = 0;
      let failed = 0;
      const failures: string[] = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        const startIndex = batchIndex * UPLOAD_BATCH_SIZE;
        setUploadProgress(`Préparation du lot ${batchNumber}/${batches.length}…`);

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
        const prepareJson = await readApiJson(prepareResponse, "Préparation de l’import impossible.");
        if (!prepareResponse.ok) throw new Error(prepareJson?.error || "Préparation de l’import impossible.");

        const preparedItems = ((prepareJson?.items ?? []) as UploadPrepareItem[]).filter((item) => item?.token && item?.storage_path);
        const preparedById = new Map(preparedItems.map((item) => [item.client_id, item]));
        const finalizeItems: UploadFinalizeItem[] = [];

        for (let localIndex = 0; localIndex < batch.length; localIndex += 1) {
          const file = batch[localIndex];
          const clientId = getClientFileId(file, startIndex + localIndex);
          const prepared = preparedById.get(clientId);
          if (!prepared) {
            failed += 1;
            failures.push(`${formatUploadName(file)} : préparation impossible.`);
            continue;
          }

          try {
            setUploadProgress(`Import du lot ${batchNumber}/${batches.length} · image ${localIndex + 1}/${batch.length}…`);
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
            failures.push(`${formatUploadName(file)} : ${uploadError?.message || "upload Supabase impossible."}`);
          }
        }

        if (finalizeItems.length > 0) {
          setUploadProgress(`Finalisation du lot ${batchNumber}/${batches.length}…`);
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
          const finalizeJson = await readApiJson(finalizeResponse, "Finalisation de l’import impossible.");
          if (!finalizeResponse.ok) throw new Error(finalizeJson?.error || "Finalisation de l’import impossible.");
          uploaded += Number(finalizeJson?.uploaded || 0);
          failed += Number(finalizeJson?.failed || 0);
          const results = Array.isArray(finalizeJson?.results) ? finalizeJson.results : [];
          for (const result of results) {
            if (result && result.ok === false && result.original_name) {
              failures.push(`${result.original_name} : ${result.error || "finalisation impossible."}`);
            }
          }
        }
      }

      setSuccess(`${uploaded} image(s) importée(s). ${failed ? `${failed} échec(s).` : ""}`.trim());
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

  async function patchImage(id: string, payload: Record<string, unknown>, successMessage: string) {
    setSavingId(id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/admin/image-bank/images", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const json = await readApiJson(response, "Mise à jour impossible.");
      if (!response.ok) throw new Error(json?.error || "Mise à jour impossible.");
      setSuccess(successMessage);
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Mise à jour impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveImageMetadata(image: ImageBankRow) {
    const draft = editDrafts[image.id];
    if (!draft) return;
    await patchImage(
      image.id,
      {
        title: draft.title,
        tags: cleanEditableTags(draft.tags),
        source: draft.source,
        source_url: draft.source_url,
        license_ref: draft.license_ref,
      },
      "Métadonnées mises à jour."
    );
    setEditingId(null);
  }

  async function deleteImage(image: ImageBankRow) {
    const ok = window.confirm("Supprimer définitivement cette image de la banque iNrCy ?");
    if (!ok) return;

    setSavingId(image.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/image-bank/images?id=${encodeURIComponent(image.id)}`, {
        method: "DELETE",
      });
      const json = await readApiJson(response, "Suppression impossible.");
      if (!response.ok) throw new Error(json?.error || "Suppression impossible.");
      setSuccess("Image supprimée définitivement.");
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      setSuccess("Chemin copié.");
    } catch {
      setError("Impossible de copier le chemin.");
    }
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setEditDrafts((prev) => {
      const current: EditDraft = prev[id] ?? {
        title: "",
        tags: "",
        source: "freepik",
        source_url: "",
        license_ref: "",
      };

      return {
        ...prev,
        [id]: {
          ...current,
          [field]: value,
        },
      };
    });
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
            <button type="button" className={`${styles.ghostButton} ${styles.refreshButton}`} onClick={() => loadImages(categoryId)} disabled={imagesLoading} aria-label="Rafraîchir">
              <span className={styles.actionIcon} aria-hidden="true">↻</span>
              <span className={styles.actionLabel}>{imagesLoading ? "Chargement…" : "Rafraîchir"}</span>
            </button>
            <Link href="/dashboard/admin" className={`${styles.closeButton} ${styles.closeIconButton}`} aria-label="Fermer">
              <span className={styles.actionIcon} aria-hidden="true">×</span>
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
            <strong className={styles.metricValue}>{currentImagesStats.active}</strong>
            <small className={styles.metricSub}>{currentImagesStats.inactive} inactive(s)</small>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>Poids affiché</span>
            <strong className={styles.metricValueSmall}>{formatBytes(currentImagesStats.totalBytes)}</strong>
            <small className={styles.metricSub}>{images.length} image(s) chargée(s)</small>
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
                  <select className={styles.select} value={sectorSlug} onChange={(event) => onSectorChange(event.target.value)}>
                    {sectors.map((sector) => (
                      <option key={sector.sector_slug} value={sector.sector_slug}>
                        {sector.sector_label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  <span>Métier</span>
                  <select className={styles.select} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
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
              <small className={styles.helper}>{files?.length ? `${files.length} fichier(s) sélectionné(s)` : "JPEG, PNG ou WebP · import multiple autorisé"}</small>
              <small className={styles.uploadRules}>
                JPG, PNG ou WebP · {MAX_IMAGE_MB_LABEL} maximum par image · import par lots automatique.
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
                <select className={styles.select} value={source} onChange={(event) => setSource(event.target.value)}>
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

            <button className={styles.primaryButton} type="submit" disabled={uploading || loading}>
              {uploading ? "Import en cours…" : "Importer dans la banque iNrCy"}
            </button>
          </form>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Images du métier sélectionné</h2>
              <p>{selectedCategory ? `${selectedCategory.job_label} · ${selectedSector?.sector_label || ""}` : "Aucun métier sélectionné"}</p>
            </div>

            <div className={styles.filtersBar}>
              <label className={styles.compactLabel}>
                Statut
                <select className={styles.compactSelect} value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}>
                  <option value="active">Actives</option>
                  <option value="inactive">Inactives</option>
                  <option value="all">Toutes</option>
                </select>
              </label>

              <label className={styles.compactLabel}>
                Source
                <select className={styles.compactSelect} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
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

              <button type="button" className={styles.smallButton} onClick={() => loadImages(categoryId)} disabled={imagesLoading}>
                Appliquer
              </button>
            </div>

            <div className={styles.galleryHeader}>
              <span className={styles.galleryChip}>{imagesLoading ? "Chargement…" : `${images.length} image(s)`}</span>
              <span className={styles.galleryChipSecondary}>{selectedCategory?.storage_prefix || "—"}</span>
            </div>

            {images.length === 0 ? (
              <div className={styles.empty}>Aucune image pour ce métier avec ces filtres.</div>
            ) : (
              <div className={styles.imageGrid}>
                {images.map((image) => {
                  const draft = editDrafts[image.id];
                  const isEditing = editingId === image.id;
                  const isSaving = savingId === image.id;

                  return (
                    <article key={image.id} className={`${styles.imageCard} ${image.is_active === false ? styles.imageCardInactive : ""}`}>
                      <div className={styles.thumbWrap}>
                        {image.signed_url ? <img src={image.signed_url} alt={image.title || image.storage_path} /> : <span>Aperçu indisponible</span>}
                        <span className={image.is_active === false ? styles.inactivePill : styles.activePill}>
                          {image.is_active === false ? "Inactive" : "Active"}
                        </span>
                      </div>

                      <div className={styles.imageInfo}>
                        {isEditing ? (
                          <div className={styles.editBlock}>
                            <input
                              className={styles.miniInput}
                              value={draft?.title ?? ""}
                              onChange={(event) => updateDraft(image.id, "title", event.target.value)}
                              placeholder="Titre"
                            />
                            <input
                              className={styles.miniInput}
                              value={draft?.tags ?? ""}
                              onChange={(event) => updateDraft(image.id, "tags", event.target.value)}
                              placeholder="tags, séparés, par virgule"
                            />
                            <select
                              className={styles.miniInput}
                              value={draft?.source ?? "freepik"}
                              onChange={(event) => updateDraft(image.id, "source", event.target.value)}
                            >
                              <option value="freepik">Freepik / Magnific</option>
                              <option value="inrcy">iNrCy</option>
                              <option value="client">Client</option>
                              <option value="autre">Autre</option>
                            </select>
                            <input
                              className={styles.miniInput}
                              value={draft?.license_ref ?? ""}
                              onChange={(event) => updateDraft(image.id, "license_ref", event.target.value)}
                              placeholder="Référence licence"
                            />
                            <input
                              className={styles.miniInput}
                              value={draft?.source_url ?? ""}
                              onChange={(event) => updateDraft(image.id, "source_url", event.target.value)}
                              placeholder="URL source"
                            />
                          </div>
                        ) : (
                          <>
                            <strong>{image.title || image.job || "Image"}</strong>
                            <span>{image.storage_path}</span>
                            <small>{tagsToText(image.tags) || "Aucun tag"}</small>
                            <small>
                              {image.orientation || "—"} · {image.width || "—"}×{image.height || "—"} · {formatBytes(image.size_bytes)}
                            </small>
                            <small>{image.source || "—"} · {image.license_ref || "licence non renseignée"}</small>
                            <small>{formatDate(image.created_at)} · utilisée {image.usage_count || 0} fois</small>
                          </>
                        )}

                        <div className={styles.imageActions}>
                          {isEditing ? (
                            <>
                              <button type="button" className={styles.smallButton} disabled={isSaving} onClick={() => saveImageMetadata(image)}>
                                {isSaving ? "..." : "Enregistrer"}
                              </button>
                              <button type="button" className={styles.smallGhostButton} disabled={isSaving} onClick={() => setEditingId(null)}>
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className={styles.smallButton} onClick={() => setEditingId(image.id)}>
                                Modifier
                              </button>
                              <button
                                type="button"
                                className={styles.smallGhostButton}
                                disabled={isSaving}
                                onClick={() => patchImage(image.id, { is_active: image.is_active === false }, image.is_active === false ? "Image réactivée." : "Image désactivée.")}
                              >
                                {image.is_active === false ? "Activer" : "Désactiver"}
                              </button>
                              <button type="button" className={styles.smallGhostButton} onClick={() => copyPath(image.storage_path)}>
                                Copier
                              </button>
                              <button type="button" className={styles.dangerButton} disabled={isSaving} onClick={() => deleteImage(image)}>
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
    </div>
  );
}
