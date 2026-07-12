import { cache } from "react";
import { getActivitySectorLabel, decodeBusinessSector } from "@/lib/activitySectors";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { filterEligibleInrSearchAccountIds, getInrSearchPublicationEligibility } from "@/lib/inrSearchEligibility";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { createInrBadgePublicUrl, createInrBadgeQrTrackingUrl } from "@/lib/inrBadge";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type InrSearchSectionKey =
  | "identity"
  | "presentation"
  | "contact"
  | "hours"
  | "services"
  | "sectors"
  | "areas"
  | "media"
  | "news"
  | "socials"
  | "faq"
  | "trust"
  | "cta";

export type InrSearchSections = Record<InrSearchSectionKey, boolean>;

export type InrSearchPublication = {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string | null;
};

export type InrSearchMedia = {
  id: string;
  title: string;
  url: string;
};

export type InrSearchSocialLink = {
  key: string;
  label: string;
  url: string;
};

export type InrSearchFaq = {
  question: string;
  answer: string;
};

export type InrSearchServiceDescriptions = Record<string, string>;

export type InrSearchPublicPageData = {
  userId: string;
  slug: string;
  pageTitle: string;
  pageDescription: string;
  enabled: boolean;
  sections: InrSearchSections;
  updatedAt: string | null;
  companyName: string;
  contactName: string;
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  addressLine: string;
  description: string;
  sectorCategory: string;
  sectorLabel: string;
  profession: string;
  services: string[];
  serviceDescriptions: InrSearchServiceDescriptions;
  zones: string[];
  strengths: string[];
  customerTypes: string[];
  openingDays: string;
  openingHours: string;
  websiteUrl: string;
  googleBusinessUrl: string;
  socialLinks: InrSearchSocialLink[];
  publications: InrSearchPublication[];
  media: InrSearchMedia[];
  faq: InrSearchFaq[];
  inrBadgeUrl: string;
  inrBadgeQrUrl: string;
};

export type PublishedInrSearchCompany = {
  slug: string;
  companyName: string;
  pageTitle: string;
  pageDescription: string;
  city: string;
  citySlug: string;
  profession: string;
  professionSlug: string;
  sectorCategory: string;
  sectorLabel: string;
  sectorSlug: string;
  updatedAt: string | null;
};


export type InrSearchPublicStatusReason =
  | "published"
  | "slug_missing"
  | "config_missing"
  | "page_disabled"
  | "bubble_disabled"
  | "subscription_inactive"
  | "profile_missing"
  | "data_unavailable";

export type InrSearchPublicStatus = {
  published: boolean;
  reason: InrSearchPublicStatusReason;
  slug: string;
  accountId: string | null;
  publicUrl: string;
};

export type InrSearchDirectoryEntry = {
  slug: string;
  label: string;
  count: number;
};

const DEFAULT_SECTIONS: InrSearchSections = {
  identity: true,
  presentation: true,
  contact: true,
  hours: true,
  services: true,
  sectors: true,
  areas: true,
  media: true,
  news: true,
  socials: true,
  faq: true,
  trust: true,
  cta: true,
};

const PUBLIC_ORIGIN = ((process.env.NEXT_PUBLIC_INRSEARCH_PUBLIC_ORIGIN || "https://app.inrcy.com").replace(/\/$/, "") === "https://inrcy.com" ? "https://app.inrcy.com" : (process.env.NEXT_PUBLIC_INRSEARCH_PUBLIC_ORIGIN || "https://app.inrcy.com").replace(/\/$/, ""));
const MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

export function getInrSearchPublicOrigin() {
  return PUBLIC_ORIGIN;
}

export function buildInrSearchPublicUrl(slug: string) {
  return `${PUBLIC_ORIGIN}/entreprises/${encodeURIComponent(slug)}`;
}

export function buildInrSearchProfessionUrl(professionSlug: string, citySlug?: string) {
  const base = `${PUBLIC_ORIGIN}/metiers/${encodeURIComponent(professionSlug)}`;
  return citySlug ? `${base}/${encodeURIComponent(citySlug)}` : base;
}

