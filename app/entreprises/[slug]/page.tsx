import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  buildInrSearchProfessionUrl,
  buildInrSearchPublicUrl,
  buildInrSearchSectorUrl,
  loadInrSearchPublicPage,
  normalizeInrSearchDirectorySlug,
  type InrSearchPublicPageData,
} from "@/lib/inrSearchPublic";
import styles from "./inrSearchPublic.module.css";
import InrSearchAnalyticsClient from "./InrSearchAnalyticsClient";
import InrSearchLeadForm from "./InrSearchLeadForm";
import { createInrBadgeQrMatrix } from "@/lib/inrBadgeQr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ slug: string }>;
};

type IconName =
  | "arrow"
  | "calendar"
  | "check"
  | "clock"
  | "email"
  | "globe"
  | "location"
  | "phone"
  | "qr"
  | "search"
  | "services"
  | "sparkles"
  | "users";

function Icon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14" {...common} /><path d="m14 7 5 5-5 5" {...common} /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" {...common} /><path d="M8 3v4M16 3v4M3 10h18" {...common} /></>,
    check: <path d="m5 12 4 4L19 6" {...common} />,
    clock: <><circle cx="12" cy="12" r="9" {...common} /><path d="M12 7v5l3 2" {...common} /></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="3" {...common} /><path d="m4 7 8 6 8-6" {...common} /></>,
    globe: <><circle cx="12" cy="12" r="9" {...common} /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" {...common} /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" {...common} /><circle cx="12" cy="10" r="2.5" {...common} /></>,
    phone: <path d="M8.2 3.8 10 8.2 7.7 10a15 15 0 0 0 6.3 6.3l1.8-2.3 4.4 1.8v3.3c0 1-.8 1.8-1.8 1.8C9.9 20.9 3.1 14.1 3.1 5.6c0-1 .8-1.8 1.8-1.8h3.3Z" {...common} />,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" {...common} /><path d="M14 14h2v2h-2zM18 14h2v4h-2zM14 18h4v2h-4z" {...common} /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" {...common} /><path d="m15.5 15.5 5 5" {...common} /></>,
    services: <><path d="M4 7h16M4 12h10M4 17h13" {...common} /><circle cx="19" cy="17" r="2" {...common} /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" {...common} /><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12Z" {...common} /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...common} /><circle cx="9" cy="7" r="4" {...common} /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" {...common} /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function InrBadgeQr({ value, label }: { value: string; label: string }) {
  let matrix: boolean[][] = [];
  try {
    matrix = createInrBadgeQrMatrix(value);
  } catch {
    matrix = [];
  }
  if (!matrix.length) return null;

  const quietZone = 4;
  const viewBoxSize = matrix.length + quietZone * 2;
  const path = matrix
    .flatMap((row, rowIndex) => row.map((dark, colIndex) => dark ? `M${colIndex + quietZone},${rowIndex + quietZone}h1v1h-1z` : ""))
    .filter(Boolean)
    .join(" ");

  return (
    <svg className={styles.badgeQrSvg} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={viewBoxSize} height={viewBoxSize} rx="2.5" className={styles.badgeQrBackground} />
      <path d={path} className={styles.badgeQrModules} />
    </svg>
  );
}

function withSource(value: string, source: string) {
  try {
    const url = new URL(value);
    url.searchParams.set("src", source);
    return url.toString();
  } catch {
    return value;
  }
}

function safeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildJsonLd(data: InrSearchPublicPageData) {
  const sameAs = [data.inrBadgeUrl, ...data.socialLinks.map((link) => link.url)].filter(Boolean);
  const offers = data.services.map((service) => ({
    "@type": "Offer",
    itemOffered: {
      "@type": "Service",
      name: service,
      areaServed: data.zones.length ? data.zones : undefined,
    },
  }));

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${buildInrSearchPublicUrl(data.slug)}#business`,
    name: data.companyName,
    description: data.description,
    url: buildInrSearchPublicUrl(data.slug),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": buildInrSearchPublicUrl(data.slug),
    },
    image: data.logoUrl || data.media[0]?.url || undefined,
    logo: data.logoUrl || undefined,
    telephone: data.phone || undefined,
    email: data.email || undefined,
    address: data.addressLine
      ? {
          "@type": "PostalAddress",
          streetAddress: data.address || undefined,
          postalCode: data.zip || undefined,
          addressLocality: data.city || undefined,
          addressCountry: data.country || "FR",
        }
      : undefined,
    areaServed: data.zones.length ? data.zones : undefined,
    openingHours: data.openingHours || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    knowsAbout: [data.profession, ...data.services].filter(Boolean),
    hasOfferCatalog: offers.length
      ? {
          "@type": "OfferCatalog",
          name: `Prestations de ${data.companyName}`,
          itemListElement: offers,
        }
      : undefined,
  };
}

