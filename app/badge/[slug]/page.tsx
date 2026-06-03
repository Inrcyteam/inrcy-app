import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { normalizeInrBadgeShareSettings } from "@/lib/inrBadgeSettings";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import { decodeBusinessSector } from "@/lib/activitySectors";
import styles from "./badge.module.css";
import BadgeShareButton from "./BadgeShareButton";

export const dynamic = "force-dynamic";

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

type ActionTone = "phone" | "mail" | "contact" | "site" | "google" | "linkedin" | "instagram" | "facebook" | "tiktok" | "neutral" | "appointment";


function getBadgeBaseUrl() {
  return String(
    process.env.NEXT_PUBLIC_INRBADGE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.inrcy.com"
  ).replace(/\/+$/, "");
}

type ActionLinkProps = {
  href: string;
  label: string;
  detail?: string;
  download?: string;
  icon: string;
  tone?: ActionTone;
  compact?: boolean;
};

function ActionLink({ href, label, detail, download, icon, tone = "neutral", compact = false }: ActionLinkProps) {
  const className = [styles.action, compact ? styles.actionCompact : styles.actionWide, styles[`tone_${tone}`]].filter(Boolean).join(" ");
  return (
    <a className={className} href={href} target={download ? undefined : href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} download={download}>
      <span className={styles.actionIcon} aria-hidden="true">{icon}</span>
      <span className={styles.actionBody}>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className={styles.arrow}>›</span>
    </a>
  );
}

export default async function BadgePage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const resolvedParams = await params;
  const slug = trim(resolvedParams.slug);
  const userId = extractInrBadgeUserIdFromSlug(slug);
  if (!userId) notFound();

  const [profileRes, businessRes, toolsRes, siteInrcyRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id,logo_url,logo_path,company_legal_name,first_name,last_name,phone,contact_email,hq_address,hq_zip,hq_city,hq_country")
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
      .select("site_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) notFound();

  const profile = profileRes.data as Record<string, unknown>;
  const business = (businessRes.data ?? {}) as Record<string, unknown>;
  const toolSettings = safeObj((toolsRes.data as { settings?: unknown } | null)?.settings);
  const shareSettings = normalizeInrBadgeShareSettings(toolSettings.inrBadgeShareSettings);
  const decodedSector = decodeBusinessSector(trim(business.sector));

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

  const siteInrcyUrl = normalizeUrl((siteInrcyRes.data as { site_url?: string | null } | null)?.site_url);
  const siteWebUrl = normalizeUrl(siteWebSettings.url);
  const gmbUrl = normalizeUrl(gmbSettings.url);
  const facebookUrl = normalizeUrl(facebookSettings.url);
  const instagramUrl = normalizeUrl(instagramSettings.url);
  const linkedinUrl = normalizeUrl(linkedinSettings.orgUrl || linkedinSettings.profileUrl || linkedinSettings.url);
  const tiktokUrl = normalizeUrl(tiktokSettings.url);
  const primaryWebsite = siteWebUrl || siteInrcyUrl;

  const publicUrl = `${getBadgeBaseUrl()}/badge/${slug}`;

  const vCardUri = createVCardDataUri({
    firstName,
    lastName,
    displayName,
    company,
    phone: shareSettings.phone ? phone : "",
    email: shareSettings.email ? email : "",
    website: primaryWebsite,
    address,
    city,
    zip,
    country,
  });
  const vCardFilename = `${safeFilename(company || displayName)}.vcf`;

  const primaryActions = [
    shareSettings.phone && phone && phoneHref(phone) ? { href: phoneHref(phone), label: "Appeler", detail: phone, icon: "☎", tone: "phone" as ActionTone } : null,
    shareSettings.email && email ? { href: createMailto(email), label: "Envoyer un mail", detail: email, icon: "✉", tone: "mail" as ActionTone } : null,
    shareSettings.saveContact ? { href: vCardUri, label: "Enregistrer", detail: "Le contact", download: vCardFilename, icon: "👤", tone: "contact" as ActionTone } : null,
  ].filter(Boolean) as ActionLinkProps[];

  const channelActions = [
    shareSettings.siteInrcy && siteInrcyUrl ? { href: siteInrcyUrl, label: "Site iNrCy", detail: "inrcy.com", icon: "◎", tone: "site" as ActionTone } : null,
    shareSettings.siteWeb && siteWebUrl ? { href: siteWebUrl, label: "Site web", detail: siteWebUrl.replace(/^https?:\/\//, ""), icon: "◌", tone: "site" as ActionTone } : null,
    shareSettings.googleBusiness && gmbUrl ? { href: gmbUrl, label: "Google Business", detail: "Voir la fiche", icon: "G", tone: "google" as ActionTone } : null,
    shareSettings.linkedin && linkedinUrl ? { href: linkedinUrl, label: "LinkedIn", detail: "Ajouter / suivre", icon: "in", tone: "linkedin" as ActionTone } : null,
    shareSettings.instagram && instagramUrl ? { href: instagramUrl, label: "Instagram", detail: "Suivre le compte", icon: "◎", tone: "instagram" as ActionTone } : null,
    shareSettings.facebook && facebookUrl ? { href: facebookUrl, label: "Facebook", detail: "Voir la page", icon: "f", tone: "facebook" as ActionTone } : null,
    shareSettings.tiktok && tiktokUrl ? { href: tiktokUrl, label: "TikTok", detail: "Voir le profil", icon: "♪", tone: "tiktok" as ActionTone } : null,
  ].filter(Boolean) as ActionLinkProps[];

  const appointmentAction = shareSettings.appointment ? { href: `/badge/${slug}/rdv`, label: "Prendre RDV", detail: "Réserver dans iNr'Calendar", icon: "◷", tone: "appointment" as ActionTone } : null;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.headerRow}>
            <div className={styles.headerIdentity}>
              <div className={styles.logo} aria-hidden="true">
                {shareSettings.logo && logo.logoUrl ? <img src={logo.logoUrl} alt="" /> : <span>iNr</span>}
              </div>

              <div className={styles.identityText}>
                <div className={styles.badgeLabel}>iNr&apos;Badge</div>
                {shareSettings.company ? <h1 className={styles.title}>{company}</h1> : null}
                {shareSettings.name && displayName ? <p className={styles.name}>{displayName}</p> : null}
              </div>
            </div>

            <BadgeShareButton publicUrl={publicUrl} company={company} vCardUri={vCardUri} vCardFilename={vCardFilename} />
          </div>

          {decodedSector.profession ? <p className={styles.job}>{decodedSector.profession}</p> : null}
          {description ? <p className={styles.description}>{description}</p> : null}

          {primaryActions.length > 0 ? (
            <div className={styles.primaryGrid}>
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
              <div className={styles.channelsGrid}>
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
          Propulsé par <strong>iNrCy</strong>
        </div>
      </section>
    </main>
  );
}