export function buildInrSearchSectorUrl(sectorSlug: string) {
  return `${PUBLIC_ORIGIN}/secteurs/${encodeURIComponent(sectorSlug)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max).trim();
}

function latestIsoDate(values: unknown[]) {
  return values
    .map((value) => clean(value, 80))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(left);
      const rightTime = Date.parse(right);
      if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return right.localeCompare(left);
      return rightTime - leftTime;
    })[0] || null;
}

export function normalizeInrSearchDirectorySlug(value: unknown) {
  return clean(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeSections(value: unknown): InrSearchSections {
  const source = asRecord(value);
  const sections = { ...DEFAULT_SECTIONS };
  for (const key of Object.keys(DEFAULT_SECTIONS) as InrSearchSectionKey[]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) sections[key] = Boolean(source[key]);
  }
  return sections;
}

function listFromUnknown(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,|;/)
      : [];

  return Array.from(
    new Set(
      raw
        .map((item) => clean(item, 180))
        .filter(Boolean),
    ),
  ).slice(0, 40);
}

function normalizeServiceDescriptionMap(...values: unknown[]): InrSearchServiceDescriptions {
  const result: InrSearchServiceDescriptions = {};

  const store = (keyValue: unknown, descriptionValue: unknown) => {
    const key = clean(keyValue, 180);
    const description = clean(descriptionValue, 900);
    if (!key || !description) return;
    result[key] = description;
    result[normalizeInrSearchDirectorySlug(key)] = description;
  };

  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      try {
        visit(JSON.parse(value));
      } catch {
        return;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const record = asRecord(item);
        store(
          record.service || record.name || record.title || record.key,
          record.description || record.text || record.content || record.body,
        );
      }
      return;
    }
    const record = asRecord(value);
    for (const [key, rawDescription] of Object.entries(record)) {
      if (typeof rawDescription === "string") {
        store(key, rawDescription);
      } else {
        const descriptionRecord = asRecord(rawDescription);
        store(
          descriptionRecord.service || descriptionRecord.name || descriptionRecord.title || key,
          descriptionRecord.description || descriptionRecord.text || descriptionRecord.content || descriptionRecord.body,
        );
      }
    }
  };

  for (const value of values) visit(value);
  return result;
}

function normalizeExternalUrl(value: unknown): string {
  const raw = clean(value, 1000);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function firstImageUrl(value: unknown): string | null {
  const candidates = Array.isArray(value) ? value : [];
  for (const candidate of candidates) {
    const raw = typeof candidate === "string"
      ? candidate
      : clean(asRecord(candidate).url || asRecord(candidate).publicUrl || asRecord(candidate).src, 1000);
    const url = normalizeExternalUrl(raw);
    if (url) return url;
  }
  return null;
}

function arrayFromUnknown(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function publicationImageUrl(payload: Record<string, unknown>, post: Record<string, unknown>) {
  const video = asRecord(post.video || payload.video);
  const candidates = [
    ...arrayFromUnknown(post.siteCardPublishableUrls),
    ...arrayFromUnknown(post.socialFeedPublishableUrls),
    ...arrayFromUnknown(post.publishableUrls),
    ...arrayFromUnknown(post.images),
    ...arrayFromUnknown(payload.siteCardPublishableUrls),
    ...arrayFromUnknown(payload.socialFeedPublishableUrls),
    ...arrayFromUnknown(payload.publishableUrls),
    ...arrayFromUnknown(payload.images),
    video.thumbnailUrl,
    video.thumbnail_url,
  ].filter(Boolean);
  return firstImageUrl(candidates);
}

function hasLivePublicationChannel(payload: Record<string, unknown>) {
  const result = asRecord(asRecord(payload.results).inr_search);
  if (!Object.keys(result).length) return false;
  const status = clean(result.status, 40).toLowerCase();
  return result.deleted !== true
    && status !== "deleted"
    && (result.ok === true || status === "delivered" || status === "published");
}

function normalizeBoosterPublicationEvents(value: unknown): InrSearchPublication[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const publications: InrSearchPublication[] = [];

  for (const row of value) {
    const record = asRecord(row);
    const payload = asRecord(record.payload);
    if (!hasLivePublicationChannel(payload)) continue;

    const publicationId = clean(payload.publication_id || record.id, 120);
    if (!publicationId || seen.has(publicationId)) continue;

    const byChannel = asRecord(payload.postByChannel);
    const preferredPost = asRecord(byChannel.inr_search || payload.post);
    const fallbackPost = asRecord(payload.post);
    const title = clean(preferredPost.title || fallbackPost.title || payload.idea, 180);
    const content = clean(preferredPost.content || preferredPost.text || fallbackPost.content || fallbackPost.text, 2400);
    if (!title && !content) continue;

    seen.add(publicationId);
    publications.push({
      id: publicationId,
      title: title || "Actualité",
      content,
      imageUrl: publicationImageUrl(payload, preferredPost),
      createdAt: clean(record.created_at, 80) || null,
    });
    if (publications.length >= 10) break;
  }

  return publications;
}
async function findPublishedConfigBySlug(slug: string) {
  const normalizedSlug = normalizeInrSearchDirectorySlug(slug);
  if (!normalizedSlug) return null;

  const direct = await supabaseAdmin
    .from("pro_tools_configs")
    .select("user_id,settings")
    .contains("settings", { inrSearch: { slug: normalizedSlug, enabled: true } })
    .limit(1)
    .maybeSingle();

  if (!direct.error && direct.data) return direct.data as { user_id: string; settings: unknown };

  const fallback = await supabaseAdmin
    .from("pro_tools_configs")
    .select("user_id,settings")
    .limit(2000);

  if (fallback.error || !Array.isArray(fallback.data)) return null;
  return (fallback.data as Array<{ user_id: string; settings: unknown }>).find((row) => {
    const config = asRecord(asRecord(row.settings).inrSearch);
    return config.enabled === true && normalizeInrSearchDirectorySlug(config.slug) === normalizedSlug;
  }) ?? null;
}

async function loadMedia(userId: string): Promise<InrSearchMedia[]> {
  const result = await supabaseAdmin
    .from("pro_media_library")
    .select("id,bucket_name,storage_path,title,created_at")
    .eq("user_id", userId)
    .eq("media_type", "image")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(8);

  if (result.error || !Array.isArray(result.data)) return [];

  const media = await Promise.all(
    result.data.map(async (row: any): Promise<InrSearchMedia | null> => {
      const bucket = clean(row.bucket_name, 120) || "pro-media";
      const storagePath = clean(row.storage_path, 600);
      if (!storagePath) return null;
      const signed = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, MEDIA_SIGNED_URL_TTL_SECONDS);
      const url = normalizeExternalUrl(signed.data?.signedUrl);
      if (!url) return null;
      return {
        id: clean(row.id, 120) || storagePath,
        title: clean(row.title, 180) || "Photo de l’entreprise",
        url,
      };
    }),
  );

  return media.filter((item): item is InrSearchMedia => Boolean(item));
}

function buildFaq(input: {
  companyName: string;
  profession: string;
  city: string;
  services: string[];
  zones: string[];
  customerTypes: string[];
  phone: string;
  email: string;
  openingDays: string;
  openingHours: string;
}): InrSearchFaq[] {
  const faq: InrSearchFaq[] = [];
  if (input.profession || input.city) {
    faq.push({
      question: `Quelle est l’activité de ${input.companyName}${input.city ? ` à ${input.city}` : ""} ?`,
      answer: `${input.companyName}${input.profession ? ` exerce l’activité de ${input.profession.toLocaleLowerCase("fr-FR")}` : " est une entreprise"}${input.city ? ` à ${input.city}` : ""}. Les informations de cette page sont synchronisées depuis le profil professionnel iNrCy.`,
    });
  }
  if (input.services.length) {
    faq.push({
      question: `Quels services propose ${input.companyName} ?`,
      answer: `${input.companyName} propose notamment ${input.services.join(", ")}. Le détail du besoin peut être précisé directement auprès de l’entreprise.`,
    });
  }
  if (input.customerTypes.length) {
    faq.push({
      question: `À quels clients s’adresse ${input.companyName} ?`,
      answer: `${input.companyName} s’adresse notamment aux ${input.customerTypes.map((value) => value.toLocaleLowerCase("fr-FR")).join(", ")}.`,
    });
  }
  if (input.zones.length) {
    faq.push({
      question: `Dans quelles zones intervient ${input.companyName} ?`,
      answer: `${input.companyName} intervient notamment à ${input.zones.join(", ")}. La disponibilité exacte dépend du besoin et peut être confirmée directement avec l’entreprise.`,
    });
  }
  if (input.openingDays || input.openingHours) {
    faq.push({
      question: `Quels sont les horaires de ${input.companyName} ?`,
      answer: `${input.companyName} est indiqué comme joignable ${[input.openingDays, input.openingHours].filter(Boolean).join(", ")}.`,
    });
  }
  if (input.phone || input.email) {
    const contactParts = [input.phone ? `par téléphone au ${input.phone}` : "", input.email ? `par email à ${input.email}` : ""].filter(Boolean);
    faq.push({
      question: `Comment contacter ${input.companyName} ?`,
      answer: `Vous pouvez contacter ${input.companyName} ${contactParts.join(" ou ")}. Le formulaire présent sur cette page permet également de transmettre une demande.`,
    });
  }
  return faq.slice(0, 6);
}

async function loadInrSearchPublicPageUncached(slug: string): Promise<InrSearchPublicPageData | null> {
  // Aperçu visuel local, volontairement inaccessible en production.
  // Il permet de contrôler toutes les scènes sans dépendre d’un compte Supabase.
  if (process.env.NODE_ENV !== "production" && normalizeInrSearchDirectorySlug(slug) === "demo-gravity-engine") {
    return {
      userId: "preview-only",
      slug: "demo-gravity-engine",
      pageTitle: "iNrCy — démonstration iNr’Search",
      pageDescription: "Une démonstration locale de la nouvelle expérience iNr’Search.",
      enabled: true,
      sections: { ...DEFAULT_SECTIONS },
      updatedAt: "2026-07-11T12:00:00.000Z",
      companyName: "iNrCy",
      contactName: "Équipe iNrCy",
      logoUrl: "/logo-inrcy.png",
      phone: "06 22 08 21 79",
      email: "j.wright@inrcy.com",
      address: "1 rue de Fouquières",
      zip: "62440",
      city: "Harnes",
      country: "France",
      addressLine: "1 rue de Fouquières, 62440 Harnes, France",
      description: "iNrCy transforme la présence numérique des professionnels en une expérience vivante, claire et directement utile à leurs futurs clients.",
      sectorCategory: "communication",
      sectorLabel: "Communication",
      profession: "Agence de communication",
      services: [
        "Stratégie de communication",
        "Conseil éditorial",
        "Communication digitale",
        "Identité visuelle",
        "Campagne locale",
        "Supports print",
        "Plan d’action",
      ],
      serviceDescriptions: {},
      zones: ["Arras", "Béthune", "Lens", "Liévin", "Douai", "Carvin"],
      strengths: ["Créatif", "Réactif", "Sérieux", "Efficace", "Proche", "À l’écoute"],
      customerTypes: ["professionnels", "collectivités", "associations"],
      openingDays: "Lundi–vendredi",
      openingHours: "8h00–18h00",
      websiteUrl: "https://inrcy.com",
      googleBusinessUrl: "https://www.google.com/maps",
      socialLinks: [
        { key: "website", label: "Site internet", url: "https://inrcy.com" },
        { key: "google", label: "Google Business", url: "https://www.google.com" },
        { key: "facebook", label: "Facebook", url: "https://www.facebook.com" },
        { key: "instagram", label: "Instagram", url: "https://www.instagram.com" },
        { key: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com" },
        { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com" },
        { key: "youtube", label: "YouTube", url: "https://www.youtube.com" },
      ],
      publications: [
        { id: "preview-news-1", title: "iNr’Search donne une nouvelle gravité à votre présence en ligne", content: "Votre profil, vos expertises, vos réalisations et vos actualités se rejoignent désormais dans un parcours spectaculaire, lisible et conçu pour convertir.", imageUrl: "/icons/inr-search-logo.png", createdAt: "2026-07-11T09:00:00.000Z" },
        { id: "preview-news-2", title: "Publiez une fois, rayonnez partout", content: "Les contenus envoyés depuis Booster Publier alimentent automatiquement la chronologie iNr’Search et montrent une entreprise réellement active.", imageUrl: "/icons/inr-search-bubble.png", createdAt: "2026-07-09T09:00:00.000Z" },
        { id: "preview-news-3", title: "iNrBadge devient votre passeport de confiance", content: "Un QR code immédiatement accessible rassemble les informations essentielles et facilite le passage de la découverte au contact.", imageUrl: "/icons/inrbadge-dashboard.png", createdAt: "2026-07-06T09:00:00.000Z" },
      ],
      media: [
        { id: "preview-media-1", title: "L’univers iNr’Search", url: "/icons/inr-search-logo.png" },
        { id: "preview-media-2", title: "Le moteur de visibilité", url: "/icons/inr-search-bubble.png" },
        { id: "preview-media-3", title: "Le passeport iNrBadge", url: "/icons/inrbadge-dashboard.png" },
        { id: "preview-media-4", title: "L’écosystème iNrCy", url: "/logo-appli-inrcy.png" },
      ],
      faq: [
        { question: "Qu’est-ce qu’iNr’Search ?", answer: "iNr’Search est une page professionnelle dynamique qui rassemble les informations utiles d’une entreprise dans un parcours horizontal original, lisible par les internautes comme par les moteurs." },
        { question: "Les actualités sont-elles mises à jour automatiquement ?", answer: "Oui. Les publications diffusées vers iNr’Search depuis Booster Publier rejoignent automatiquement la scène Actualités." },
        { question: "Comment présenter mon besoin ?", answer: "La scène Contact permet d’appeler, d’écrire, de localiser l’entreprise, de visiter son site ou d’ouvrir un formulaire de demande." },
        { question: "Puis-je consulter les réalisations en grand ?", answer: "Oui. Chaque réalisation peut être ouverte dans un observatoire plein écran, avec navigation au clavier et restauration du focus." },
        { question: "La page fonctionne-t-elle sur mobile ?", answer: "Oui. Chaque scène se simplifie sans perdre ses informations, tandis que le swipe, les contrôles tactiles et le clavier restent disponibles." },
        { question: "Où intervient iNrCy ?", answer: "iNrCy intervient notamment à Harnes, Arras, Béthune, Lens, Liévin, Douai et Carvin, sous réserve de confirmer le besoin." },
      ],
      inrBadgeUrl: "https://app.inrcy.com/inrbadge/preview-only",
      inrBadgeQrUrl: "https://app.inrcy.com/inrbadge/preview-only?src=inrsearch",
    };
  }

  const configRow = await findPublishedConfigBySlug(slug);
  if (!configRow?.user_id) return null;

  const userId = configRow.user_id;
  const eligibility = await getInrSearchPublicationEligibility(userId);
  if (!eligibility.allowed) return null;
  const rootSettings = asRecord(configRow.settings);
  const config = asRecord(rootSettings.inrSearch);
  const normalizedSlug = normalizeInrSearchDirectorySlug(config.slug);
  if (!normalizedSlug || config.enabled !== true) return null;

  const profileOwnerIds = Array.from(new Set([userId, eligibility.authUserId].filter(Boolean)));
  const [profileRes, businessRes, siteRes, integrationsRes, boosterEventsRes, media] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*")
      .in("user_id", profileOwnerIds)
      .limit(2),
    supabaseAdmin
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("inrcy_site_configs")
      .select("site_url,settings")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("integrations")
      .select("provider,source,product,category,account_email,settings,status,resource_id,resource_label,display_name,email_address,expires_at,access_token_enc,refresh_token_enc,meta,updated_at,created_at")
      .eq("user_id", userId),
    supabaseAdmin
      .from("app_events")
      .select("id,payload,created_at")
      .eq("user_id", userId)
      .eq("module", "booster")
      .eq("type", "publish")
      .order("created_at", { ascending: false })
      .limit(120),
    loadMedia(userId),
  ]);

  const profileRows = Array.isArray(profileRes.data) ? profileRes.data : [];
  const selectedProfile = profileRows.find((row: any) => clean(row?.user_id, 120) === userId)
    || profileRows.find((row: any) => clean(row?.user_id, 120) === eligibility.authUserId)
    || null;
  if (profileRes.error || !selectedProfile) return null;

  const profile = asRecord(selectedProfile);
  const business = asRecord(businessRes.data);
  const siteConfig = asRecord(siteRes.data);
  const logo = await resolveProfileLogoUrl(supabaseAdmin, {
    logo_path: clean(profile.logo_path, 600) || null,
    logo_url: clean(profile.logo_url, 1000) || null,
  });

  const channelStates = await getChannelConnectionStates(supabaseAdmin, userId, {
    profile,
    inrcySiteConfig: siteRes.data,
    proToolsConfig: configRow,
    integrations: Array.isArray(integrationsRes.data) ? integrationsRes.data : [],
  });

  const companyName = clean(profile.company_legal_name, 180) || clean(config.pageTitle, 180) || "Entreprise";
  const contactName = [clean(profile.first_name, 80), clean(profile.last_name, 80)].filter(Boolean).join(" ");
  const phone = clean(profile.phone, 80);
  const email = clean(profile.contact_email, 180);
  const address = clean(profile.hq_address, 240);
  const zip = clean(profile.hq_zip, 30);
  const city = clean(profile.hq_city, 120);
  const country = clean(profile.hq_country, 120) || "France";
  const addressLine = [address, [zip, city].filter(Boolean).join(" "), country].filter(Boolean).join(", ");
  const inrBadgeUrl = createInrBadgePublicUrl({
    userId,
    logoUrl: normalizeExternalUrl(logo.logoUrl),
    companyLegalName: companyName,
    firstName: clean(profile.first_name, 80),
    lastName: clean(profile.last_name, 80),
    phone,
    contactEmail: email,
  });
  const inrBadgeQrUrl = createInrBadgeQrTrackingUrl(inrBadgeUrl);

  const decodedSector = decodeBusinessSector(clean(business.sector, 300));
  const sectorLabel = getActivitySectorLabel(decodedSector.sectorCategory);
  const profession = clean(decodedSector.profession, 180);
  const services = listFromUnknown(Array.isArray(business.services) ? business.services : business.services_text);
  const serviceDescriptions = normalizeServiceDescriptionMap(
    config.serviceDescriptions,
    config.service_descriptions,
    business.service_descriptions,
    business.services_descriptions,
    business.service_details,
    business.services_details,
  );
  const zones = listFromUnknown(Array.isArray(business.intervention_zones) ? business.intervention_zones : business.intervention_zones_text);
  const strengths = listFromUnknown(Array.isArray(business.strengths) ? business.strengths : business.strengths_text);
  const customerTypes = listFromUnknown(business.customer_typologies);
  const openingDays = clean(business.opening_days, 160);
  const openingHours = clean(business.opening_hours, 160);
  const description = clean(config.pageDescription, 500)
    || clean(business.business_description || business.activity_description, 3000)
    || `${companyName}${profession ? `, ${profession.toLowerCase()}` : ""}${city ? ` à ${city}` : ""}.`;

  const websiteUrl = normalizeExternalUrl(
    channelStates.site_web.url
      || channelStates.site_inrcy.url
      || siteConfig.site_url,
  );
  const googleBusinessUrl = normalizeExternalUrl(channelStates.gmb.url);

  const socialLinks: InrSearchSocialLink[] = [
    { key: "website", label: "Site internet", url: websiteUrl },
    { key: "google", label: "Google Business", url: googleBusinessUrl },
    { key: "facebook", label: "Facebook", url: normalizeExternalUrl(channelStates.facebook.page_url) },
    { key: "instagram", label: "Instagram", url: normalizeExternalUrl(channelStates.instagram.profile_url) },
    { key: "linkedin", label: "LinkedIn", url: normalizeExternalUrl(channelStates.linkedin.organization_url || channelStates.linkedin.profile_url) },
    { key: "tiktok", label: "TikTok", url: normalizeExternalUrl(channelStates.tiktok.profile_url) },
    { key: "youtube", label: "YouTube", url: normalizeExternalUrl(channelStates.youtube_shorts.channel_url) },
    { key: "pinterest", label: "Pinterest", url: normalizeExternalUrl(channelStates.pinterest.profile_url) },
  ].filter((item) => Boolean(item.url));

  const faq = buildFaq({ companyName, profession, city, services, zones, customerTypes, phone, email, openingDays, openingHours });
  const publications = normalizeBoosterPublicationEvents(boosterEventsRes.data);
  const updatedAt = latestIsoDate([config.updatedAt, business.updated_at, publications[0]?.createdAt]);

  return {
    userId,
    slug: normalizedSlug,
    pageTitle: clean(config.pageTitle, 180) || companyName,
    pageDescription: clean(config.pageDescription, 500) || description,
    enabled: true,
    sections: normalizeSections(config.sections),
    updatedAt,
    companyName,
    contactName,
    logoUrl: normalizeExternalUrl(logo.logoUrl),
    phone,
    email,
    address,
    zip,
    city,
    country,
    addressLine,
    description,
    sectorCategory: decodedSector.sectorCategory,
    sectorLabel,
    profession,
    services,
    serviceDescriptions,
    zones,
    strengths,
    customerTypes,
    openingDays,
    openingHours,
    websiteUrl,
    googleBusinessUrl,
    socialLinks,
    publications,
    media,
    faq,
    inrBadgeUrl,
    inrBadgeQrUrl,
  };
}

export const loadInrSearchPublicPage = cache(loadInrSearchPublicPageUncached);

export async function getInrSearchPublicStatus(slugValue: unknown): Promise<InrSearchPublicStatus> {
  const slug = normalizeInrSearchDirectorySlug(slugValue);
  const base = { slug, accountId: null as string | null, publicUrl: slug ? buildInrSearchPublicUrl(slug) : "" };
  if (!slug) return { ...base, published: false, reason: "slug_missing" };

  const configRow = await findPublishedConfigBySlug(slug);
  if (!configRow?.user_id) return { ...base, published: false, reason: "config_missing" };

  const accountId = clean(configRow.user_id, 120);
  const config = asRecord(asRecord(configRow.settings).inrSearch);
  if (config.enabled !== true) return { ...base, accountId, published: false, reason: "page_disabled" };

  const eligibility = await getInrSearchPublicationEligibility(accountId);
  if (!eligibility.allowed) {
    return {
      ...base,
      accountId,
      published: false,
      reason: eligibility.reason === "subscription_inactive" ? "subscription_inactive" : "bubble_disabled",
    };
  }

  const profileOwnerIds = Array.from(new Set([accountId, eligibility.authUserId].filter(Boolean)));
  const profile = await supabaseAdmin.from("profiles").select("user_id").in("user_id", profileOwnerIds).limit(1);
  if (profile.error || !Array.isArray(profile.data) || !profile.data.length) {
    return { ...base, accountId, published: false, reason: "profile_missing" };
  }

  const page = await loadInrSearchPublicPageUncached(slug);
  if (!page) return { ...base, accountId, published: false, reason: "data_unavailable" };
  return { ...base, accountId, published: true, reason: "published" };
}


async function listPublishedInrSearchCompaniesUncached(): Promise<PublishedInrSearchCompany[]> {
  const configsRes = await supabaseAdmin
    .from("pro_tools_configs")
    .select("user_id,settings")
    .limit(2000);

  if (configsRes.error || !Array.isArray(configsRes.data)) return [];

  const configs = (configsRes.data as Array<{ user_id: string; settings: unknown }>)
    .map((row) => {
      const config = asRecord(asRecord(row.settings).inrSearch);
      const slug = normalizeInrSearchDirectorySlug(config.slug);
      if (config.enabled !== true || !slug) return null;
      return { userId: row.user_id, slug, config };
    })
    .filter((item): item is { userId: string; slug: string; config: Record<string, unknown> } => Boolean(item));

  if (!configs.length) return [];

  const eligibleUserIds = await filterEligibleInrSearchAccountIds(configs.map((item) => item.userId));
  const eligibleConfigs = configs.filter((item) => eligibleUserIds.has(item.userId));
  if (!eligibleConfigs.length) return [];

  const userIds = eligibleConfigs.map((item) => item.userId);
  const [profilesRes, businessRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*")
      .in("user_id", userIds),
    supabaseAdmin
      .from("business_profiles")
      .select("*")
      .in("user_id", userIds),
  ]);

  const profiles = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(profilesRes.data) ? profilesRes.data : []) profiles.set(clean((row as any).user_id, 120), asRecord(row));
  const businesses = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(businessRes.data) ? businessRes.data : []) businesses.set(clean((row as any).user_id, 120), asRecord(row));

  return eligibleConfigs
    .map((item) => {
      const profile = profiles.get(item.userId) || {};
      const business = businesses.get(item.userId) || {};
      const decodedSector = decodeBusinessSector(clean(business.sector, 300));
      const companyName = clean(profile.company_legal_name, 180) || clean(item.config.pageTitle, 180) || "Entreprise";
      const pageDescription = clean(item.config.pageDescription, 300)
        || clean(business.business_description || business.activity_description, 300)
        || `${companyName}${clean(profile.hq_city, 120) ? ` à ${clean(profile.hq_city, 120)}` : ""}.`;
      const city = clean(profile.hq_city, 120);
      const profession = clean(decodedSector.profession, 180);
      const sectorLabel = getActivitySectorLabel(decodedSector.sectorCategory);
      return {
        slug: item.slug,
        companyName,
        pageTitle: clean(item.config.pageTitle, 180) || companyName,
        pageDescription,
        city,
        citySlug: normalizeInrSearchDirectorySlug(city),
        profession,
        professionSlug: normalizeInrSearchDirectorySlug(profession),
        sectorCategory: decodedSector.sectorCategory,
        sectorLabel,
        sectorSlug: normalizeInrSearchDirectorySlug(sectorLabel),
        updatedAt: clean(item.config.updatedAt || business.updated_at, 80) || null,
      };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "fr"));
}


export const listPublishedInrSearchCompanies = cache(listPublishedInrSearchCompaniesUncached);

function aggregateDirectoryEntries(
  companies: PublishedInrSearchCompany[],
  pick: (company: PublishedInrSearchCompany) => { slug: string; label: string },
): InrSearchDirectoryEntry[] {
  const entries = new Map<string, InrSearchDirectoryEntry>();
  for (const company of companies) {
    const item = pick(company);
    if (!item.slug || !item.label) continue;
    const current = entries.get(item.slug);
    entries.set(item.slug, { slug: item.slug, label: item.label, count: (current?.count || 0) + 1 });
  }
  return Array.from(entries.values()).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export async function listInrSearchProfessions(): Promise<InrSearchDirectoryEntry[]> {
  return aggregateDirectoryEntries(await listPublishedInrSearchCompanies(), (company) => ({
    slug: company.professionSlug,
    label: company.profession,
  }));
}

export async function listInrSearchSectors(): Promise<InrSearchDirectoryEntry[]> {
  return aggregateDirectoryEntries(await listPublishedInrSearchCompanies(), (company) => ({
    slug: company.sectorSlug,
    label: company.sectorLabel,
  }));
}

export async function listInrSearchCitiesForProfession(professionSlug: string): Promise<InrSearchDirectoryEntry[]> {
  const normalized = normalizeInrSearchDirectorySlug(professionSlug);
  const companies = (await listPublishedInrSearchCompanies()).filter((company) => company.professionSlug === normalized);
  return aggregateDirectoryEntries(companies, (company) => ({ slug: company.citySlug, label: company.city }));
}

export async function listInrSearchCompaniesByProfession(professionSlug: string, citySlug?: string): Promise<PublishedInrSearchCompany[]> {
  const profession = normalizeInrSearchDirectorySlug(professionSlug);
  const city = normalizeInrSearchDirectorySlug(citySlug || "");
  return (await listPublishedInrSearchCompanies()).filter((company) =>
    company.professionSlug === profession && (!city || company.citySlug === city),
  );
}

export async function listInrSearchCompaniesBySector(sectorSlug: string): Promise<PublishedInrSearchCompany[]> {
  const sector = normalizeInrSearchDirectorySlug(sectorSlug);
  return (await listPublishedInrSearchCompanies()).filter((company) => company.sectorSlug === sector);
}
