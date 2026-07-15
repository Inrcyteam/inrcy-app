import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  buildInrSearchPublicUrl,
  buildInrSearchSectorUrl,
  getInrSearchPublicOrigin,
  listInrSearchCompaniesBySector,
  normalizeInrSearchDirectorySlug,
} from "@/lib/inrSearchPublic";
import { serializeInrSearchJsonLd } from "@/lib/inrSearchSeo";
import styles from "../../directory.module.css";

type PageProps = { params: Promise<{ secteur: string }> };
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { secteur } = await params;
  const normalizedSecteur = normalizeInrSearchDirectorySlug(secteur);
  const companies = await listInrSearchCompaniesBySector(normalizedSecteur);
  if (!companies.length) return { title: "Secteur introuvable | iNr'Search", robots: { index: false, follow: false } };
  const label = companies[0].sectorLabel;
  const canonical = buildInrSearchSectorUrl(normalizedSecteur);
  const title = `${label} : entreprises et professionnels | iNr'Search`;
  const description = `Découvrez les entreprises du secteur ${label} présentes sur iNr'Search.`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "fr_FR", url: canonical, siteName: "iNrCy", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function SecteurPage({ params }: PageProps) {
  const { secteur } = await params;
  const normalizedSecteur = normalizeInrSearchDirectorySlug(secteur);
  if (!normalizedSecteur) notFound();
  if (secteur !== normalizedSecteur) permanentRedirect(`/secteurs/${normalizedSecteur}`);

  const companies = await listInrSearchCompaniesBySector(normalizedSecteur);
  if (!companies.length) notFound();
  const label = companies[0].sectorLabel;
  const canonical = buildInrSearchSectorUrl(normalizedSecteur);
  const origin = getInrSearchPublicOrigin();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": canonical,
        name: `Entreprises du secteur ${label}`,
        url: canonical,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: companies.map((company, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: company.pageTitle,
            url: buildInrSearchPublicUrl(company.slug),
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Entreprises", item: `${origin}/entreprises` },
          { "@type": "ListItem", position: 2, name: "Secteurs", item: `${origin}/secteurs` },
          { "@type": "ListItem", position: 3, name: label, item: canonical },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeInrSearchJsonLd(jsonLd) }} />
      <nav className={styles.topbar}>
        <a href="https://inrcy.com"><Image src="/logo-inrcy.png" alt="iNrCy" width={116} height={46} priority /></a>
        <div className={styles.topbarNav}><Link href="/entreprises">Entreprises</Link><Link href="/metiers">Métiers</Link><Link href="/secteurs">Secteurs</Link></div>
      </nav>
      <header className={styles.header}>
        <div className={styles.breadcrumbs}><Link href="/entreprises">Entreprises</Link><span>›</span><Link href="/secteurs">Secteurs</Link><span>›</span><span>{label}</span></div>
        <span className={styles.kicker}>Secteur d’activité</span>
        <h1>{label}</h1>
        <p>Découvrez les entreprises et les différents métiers du secteur {label}.</p>
      </header>
      <section className={styles.grid}>
        {companies.map((company) => (
          <Link className={styles.card} href={`/entreprises/${company.slug}`} key={company.slug}>
            <div className={styles.meta}>{[company.profession, company.city].filter(Boolean).join(" · ")}</div>
            <h2>{company.pageTitle}</h2>
            <p>{company.pageDescription}</p>
            <span>Découvrir l’entreprise →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
