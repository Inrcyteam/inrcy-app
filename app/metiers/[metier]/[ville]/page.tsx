import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  buildInrSearchProfessionUrl,
  buildInrSearchPublicUrl,
  getInrSearchPublicOrigin,
  listInrSearchCompaniesByProfession,
  normalizeInrSearchDirectorySlug,
} from "@/lib/inrSearchPublic";
import { serializeInrSearchJsonLd } from "@/lib/inrSearchSeo";
import styles from "../../../directory.module.css";

type PageProps = { params: Promise<{ metier: string; ville: string }> };
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { metier, ville } = await params;
  const normalizedMetier = normalizeInrSearchDirectorySlug(metier);
  const normalizedVille = normalizeInrSearchDirectorySlug(ville);
  const companies = await listInrSearchCompaniesByProfession(normalizedMetier, normalizedVille);
  if (!companies.length) return { title: "Page introuvable | iNr'Search", robots: { index: false, follow: false } };
  const label = companies[0].profession;
  const city = companies[0].city;
  const canonical = buildInrSearchProfessionUrl(normalizedMetier, normalizedVille);
  const title = `${label} à ${city} | iNr'Search`;
  const description = `Découvrez les professionnels ${label.toLowerCase()} à ${city} présents sur iNr'Search.`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "fr_FR", url: canonical, siteName: "iNrCy", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function MetierVillePage({ params }: PageProps) {
  const { metier, ville } = await params;
  const normalizedMetier = normalizeInrSearchDirectorySlug(metier);
  const normalizedVille = normalizeInrSearchDirectorySlug(ville);
  if (!normalizedMetier || !normalizedVille) notFound();
  if (metier !== normalizedMetier || ville !== normalizedVille) {
    permanentRedirect(`/metiers/${normalizedMetier}/${normalizedVille}`);
  }

  const companies = await listInrSearchCompaniesByProfession(normalizedMetier, normalizedVille);
  if (!companies.length) notFound();
  const label = companies[0].profession;
  const city = companies[0].city;
  const canonical = buildInrSearchProfessionUrl(normalizedMetier, normalizedVille);
  const origin = getInrSearchPublicOrigin();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": canonical,
        name: `${label} à ${city}`,
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
          { "@type": "ListItem", position: 2, name: "Métiers", item: `${origin}/metiers` },
          { "@type": "ListItem", position: 3, name: label, item: buildInrSearchProfessionUrl(normalizedMetier) },
          { "@type": "ListItem", position: 4, name: city, item: canonical },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeInrSearchJsonLd(jsonLd) }} />
      <nav className={styles.topbar}>
        <a href="https://inrcy.com"><img src="/logo-inrcy.png" alt="iNrCy" /></a>
        <div className={styles.topbarNav}><Link href="/entreprises">Entreprises</Link><Link href="/metiers">Métiers</Link><Link href="/secteurs">Secteurs</Link></div>
      </nav>
      <header className={styles.header}>
        <div className={styles.breadcrumbs}><Link href="/entreprises">Entreprises</Link><span>›</span><Link href="/metiers">Métiers</Link><span>›</span><Link href={`/metiers/${normalizedMetier}`}>{label}</Link><span>›</span><span>{city}</span></div>
        <span className={styles.kicker}>Professionnels locaux</span>
        <h1>{label} à {city}</h1>
        <p>Découvrez les entreprises spécialisées en {label.toLowerCase()} à {city}.</p>
      </header>
      <section className={styles.grid}>
        {companies.map((company) => (
          <Link className={styles.card} href={`/entreprises/${company.slug}`} key={company.slug}>
            <div className={styles.meta}>{[company.sectorLabel, company.city].filter(Boolean).join(" · ")}</div>
            <h2>{company.pageTitle}</h2>
            <p>{company.pageDescription}</p>
            <span>Découvrir l’entreprise →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
