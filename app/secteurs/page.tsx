import type { Metadata } from "next";
import Link from "next/link";
import { getInrSearchPublicOrigin, listInrSearchSectors } from "@/lib/inrSearchPublic";
import { serializeInrSearchJsonLd } from "@/lib/inrSearchSeo";
import styles from "../directory.module.css";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const origin = getInrSearchPublicOrigin();
  const sectors = await listInrSearchSectors();
  const canonical = `${origin}/secteurs`;
  const title = "Secteurs d’activité | iNr'Search";
  const description = "Découvrez les entreprises référencées sur iNr'Search, classées par secteur d’activité.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: sectors.length > 0, follow: true },
    openGraph: { type: "website", locale: "fr_FR", url: canonical, siteName: "iNrCy", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function SecteursPage() {
  const sectors = await listInrSearchSectors();
  const origin = getInrSearchPublicOrigin();
  const canonical = `${origin}/secteurs`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": canonical,
        name: "Secteurs d’activité sur iNr'Search",
        url: canonical,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: sectors.map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.label,
            url: `${origin}/secteurs/${entry.slug}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Entreprises", item: `${origin}/entreprises` },
          { "@type": "ListItem", position: 2, name: "Secteurs", item: canonical },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeInrSearchJsonLd(jsonLd) }} />
      <nav className={styles.topbar}>
        <a href="https://inrcy.com"><img src="/logo-inrcy.png" alt="iNrCy" /></a>
        <div className={styles.topbarNav}><Link href="/entreprises">Entreprises</Link><Link href="/metiers">Métiers</Link></div>
      </nav>
      <header className={styles.header}>
        <div className={styles.breadcrumbs}><Link href="/entreprises">Entreprises</Link><span>›</span><span>Secteurs</span></div>
        <span className={styles.kicker}>Annuaire iNr&apos;Search</span>
        <h1>Explorer les entreprises par secteur</h1>
        <p>Parcourez les entreprises selon leur grand secteur d’activité, puis découvrez leurs métiers et leurs services.</p>
      </header>
      <section className={styles.directoryGrid}>
        {sectors.map((entry) => (
          <Link className={styles.directoryCard} href={`/secteurs/${entry.slug}`} key={entry.slug}>
            <strong>{entry.label}</strong><span>{entry.count} entreprise{entry.count > 1 ? "s" : ""} →</span>
          </Link>
        ))}
        {!sectors.length ? <div className={styles.empty}>Les premiers secteurs seront bientôt disponibles.</div> : null}
      </section>
    </main>
  );
}
