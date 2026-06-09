"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  license_ref: string | null;
  created_at: string;
  signed_url: string | null;
};

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

export default function ImageBankAdminClient() {
  const [categories, setCategories] = useState<ImageBankCategory[]>([]);
  const [images, setImages] = useState<ImageBankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sectorSlug, setSectorSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("freepik");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseRef, setLicenseRef] = useState("");

  const sectors = useMemo(() => groupBySector(categories), [categories]);
  const selectedSectorJobs = useMemo(() => {
    if (!sectorSlug) return [];
    return categories.filter((category) => category.sector_slug === sectorSlug);
  }, [categories, sectorSlug]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const loadCategories = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/image-bank/categories", { cache: "no-store" });
      const json = await response.json();
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
      params.set("limit", "80");
      const response = await fetch(`/api/admin/image-bank/images?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Impossible de charger les images.");
      setImages((json.images ?? []) as ImageBankRow[]);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les images.");
    } finally {
      setImagesLoading(false);
    }
  }, [categoryId]);

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

    if (!categoryId) {
      setError("Choisis un métier.");
      return;
    }
    if (!files || files.length === 0) {
      setError("Ajoute au moins une image.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("category_id", categoryId);
      formData.set("tags", tags);
      formData.set("title", title);
      formData.set("source", source);
      formData.set("source_url", sourceUrl);
      formData.set("license_ref", licenseRef);
      Array.from(files).forEach((file) => formData.append("files", file));

      const response = await fetch("/api/admin/image-bank/upload", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Import impossible.");

      setSuccess(`${json.uploaded ?? 0} image(s) importée(s). ${json.failed ? `${json.failed} échec(s).` : ""}`.trim());
      setFiles(null);
      setTitle("");
      await loadImages(categoryId);
    } catch (e: any) {
      setError(e?.message || "Import impossible.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Dashboard admin</div>
            <h1 className={styles.title}>Banque d’images iNrCy</h1>
            <p className={styles.subtitle}>
              Import privé vers Supabase Storage. Les pros ne voient jamais la banque brute.
            </p>
          </div>

          <div className={styles.headerActions}>
            <Link href="/dashboard/admin/commandes" className={styles.secondaryButton}>
              Commandes
            </Link>
            <Link href="/dashboard" className={styles.secondaryButton}>
              Retour
            </Link>
          </div>
        </header>

        <section className={styles.explainGrid}>
          <div className={styles.explainCard}>
            <strong>1. Tu choisis un métier</strong>
            <span>Les 206 métiers viennent de ton catalogue iNrCy.</span>
          </div>
          <div className={styles.explainCard}>
            <strong>2. Tu glisses tes images</strong>
            <span>L’app optimise en WebP et range dans le bon dossier Storage.</span>
          </div>
          <div className={styles.explainCard}>
            <strong>3. iNr’Agent pourra piocher</strong>
            <span>Plus tard, il utilisera ces visuels pour préparer les publications.</span>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {success ? <div className={styles.success}>{success}</div> : null}

        <div className={styles.grid}>
          <form className={styles.card} onSubmit={onSubmit}>
            <div className={styles.cardHeader}>
              <h2>Importer des images</h2>
              <p>Les fichiers partent dans le bucket privé <code>inrcy-image-bank</code>.</p>
            </div>

            {loading ? (
              <div className={styles.loading}>Chargement des métiers…</div>
            ) : (
              <>
                <label className={styles.label}>
                  Secteur d’activité
                  <select className={styles.select} value={sectorSlug} onChange={(event) => onSectorChange(event.target.value)}>
                    {sectors.map((sector) => (
                      <option key={sector.sector_slug} value={sector.sector_slug}>
                        {sector.sector_label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  Métier
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
              Images à importer
              <input
                className={styles.fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => setFiles(event.target.files)}
              />
            </label>

            <div className={styles.twoCols}>
              <label className={styles.label}>
                Tags
                <input
                  className={styles.input}
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="toiture, rénovation, chantier"
                />
              </label>

              <label className={styles.label}>
                Source
                <select className={styles.select} value={source} onChange={(event) => setSource(event.target.value)}>
                  <option value="freepik">Freepik / Magnific</option>
                  <option value="inrcy">iNrCy</option>
                  <option value="client">Client</option>
                  <option value="autre">Autre</option>
                </select>
              </label>
            </div>

            <label className={styles.label}>
              Titre optionnel
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Laisse vide pour générer automatiquement"
              />
            </label>

            <label className={styles.label}>
              Référence licence / fichier licence
              <input
                className={styles.input}
                value={licenseRef}
                onChange={(event) => setLicenseRef(event.target.value)}
                placeholder="ex: freepik-couvreur-pack-001"
              />
            </label>

            <label className={styles.label}>
              URL source optionnelle
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
              <p>{imagesLoading ? "Chargement…" : `${images.length} image(s) affichée(s)`}</p>
            </div>

            {images.length === 0 ? (
              <div className={styles.empty}>Aucune image pour ce métier pour l’instant.</div>
            ) : (
              <div className={styles.imageGrid}>
                {images.map((image) => (
                  <article key={image.id} className={styles.imageCard}>
                    <div className={styles.thumbWrap}>
                      {image.signed_url ? <img src={image.signed_url} alt={image.title || image.storage_path} /> : <span>Aperçu indisponible</span>}
                    </div>
                    <div className={styles.imageInfo}>
                      <strong>{image.title || image.job || "Image"}</strong>
                      <span>{image.storage_path}</span>
                      <small>
                        {image.orientation || "—"} · {image.width || "—"}×{image.height || "—"} · {formatBytes(image.size_bytes)}
                      </small>
                      <small>{formatDate(image.created_at)}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
