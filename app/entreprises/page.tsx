import type { Metadata } from "next";
import Link from "next/link";
import {
  buildInrSearchPublicUrl,
  getInrSearchPublicOrigin,
  listPublishedInrSearchCompanies,
} from "@/lib/inrSearchPublic";
import { serializeInrSearchJsonLd } from "@/lib/inrSearchSeo";
import styles from "./entreprises.module.css";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const origin = getInrSearchPublicOrigin();
  const companies = await listPublishedInrSearchCompanies();
  const canonical = `${origin}/entreprises`;
  const title = "Entreprises | iNr'Search";
  const description = "Découvrez les entreprises et professionnels présents sur iNr'Search.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: companies.length > 0, follow: true },
    openGraph: { type: "website", locale: "fr_FR", url: canonical, siteName: "iNrCy", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function EntreprisesPage() {
  const companies = await listPublishedInrSearchCompanies();
  const origin = getInrSearchPublicOrigin();
  const canonical = `${origin}/entreprises`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": canonical,
        name: "Entreprises sur iNr'Search",
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
          { "@type": "ListItem", position: 1, name: "Entreprises", item: canonical },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeInrSearchJsonLd(jsonLd) }} />
      <header className={styles.header}>
        <div className={styles.indexTopbar}>
          <a href="https://inrcy.com"><img src="/logo-inrcy.png" alt="iNrCy" /></a>
          <nav><Link href="/metiers">Métiers</Link><Link href="/secteurs">Secteurs</Link></nav>
        </div>
        <div>
          <span>iNr&apos;Search</span>
          <h1>Les entreprises à découvrir</h1>
          <p>Des informations professionnelles structurées, complètes et régulièrement mises à jour.</p>
        </div>
      </header>

      <section className={styles.grid}>
        {companies.map((company) => (
          <Link className={styles.card} href={`/entreprises/${company.slug}`} key={company.slug}>
            <div className={styles.meta}>{[company.profession, company.city].filter(Boolean).join(" · ") || company.sectorLabel}</div>
            <h2>{company.pageTitle}</h2>
            <p>{company.pageDescription}</p>
            <span>Découvrir l’entreprise →</span>
          </Link>
        ))}
        {!companies.length ? <div className={styles.empty}>Les premières pages iNr&apos;Search seront bientôt disponibles.</div> : null}
      </section>
    </main>
  );
}
