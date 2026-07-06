import { ACTIVITY_CATALOG } from "@/lib/activityCatalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ImageBankCategorySeed = {
  sector_slug: string;
  sector_label: string;
  job_slug: string;
  job_label: string;
  storage_prefix: string;
  sort_order: number;
  is_active: boolean;
};

export function buildImageBankCategorySeeds(): ImageBankCategorySeed[] {
  return Object.entries(ACTIVITY_CATALOG).flatMap(
    ([sectorSlug, sectorDefinition], sectorIndex) => {
      return Object.entries(sectorDefinition.jobs).map(
        ([jobSlug, jobDefinition], jobIndex) => ({
          sector_slug: sectorSlug,
          sector_label: sectorDefinition.label,
          job_slug: jobSlug,
          job_label: jobDefinition.label,
          storage_prefix: `metiers/${sectorSlug}/${jobSlug}`,
          sort_order: sectorIndex * 1000 + jobIndex + 1,
          is_active: true,
        }),
      );
    },
  );
}

export async function ensureImageBankCategories() {
  const seeds = buildImageBankCategorySeeds();

  const { data, error } = await supabaseAdmin
    .from("inrcy_image_bank_categories")
    .select("sector_slug,job_slug");

  if (error) throw error;

  const existing = new Set(
    (Array.isArray(data) ? data : []).map((row: any) =>
      `${String(row?.sector_slug || "")}::${String(row?.job_slug || "")}`,
    ),
  );

  const missing = seeds.filter(
    (seed) => !existing.has(`${seed.sector_slug}::${seed.job_slug}`),
  );

  if (!missing.length) return { inserted: 0 };

  const insert = await supabaseAdmin
    .from("inrcy_image_bank_categories")
    .insert(missing);

  if (insert.error) throw insert.error;

  return { inserted: missing.length };
}