function buildFaqJsonLd(data: InrSearchPublicPageData) {
  if (!data.sections.faq || !data.faq.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: data.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadInrSearchPublicPage(slug);
  if (!data) {
    return {
      title: "Entreprise introuvable | iNrCy",
      robots: { index: false, follow: false },
    };
  }

  const canonical = buildInrSearchPublicUrl(data.slug);
  const title = `${data.pageTitle} | iNr'Search`;
  const description = data.pageDescription.slice(0, 160);
  const image = data.logoUrl || data.media[0]?.url || undefined;

  return {
    title,
    description,
    applicationName: "iNr'Search",
    category: data.sectorLabel || data.profession || "Entreprise locale",
    referrer: "strict-origin-when-cross-origin",
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      url: canonical,
      siteName: "iNrCy",
      title,
      description,
      images: image ? [{ url: image, alt: data.companyName }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function InrSearchCompanyPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadInrSearchPublicPage(slug);
  if (!data) notFound();
  if (normalizeInrSearchDirectorySlug(slug) !== data.slug) {
    permanentRedirect(`/entreprises/${data.slug}`);
  }

  const updatedLabel = formatDate(data.updatedAt);
  const localBusinessJsonLd = buildJsonLd(data);
  const faqJsonLd = buildFaqJsonLd(data);
  const phoneHref = data.phone ? `tel:${data.phone.replace(/[^+\d]/g, "")}` : "";
  const emailHref = data.email ? `mailto:${data.email}` : "";
  const contactHref = phoneHref || emailHref;
  const professionSlug = normalizeInrSearchDirectorySlug(data.profession);
  const sectorSlug = normalizeInrSearchDirectorySlug(data.sectorLabel);
  const citySlug = normalizeInrSearchDirectorySlug(data.city);
  const professionUrl = professionSlug ? buildInrSearchProfessionUrl(professionSlug) : "";
  const professionCityUrl = professionSlug && citySlug ? buildInrSearchProfessionUrl(professionSlug, citySlug) : "";
  const sectorUrl = sectorSlug ? buildInrSearchSectorUrl(sectorSlug) : "";
  const heroImage = data.media[0]?.url || "";
  const heroImageTitle = data.media[0]?.title || data.companyName;
  const inrBadgeOpenUrl = withSource(data.inrBadgeUrl, "inrsearch");
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Entreprises", item: `${buildInrSearchPublicUrl(data.slug).split("/entreprises/")[0]}/entreprises` },
      ...(data.profession && professionUrl ? [{ "@type": "ListItem", position: 2, name: data.profession, item: professionUrl }] : []),
      { "@type": "ListItem", position: data.profession && professionUrl ? 3 : 2, name: data.pageTitle, item: buildInrSearchPublicUrl(data.slug) },
    ],
  };

  const facts = [
    data.sections.contact && data.addressLine
      ? { icon: "location" as IconName, label: "Adresse", value: data.addressLine, href: data.googleBusinessUrl || "", actionKey: data.googleBusinessUrl ? "directions" : "" }
      : null,
    data.sections.contact && (data.phone || data.email)
      ? { icon: data.phone ? "phone" as IconName : "email" as IconName, label: "Contact", value: data.phone || data.email, href: phoneHref || emailHref, actionKey: data.phone ? "phone" : "email" }
      : null,
    data.sections.hours && (data.openingDays || data.openingHours)
      ? { icon: "clock" as IconName, label: "Horaires", value: [data.openingDays, data.openingHours].filter(Boolean).join(" · "), href: "", actionKey: "" }
      : null,
    data.sections.sectors && (data.profession || data.sectorLabel)
      ? { icon: "services" as IconName, label: "Activité", value: data.profession || data.sectorLabel, href: professionUrl || sectorUrl, actionKey: "" }
      : null,
  ].filter(Boolean) as Array<{ icon: IconName; label: string; value: string; href: string; actionKey: string }>;

  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#contenu-principal">Aller au contenu principal</a>
      <InrSearchAnalyticsClient slug={data.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(localBusinessJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      {faqJsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} /> : null}

      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <a className={styles.brandLockup} href="https://inrcy.com" aria-label="iNrCy">
            <img className={styles.inrcyLogo} src="/logo-inrcy.png" alt="iNrCy" width={160} height={64} decoding="async" />
            <span className={styles.brandDivider} aria-hidden="true" />
            <span className={styles.searchBrand}>
              <img src="/icons/inr-search-bubble-128.png" alt="" aria-hidden="true" width={44} height={44} decoding="async" />
              <span>iNr&apos;Search</span>
            </span>
          </a>
          <nav className={styles.topbarLinks} aria-label="Annuaire iNr'Search">
            <Link href="/entreprises">Entreprises</Link>
            <Link href="/metiers">Métiers</Link>
            <Link href="/secteurs">Secteurs</Link>
          </nav>
          <a className={styles.inrcyCta} href="https://inrcy.com">
            Découvrir iNrCy
            <Icon name="arrow" />
          </a>
        </div>
      </header>

      <section className={styles.hero} id="contenu-principal" tabIndex={-1}>
        <div className={styles.heroNoise} aria-hidden="true" />
        <div className={styles.heroOrbOne} aria-hidden="true" />
        <div className={styles.heroOrbTwo} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <div className={styles.profileBadge}>
              <span><Icon name="search" /></span>
              Page professionnelle iNr&apos;Search
              {updatedLabel ? <small>Actualisée le <time dateTime={data.updatedAt || undefined}>{updatedLabel}</time></small> : null}
            </div>

            {data.sections.identity ? (
              <div className={styles.identity}>
                {data.logoUrl ? (
                  <div className={styles.logoWrap}>
                    <img src={data.logoUrl} alt={`Logo ${data.companyName}`} width={160} height={160} decoding="async" />
                  </div>
                ) : (
                  <div className={styles.logoFallback} aria-hidden="true">{data.companyName.slice(0, 1).toUpperCase()}</div>
                )}
                <div className={styles.identityText}>
                  <div className={styles.eyebrow}>
                    {data.profession && professionUrl ? <a href={professionUrl}>{data.profession}</a> : data.profession || data.sectorLabel}
                    {data.city ? <><span>à</span>{professionCityUrl ? <a href={professionCityUrl}>{data.city}</a> : data.city}</> : null}
                  </div>
                  <h1>{data.pageTitle}</h1>
                  {data.contactName ? <p className={styles.contactName}>Votre interlocuteur : <strong>{data.contactName}</strong></p> : null}
                </div>
              </div>
            ) : null}

            {data.sections.presentation ? <p className={styles.heroDescription}>{data.description}</p> : null}

            <div className={styles.heroSignals}>
              {data.services.length ? <span><Icon name="services" />{data.services.length} prestation{data.services.length > 1 ? "s" : ""}</span> : null}
              {data.zones.length ? <span><Icon name="location" />{data.zones.length} zone{data.zones.length > 1 ? "s" : ""} couverte{data.zones.length > 1 ? "s" : ""}</span> : null}
              {data.socialLinks.length ? <span><Icon name="globe" />Présence en ligne active</span> : null}
              {data.inrBadgeUrl ? <span><Icon name="qr" />iNr'Badge à scanner</span> : null}
            </div>

            {data.sections.cta ? (
              <div className={styles.heroActions}>
                <a className={styles.primaryAction} href="#demande"><Icon name="sparkles" />Présenter mon besoin</a>
                {phoneHref ? <a className={styles.secondaryAction} href={phoneHref} data-inrsearch-action="phone" data-inrsearch-target={phoneHref}><Icon name="phone" />Appeler maintenant</a> : null}
                {!phoneHref && emailHref ? <a className={styles.secondaryAction} href={emailHref} data-inrsearch-action="email" data-inrsearch-target={emailHref}><Icon name="email" />Écrire à l’entreprise</a> : null}
                {data.websiteUrl ? <a className={styles.secondaryAction} href={data.websiteUrl} target="_blank" rel="noopener noreferrer" data-inrsearch-action="website" data-inrsearch-target={data.websiteUrl}><Icon name="globe" />Voir le site</a> : null}
                {data.googleBusinessUrl ? <a className={styles.secondaryAction} href={data.googleBusinessUrl} target="_blank" rel="noopener noreferrer" data-inrsearch-action="directions" data-inrsearch-target={data.googleBusinessUrl}><Icon name="location" />Itinéraire</a> : null}
              </div>
            ) : null}
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.visualFrame}>
              {heroImage ? (
                <img src={heroImage} alt={heroImageTitle} loading="eager" fetchPriority="high" decoding="async" />
              ) : (
                <div className={styles.visualFallback}>
                  {data.logoUrl ? <img src={data.logoUrl} alt="" aria-hidden="true" width={240} height={240} decoding="async" /> : <span>{data.companyName.slice(0, 1).toUpperCase()}</span>}
                </div>
              )}
              <div className={styles.visualOverlay} />
              <div className={styles.visualCaption}>
                <span>Profil professionnel</span>
                <strong>{data.companyName}</strong>
                <small>{[data.profession, data.city].filter(Boolean).join(" · ")}</small>
              </div>
            </div>
            <div className={styles.floatingCardOne}>
              <span><Icon name="sparkles" /></span>
              <div><strong>Une présence claire</strong><small>pour les moteurs de recherche et les IA</small></div>
            </div>
            {data.sections.hours && data.openingHours ? (
              <div className={styles.floatingCardTwo}>
                <span><Icon name="clock" /></span>
                <div><small>Horaires</small><strong>{data.openingHours}</strong></div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.content}>
        {facts.length ? (
          <section className={styles.factsGrid} aria-label="Informations principales">
            {facts.map((fact) => {
              const body = (
                <>
                  <span className={styles.factIcon}><Icon name={fact.icon} /></span>
                  <span className={styles.factContent}>
                    <small>{fact.label}</small>
                    <strong>{fact.value}</strong>
                  </span>
                  {fact.href ? <span className={styles.factArrow}><Icon name="arrow" /></span> : null}
                </>
              );
              return fact.href ? (
                <a className={styles.factCard} href={fact.href} key={fact.label} target={fact.href.startsWith("http") ? "_blank" : undefined} rel={fact.href.startsWith("http") ? "noreferrer" : undefined} data-inrsearch-action={fact.actionKey || undefined} data-inrsearch-target={fact.actionKey ? fact.href : undefined}>{body}</a>
              ) : (
                <article className={styles.factCard} key={fact.label}>{body}</article>
              );
            })}
          </section>
        ) : null}

        {data.inrBadgeUrl && data.inrBadgeQrUrl ? (
          <section className={`${styles.section} ${styles.badgeSection}`} aria-labelledby="inrbadge-title">
            <div className={styles.badgePanel}>
              <div className={styles.badgeGlow} aria-hidden="true" />
              <div className={styles.badgeCopy}>
                <div className={styles.sectionKicker}><Icon name="qr" />iNr&apos;Badge</div>
                <h2 id="inrbadge-title">Scannez et gardez {data.companyName} à portée de main</h2>
                <p>Le QR code ouvre la fiche mobile iNr&apos;Badge de l’entreprise pour retrouver rapidement ses coordonnées, ses accès utiles et ses moyens de contact.</p>
                <div className={styles.badgeBenefits} aria-label="Avantages iNr'Badge">
                  <span><Icon name="check" />Fiche mobile immédiate</span>
                  <span><Icon name="check" />Coordonnées faciles à conserver</span>
                  <span><Icon name="check" />Accès direct aux actions utiles</span>
                </div>
                <a className={styles.badgeAction} href={inrBadgeOpenUrl} target="_blank" rel="noopener noreferrer" data-inrsearch-action="inrbadge" data-inrsearch-target={inrBadgeOpenUrl}>
                  <Icon name="qr" />Ouvrir la fiche iNr&apos;Badge<Icon name="arrow" />
                </a>
              </div>
              <div className={styles.badgeVisual}>
                <div className={styles.badgeQrFrame}>
                  <InrBadgeQr value={data.inrBadgeQrUrl} label={`QR Code iNr'Badge de ${data.companyName}`} />
                </div>
                <div className={styles.badgeScanLabel}>
                  <span><Icon name="phone" /></span>
                  <div><strong>Scannez avec votre téléphone</strong><small>La fiche s’ouvre instantanément</small></div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {data.sections.services && data.services.length ? (
          <section className={`${styles.section} ${styles.servicesSection}`}>
            <div className={styles.sectionIntro}>
              <div className={styles.sectionKicker}><Icon name="sparkles" />Expertise</div>
              <h2>Des prestations pensées pour vos besoins</h2>
              <p>Découvrez les principaux savoir-faire proposés par {data.companyName}.</p>
            </div>
            <div className={styles.serviceGrid}>
              {data.services.map((service, index) => (
                <article className={styles.serviceCard} key={service}>
                  <span className={styles.serviceNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.serviceIcon}><Icon name="check" /></span>
                  <h3>{service}</h3>
                  <div className={styles.serviceLine} aria-hidden="true" />
                </article>
              ))}
            </div>
            {data.customerTypes.length ? (
              <div className={styles.audienceStrip}>
                <span className={styles.audienceIcon}><Icon name="users" /></span>
                <div>
                  <small>Pour qui ?</small>
                  <strong>{data.customerTypes.join(" · ")}</strong>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {data.sections.areas && data.zones.length ? (
          <section className={`${styles.section} ${styles.areaSection}`}>
            <div className={styles.areaPanel}>
              <div className={styles.areaDecor} aria-hidden="true"><Icon name="location" /></div>
              <div className={styles.sectionKicker}><Icon name="location" />Proximité</div>
              <h2>Une entreprise proche de vous</h2>
              <p>{data.companyName} intervient notamment dans ces zones :</p>
              <div className={styles.zoneGrid}>
                {data.zones.map((zone) => <span key={zone}><Icon name="location" />{zone}</span>)}
              </div>
            </div>
          </section>
        ) : null}

        {data.sections.trust && data.strengths.length ? (
          <section className={styles.section}>
            <div className={styles.sectionIntro}>
              <div className={styles.sectionKicker}><Icon name="check" />Vos garanties</div>
              <h2>Pourquoi choisir {data.companyName} ?</h2>
              <p>Les points forts mis en avant par l’entreprise pour vous accompagner sereinement.</p>
            </div>
            <div className={styles.strengthGrid}>
              {data.strengths.map((strength, index) => (
                <article className={styles.strengthCard} key={strength}>
                  <span className={styles.strengthIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.strengthCheck}><Icon name="check" /></span>
                  <strong>{strength}</strong>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {data.sections.media && data.media.length ? (
          <section className={styles.section}>
            <div className={styles.sectionIntroRow}>
              <div className={styles.sectionIntro}>
                <div className={styles.sectionKicker}><Icon name="sparkles" />En images</div>
                <h2>Plongez dans l’univers de l’entreprise</h2>
              </div>
              <p>Réalisations, savoir-faire et quotidien professionnel.</p>
            </div>
            <div className={styles.mediaGrid}>
              {data.media.map((media, index) => (
                <figure className={`${styles.mediaCard} ${index === 0 ? styles.mediaCardFeatured : ""}`} key={media.id}>
                  <img src={media.url} alt={media.title} loading={index > 0 ? "lazy" : "eager"} decoding="async" />
                  <figcaption>{media.title}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {data.sections.news && data.publications.length ? (
          <section className={styles.section}>
            <div className={styles.sectionIntroRow}>
              <div className={styles.sectionIntro}>
                <div className={styles.sectionKicker}><Icon name="calendar" />Booster · Publier</div>
                <h2>Les dernières publications</h2>
              </div>
              <p>Les contenus réellement publiés par l’entreprise depuis Booster sont repris automatiquement ici.</p>
            </div>
            <div className={styles.newsGrid}>
              {data.publications.map((publication) => (
                <article className={styles.newsCard} key={publication.id}>
                  <div className={styles.newsMedia}>
                    {publication.imageUrl ? <img src={publication.imageUrl} alt="" loading="lazy" decoding="async" /> : <div className={styles.newsFallback}><Icon name="sparkles" /></div>}
                    {publication.createdAt ? <time dateTime={publication.createdAt}>{formatDate(publication.createdAt)}</time> : null}
                  </div>
                  <div className={styles.newsBody}>
                    <span className={styles.newsSource}><Icon name="sparkles" />Publié avec Booster</span>
                    <h3>{publication.title}</h3>
                    {publication.content ? <p>{publication.content}</p> : null}
                    <span className={styles.newsRead}>Publication de l’entreprise <Icon name="arrow" /></span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {data.sections.faq && data.faq.length ? (
          <section className={`${styles.section} ${styles.faqSection}`}>
            <div className={styles.faqIntro}>
              <div className={styles.sectionKicker}><Icon name="search" />FAQ</div>
              <h2>Les réponses à vos questions</h2>
              <p>Retrouvez rapidement les informations essentielles avant de contacter {data.companyName}.</p>
              {contactHref ? <a href={contactHref} data-inrsearch-action="faq_contact" data-inrsearch-target={contactHref}>Une autre question ? Contactez-nous <Icon name="arrow" /></a> : null}
            </div>
            <div className={styles.faqList}>
              {data.faq.map((item, index) => (
                <details className={styles.faqItem} key={item.question} open={index === 0}>
                  <summary><span>{item.question}</span><i aria-hidden="true" /></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {data.sections.socials && data.socialLinks.length ? (
          <section className={styles.section}>
            <div className={styles.sectionIntroRow}>
              <div className={styles.sectionIntro}>
                <div className={styles.sectionKicker}><Icon name="globe" />Présence en ligne</div>
                <h2>Retrouvez {data.companyName}</h2>
              </div>
              <p>Explorez les différents espaces numériques de l’entreprise.</p>
            </div>
            <div className={styles.linkGrid}>
              {data.socialLinks.map((link) => (
                <a className={styles.socialCard} key={link.key} href={link.url} target="_blank" rel="noopener noreferrer" data-inrsearch-action={link.key} data-inrsearch-target={link.url}>
                  <span className={`${styles.socialIcon} ${styles[`social_${link.key}`] || ""}`}>{link.label.slice(0, 1).toUpperCase()}</span>
                  <span><small>Découvrir</small><strong>{link.label}</strong></span>
                  <i><Icon name="arrow" /></i>
                </a>
              ))}
            </div>
          </section>
        ) : null}


        {data.sections.cta ? <InrSearchLeadForm slug={data.slug} companyName={data.companyName} /> : null}

        {data.sections.cta ? (
          <section className={styles.finalCta}>
            <div className={styles.finalCtaPattern} aria-hidden="true" />
            <div className={styles.finalCtaIcon}><Icon name="sparkles" /></div>
            <div className={styles.finalCtaText}>
              <span>Parlons de votre projet</span>
              <h2>Prêt à contacter {data.companyName} ?</h2>
              <p>Échangez directement avec l’entreprise pour obtenir des informations ou présenter votre besoin.</p>
            </div>
            <div className={styles.finalCtaActions}>
              <a className={styles.finalPrimary} href="#demande"><Icon name="sparkles" />Présenter mon besoin</a>
              {phoneHref ? <a className={styles.finalSecondary} href={phoneHref} data-inrsearch-action="phone" data-inrsearch-target={phoneHref}><Icon name="phone" />{data.phone}</a> : null}
              {!phoneHref && emailHref ? <a className={styles.finalSecondary} href={emailHref} data-inrsearch-action="email" data-inrsearch-target={emailHref}><Icon name="email" />Envoyer un email</a> : null}
            </div>
          </section>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerCompany}>
            {data.logoUrl ? <img src={data.logoUrl} alt="" width={72} height={72} loading="lazy" decoding="async" /> : <span>{data.companyName.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{data.companyName}</strong>{updatedLabel ? <small>Informations mises à jour le <time dateTime={data.updatedAt || undefined}>{updatedLabel}</time></small> : null}</div>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/entreprises">Entreprises</Link>
            <Link href="/metiers">Métiers</Link>
            <Link href="/secteurs">Secteurs</Link>
          </div>
          <a className={styles.poweredBy} href="https://inrcy.com">
            <img src="/icons/inr-search-bubble-128.png" alt="" width={44} height={44} loading="lazy" decoding="async" />
            <span>Propulsé par <strong>iNr&apos;Search</strong></span>
          </a>
        </div>
      </footer>

      {data.sections.cta ? (
        <div className={styles.mobileContactBar}>
          <a href="#demande"><Icon name="sparkles" />Demander</a>
          {phoneHref ? <a href={phoneHref} data-inrsearch-action="phone" data-inrsearch-target={phoneHref}><Icon name="phone" />Appeler</a> : emailHref ? <a href={emailHref} data-inrsearch-action="email" data-inrsearch-target={emailHref}><Icon name="email" />Écrire</a> : null}
        </div>
      ) : null}
    </main>
  );
}
