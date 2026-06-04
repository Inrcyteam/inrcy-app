/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { normalizeInrBadgeShareSettings } from "@/lib/inrBadgeSettings";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { decodeBusinessSector } from "@/lib/activitySectors";
import styles from "./badge.module.css";
import BadgeShareButton from "./BadgeShareButton";

export const dynamic = "force-dynamic";

const DEFAULT_INRBADGE_LOGO_SRC = "/icons/inrbadge-dashboard.png";

function getBadgeManifestUrl(slug: string) {
  return `/badge/${encodeURIComponent(slug)}/manifest.webmanifest`;
}

function getBadgeIconUrl(slug: string) {
  return `/badge/${encodeURIComponent(slug)}/icon.png`;
}

function trim(value: unknown) {
  return String(value || "").trim();
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function listFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => trim(item)).filter(Boolean);
  return trim(value)
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(value: unknown) {
  const raw = trim(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function phoneHref(value: string) {
  const cleaned = value.replace(/[^+0-9]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function createMailto(email: string, subject?: string) {
  const clean = trim(email);
  if (!clean) return "";
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${clean}${query}`;
}

function escapeVCard(value: string) {
  return trim(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function createVCardDataUri(input: {
  firstName: string;
  lastName: string;
  displayName: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  zip: string;
  country: string;
}) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(input.lastName)};${escapeVCard(input.firstName)};;;`,
    `FN:${escapeVCard(input.displayName || input.company)}`,
    input.company ? `ORG:${escapeVCard(input.company)}` : "",
    input.phone ? `TEL;TYPE=WORK,VOICE:${escapeVCard(input.phone)}` : "",
    input.email ? `EMAIL;TYPE=WORK:${escapeVCard(input.email)}` : "",
    input.website ? `URL:${escapeVCard(input.website)}` : "",
    input.address || input.city || input.zip || input.country
      ? `ADR;TYPE=WORK:;;${escapeVCard(input.address)};${escapeVCard(input.city)};;${escapeVCard(input.zip)};${escapeVCard(input.country)}`
      : "",
    "END:VCARD",
  ].filter(Boolean);
  return `data:text/vcard;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
}

function safeFilename(value: string) {
  return trim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "contact";
}

async function getBadgeBaseUrl() {
  const explicitBase = String(process.env.NEXT_PUBLIC_INRBADGE_BASE_URL || "").trim();
  if (explicitBase) return explicitBase.replace(/\/+$/, "");

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const proto = headerStore.get("x-forwarded-proto") || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return String(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.inrcy.com"
  ).replace(/\/+$/, "");
}

type ActionTone = "phone" | "mail" | "contact" | "site" | "google" | "linkedin" | "instagram" | "facebook" | "tiktok" | "neutral" | "appointment";

type ActionLinkProps = {
  href: string;
  label: string;
  detail?: string;
  download?: string;
  icon?: string;
  iconSrc?: string;
  tone?: ActionTone;
  compact?: boolean;
};

function ActionLink({ href, label, detail, download, icon, iconSrc, tone = "neutral", compact = false }: ActionLinkProps) {
  const className = [
    styles.action,
    compact ? styles.actionCompact : styles.actionWide,
    styles[`tone_${tone}`],
    detail ? styles.actionWithDetail : styles.actionWithoutDetail,
  ].filter(Boolean).join(" ");

  return (
    <a
      className={className}
      href={href}
      target={download ? undefined : href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      download={download}
    >
      <span className={styles.actionIcon} aria-hidden="true">
        {iconSrc ? <Image className={styles.iconImage} src={iconSrc} alt="" width={28} height={28} unoptimized /> : <span>{icon}</span>}
      </span>
      <span className={styles.actionBody}>
        {compact ? (
          <span className={styles.compactLabelRow}>
            <strong>{label}</strong>
            <span className={styles.arrowInline}>›</span>
          </span>
        ) : (
          <strong>{label}</strong>
        )}
        {detail ? <small>{detail}</small> : null}
      </span>
      {!compact ? <span className={styles.arrow}>›</span> : null}
    </a>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = trim(resolvedParams.slug);
  const iconUrl = getBadgeIconUrl(slug);
  return {
    title: "iNr'Badge",
    manifest: getBadgeManifestUrl(slug),
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
    },
  };
}

export default async function BadgePage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const resolvedParams = await params;
  const slug = trim(resolvedParams.slug);
  const userId = extractInrBadgeUserIdFromSlug(slug);
  if (!userId) notFound();

  const [profileRes, businessRes, toolsRes, siteInrcyRes, integrationsRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id,inrcy_site_ownership,logo_url,logo_path,company_legal_name,first_name,last_name,phone,contact_email,hq_address,hq_zip,hq_city,hq_country")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("business_profiles")
      .select("sector,business_description,activity_description,services,services_text,intervention_zones,intervention_zones_text,opening_days,opening_hours,strengths,strengths_text")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", userId)
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
  ]);

  if (profileRes.error || !profileRes.data) notFound();

  const profile = profileRes.data as Record<string, unknown>;
  const business = (businessRes.data ?? {}) as Record<string, unknown>;
  const toolSettings = safeObj((toolsRes.data as { settings?: unknown } | null)?.settings);
  const shareSettings = normalizeInrBadgeShareSettings(toolSettings.inrBadgeShareSettings);
  const decodedSector = decodeBusinessSector(trim(business.sector));
  const channelStates = await getChannelConnectionStates(supabaseAdmin, userId, {
    profile,
    inrcySiteConfig: siteInrcyRes.data,
    proToolsConfig: toolsRes.data,
    integrations: Array.isArray(integrationsRes.data) ? integrationsRes.data : [],
  });

  const logo = await resolveProfileLogoUrl(supabaseAdmin, {
    logo_path: trim(profile.logo_path) || null,
    logo_url: trim(profile.logo_url) || null,
  });

  const firstName = trim(profile.first_name);
  const lastName = trim(profile.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const company = trim(profile.company_legal_name) || "Entreprise iNrCy";
  const phone = trim(profile.phone);
  const email = trim(profile.contact_email);
  const address = trim(profile.hq_address);
  const zip = trim(profile.hq_zip);
  const city = trim(profile.hq_city);
  const country = trim(profile.hq_country) || "France";
  const description = trim(business.business_description) || trim(business.activity_description);
  const services = listFromUnknown(business.services).length ? listFromUnknown(business.services) : listFromUnknown(business.services_text);
  const zones = listFromUnknown(business.intervention_zones).length ? listFromUnknown(business.intervention_zones) : listFromUnknown(business.intervention_zones_text);
  const strengths = listFromUnknown(business.strengths).length ? listFromUnknown(business.strengths) : listFromUnknown(business.strengths_text);
  const openingDays = trim(business.opening_days);
  const openingHours = trim(business.opening_hours);

  const siteWebSettings = safeObj(toolSettings.site_web);
  const gmbSettings = safeObj(toolSettings.gmb);
  const facebookSettings = safeObj(toolSettings.facebook);
  const instagramSettings = safeObj(toolSettings.instagram);
  const linkedinSettings = safeObj(toolSettings.linkedin);
  const tiktokSettings = safeObj(toolSettings.tiktok);

  const siteInrcyUrl = normalizeUrl(channelStates.site_inrcy.url || (siteInrcyRes.data as { site_url?: string | null } | null)?.site_url);
  const siteWebUrl = normalizeUrl(channelStates.site_web.url || siteWebSettings.url);
  const gmbUrl = normalizeUrl(channelStates.gmb.url || gmbSettings.url);
  const facebookUrl = normalizeUrl(channelStates.facebook.page_url || facebookSettings.url);
  const instagramUsername = trim(
    instagramSettings.username ||
    instagramSettings.resource_label ||
    instagramSettings.resourceLabel ||
    instagramSettings.handle,
  ).replace(/^@+/, "");
  const instagramUrl = normalizeUrl(
    channelStates.instagram.profile_url ||
    instagramSettings.url ||
    instagramSettings.profile_url ||
    instagramSettings.profileUrl ||
    instagramSettings.profile ||
    (instagramUsername ? `https://www.instagram.com/${instagramUsername}/` : ""),
  );
  const linkedinUrl = normalizeUrl(channelStates.linkedin.organization_url || channelStates.linkedin.profile_url || linkedinSettings.orgUrl || linkedinSettings.profileUrl || linkedinSettings.url);
  const tiktokUrl = normalizeUrl(channelStates.tiktok.profile_url || tiktokSettings.url);
  const primaryWebsite = siteWebUrl || siteInrcyUrl;

  const publicChannelCanShare = {
    siteInrcy: Boolean(channelStates.site_inrcy.connected && siteInrcyUrl),
    siteWeb: Boolean(channelStates.site_web.connected && siteWebUrl),
    googleBusiness: Boolean(channelStates.gmb.connected && gmbUrl),
    facebook: Boolean(channelStates.facebook.connected && facebookUrl),
    instagram: Boolean(channelStates.instagram.connected && instagramUrl),
    linkedin: Boolean(channelStates.linkedin.connected && linkedinUrl),
    tiktok: Boolean(channelStates.tiktok.connected && tiktokUrl),
  };
  const selectedMailAccountId = trim(toolSettings.inrBadgeMailAccountId);
  let selectedMailAccountEmail = "";

  if (selectedMailAccountId) {
    const selectedMailRes = await supabaseAdmin
      .from("integrations")
      .select("account_email,status,settings")
      .eq("user_id", userId)
      .eq("id", selectedMailAccountId)
      .eq("category", "mail")
      .maybeSingle();
    const selectedMailRow = (selectedMailRes.data ?? {}) as Record<string, unknown>;
    if (trim(selectedMailRow.status).toLowerCase() === "connected") {
      selectedMailAccountEmail = trim(selectedMailRow.account_email);
    }
  }

  const badgeEmail = selectedMailAccountEmail || email;

  const publicUrl = `${await getBadgeBaseUrl()}/badge/${slug}`;

  const vCardUri = createVCardDataUri({
    firstName,
    lastName,
    displayName,
    company,
    phone: shareSettings.phone ? phone : "",
    email: shareSettings.email ? badgeEmail : "",
    website: primaryWebsite,
    address,
    city,
    zip,
    country,
  });
  const vCardFilename = `${safeFilename(company || displayName)}.vcf`;

  const primaryActions = [
    shareSettings.phone && phone && phoneHref(phone) ? { href: phoneHref(phone), label: "Appeler", icon: "☎", tone: "phone" as ActionTone } : null,
    shareSettings.email && badgeEmail ? { href: createMailto(badgeEmail), label: "Mail", icon: "✉", tone: "mail" as ActionTone } : null,
    shareSettings.saveContact ? { href: vCardUri, label: "Enregistrer", download: vCardFilename, icon: "👤", tone: "contact" as ActionTone } : null,
  ].filter(Boolean) as ActionLinkProps[];

  const channelActions = [
    shareSettings.siteInrcy && publicChannelCanShare.siteInrcy ? { href: siteInrcyUrl, label: "Site iNrCy", iconSrc: "/icons/inrcy.png", tone: "site" as ActionTone } : null,
    shareSettings.siteWeb && publicChannelCanShare.siteWeb ? { href: siteWebUrl, label: "Site web", iconSrc: "/icons/site-web.jpg", tone: "site" as ActionTone } : null,
    shareSettings.googleBusiness && publicChannelCanShare.googleBusiness ? { href: gmbUrl, label: "Google Business", iconSrc: "/icons/google.jpg", tone: "google" as ActionTone } : null,
    shareSettings.linkedin && publicChannelCanShare.linkedin ? { href: linkedinUrl, label: "LinkedIn", iconSrc: "/icons/linkedin.png", tone: "linkedin" as ActionTone } : null,
    shareSettings.instagram && publicChannelCanShare.instagram ? { href: instagramUrl, label: "Instagram", iconSrc: "/icons/instagram.jpg", tone: "instagram" as ActionTone } : null,
    shareSettings.facebook && publicChannelCanShare.facebook ? { href: facebookUrl, label: "Facebook", iconSrc: "/icons/facebook.png", tone: "facebook" as ActionTone } : null,
    shareSettings.tiktok && publicChannelCanShare.tiktok ? { href: tiktokUrl, label: "TikTok", iconSrc: "/icons/tiktok.png", tone: "tiktok" as ActionTone } : null,
  ].filter(Boolean) as ActionLinkProps[];

  const appointmentAction = shareSettings.appointment
    ? { href: `/badge/${slug}/rdv`, label: "Prendre RDV", iconSrc: "/inrcalendar-logo.png", tone: "appointment" as ActionTone }
    : null;

  const headerInfoLine = [
    shareSettings.company ? company : "",
    shareSettings.name ? displayName : "",
  ].filter(Boolean).join(" / ");

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.cardGlowA} />
          <div className={styles.cardGlowB} />

          <div className={styles.headerRow}>
            <div className={styles.headerTopBar}>
              <BadgeShareButton publicUrl={publicUrl} company={company} vCardUri={vCardUri} vCardFilename={vCardFilename} />
              <div className={styles.headerIdentity}>
                <div className={styles.logo} aria-hidden="true">
                  {shareSettings.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo.logoUrl || DEFAULT_INRBADGE_LOGO_SRC} alt="" />
                  ) : <span>iNr</span>}
                </div>
              </div>
            </div>

            {headerInfoLine ? <p className={styles.headerInfoLine}>{headerInfoLine}</p> : null}
          </div>

          {decodedSector.profession ? <p className={styles.job}>{decodedSector.profession}</p> : null}
          {description ? <p className={styles.description}>{description}</p> : null}

          {primaryActions.length > 0 ? (
            <div className={styles.primaryGrid} data-count={primaryActions.length}>
              {primaryActions.map((action) => (
                <ActionLink key={`${action.label}-${action.href}`} {...action} compact />
              ))}
            </div>
          ) : null}

          {channelActions.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionMark} />
                <h2>Mes canaux</h2>
              </div>
              <div className={styles.channelsGrid} data-count={channelActions.length}>
                {channelActions.map((action) => (
                  <ActionLink key={`${action.label}-${action.href}`} {...action} />
                ))}
              </div>
            </section>
          ) : null}

          {appointmentAction ? (
            <div className={styles.ctaWrap}>
              <ActionLink {...appointmentAction} />
            </div>
          ) : null}

          {(openingDays || openingHours || zones.length > 0) ? (
            <div className={styles.infoGrid}>
              {(openingDays || openingHours) ? (
                <div className={styles.infoItem}>
                  <strong>Horaires</strong>
                  {[openingDays, openingHours].filter(Boolean).join(" · ")}
                </div>
              ) : null}
              {zones.length > 0 ? (
                <div className={styles.infoItem}>
                  <strong>Zones d’intervention</strong>
                  {zones.slice(0, 8).join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {(services.length > 0 || strengths.length > 0) ? (
            <div className={styles.services}>
              {[...services.slice(0, 8), ...strengths.slice(0, 4)].slice(0, 10).map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <span>iNr&apos;Badge</span>
          <span className={styles.footerDot}>·</span>
          <span>Propulsé par <strong>iNrCy</strong></span>
        </div>
      </section>
    </main>
  );
}
