import type { Metadata } from "next";
import Link from "next/link";
import { getInrSearchPublicOrigin, listInrSearchProfessions } from "@/lib/inrSearchPublic";
import { serializeInrSearchJsonLd } from "@/lib/inrSearchSeo";
import styles from "../directory.module.css";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const origin = getInrSearchPublicOrigin();
  const professions = await listInrSearchProfessions();
  const canonical = `${origin}/metiers`;
  const title = "Métiers et professionnels | iNr'Search";
  const description = "Découvrez les entreprises référencées sur iNr'Search, classées par métier.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: professions.length > 0, follow: true },
    openGraph: { type: "website", locale: "fr_FR", url: canonical, siteName: "iNrCy", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function MetiersPage() {
  const professions = await listInrSearchProfessions();
  const origin = getInrSearchPublicOrigin();
  const canonical = `${origin}/metiers`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": canonical,
        name: "Métiers et professionnels sur iNr'Search",
        url: canonical,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: professions.map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.label,
            url: `${origin}/metiers/${entry.slug}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Entreprises", item: `${origin}/entreprises` },
          { "@type": "ListItem", position: 2, name: "Métiers", item: canonical },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeInrSearchJsonLd(jsonLd) }} />
      <nav className={styles.topbar}>
        <a href="https://inrcy.com"><img src="/logo-inrcy.png" alt="iNrCy" /></a>
        <div className={styles.topbarNav}><Link href="/entreprises">Entreprises</Link><Link href="/secteurs">Secteurs</Link></div>
      </nav>
      <header className={styles.header}>
        <div className={styles.breadcrumbs}><Link href="/entreprises">Entreprises</Link><span>›</span><span>Métiers</span></div>
        <span className={styles.kicker}>Annuaire iNr&apos;Search</span>
        <h1>Trouver un professionnel par métier</h1>
        <p>Accédez aux pages publiques des entreprises selon leur métier et leur zone géographique.</p>
      </header>
      <section className={styles.directoryGrid}>
        {professions.map((entry) => (
          <Link className={styles.directoryCard} href={`/metiers/${entry.slug}`} key={entry.slug}>
            <strong>{entry.label}</strong><span>{entry.count} entreprise{entry.count > 1 ? "s" : ""} →</span>
          </Link>
        ))}
        {!professions.length ? <div className={styles.empty}>Les premiers métiers seront bientôt disponibles.</div> : null}
      </section>
    </main>
  );
}
