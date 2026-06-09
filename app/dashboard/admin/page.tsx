import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyRole } from "@/lib/roles";
import styles from "./admin.module.css";

const tools = [
  {
    href: "/dashboard/admin/commandes",
    icon: "🛒",
    title: "Commandes Boutique",
    description: "Suivi des commandes et traitement rapide.",
    status: "Finalisé",
    ready: true,
  },
  {
    href: "/dashboard/admin/image-bank",
    icon: "🖼️",
    title: "Banque d’images iNrCy",
    description: "Gestion des visuels métier.",
    status: "Actif",
    ready: true,
  },
  {
    href: "/dashboard/admin/users",
    icon: "👥",
    title: "Comptes utilisateurs",
    description: "Gestion des comptes et abonnements.",
    status: "Actif",
    ready: true,
  },
  {
    href: "/dashboard/admin/tools",
    icon: "🧩",
    title: "Accès outils / bulles",
    description: "Activation des outils par compte.",
    status: "Actif",
    ready: true,
  },
  {
    href: "/dashboard/admin/diagnostics",
    icon: "🩺",
    title: "Diagnostics connexion",
    description: "Suivi des diagnostics connexion.",
    status: "Actif",
    ready: true,
  },
  {
    href: "/dashboard/admin/settings",
    icon: "⚙️",
    title: "Paramètres système",
    description: "Vue rapide des réglages système.",
    status: "Actif",
    ready: true,
  },
];

export default async function AdminHomePage() {
  const { isAdmin } = await getMyRole();
  if (!isAdmin) redirect("/dashboard");

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.kicker}>Administration iNrCy</div>
            <h1 className={styles.title}>Poste de pilotage admin</h1>
            <p className={styles.subtitle}>
              Accès rapide aux outils de gestion iNrCy.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link className={styles.closeButton} href="/dashboard">Fermer</Link>
          </div>
        </section>

        <section className={styles.statsGrid} aria-label="Résumé admin">
          <article className={styles.statCard}><div className={styles.statContent}><span className={styles.statLabel}>Outils</span><strong className={styles.statValue}>6</strong><small className={styles.statSub}>pages</small></div></article>
          <article className={styles.statCard}><div className={styles.statContent}><span className={styles.statLabel}>Accès</span><strong className={styles.statValue}>Admin</strong><small className={styles.statSub}>uniquement</small></div></article>
          <article className={styles.statCard}><div className={styles.statContent}><span className={styles.statLabel}>Actifs</span><strong className={styles.statValue}>6</strong><small className={styles.statSub}>branchés</small></div></article>
          <article className={styles.statCard}><div className={styles.statContent}><span className={styles.statLabel}>À venir</span><strong className={styles.statValue}>0</strong><small className={styles.statSub}>—</small></div></article>
        </section>

        <section className={styles.toolsGrid} aria-label="Outils admin">
          {tools.map((tool) => (
            <article key={tool.href} className={styles.card}>
              <div className={styles.cardContent}>
                <div className={styles.cardTop}>
                  <span className={styles.iconBubble} aria-hidden="true">{tool.icon}</span>
                  <span className={`${styles.statusChip} ${tool.status !== "Prévu" ? styles.statusChipReady : styles.statusChipSoon}`}>{tool.status}</span>
                </div>
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
                <div className={styles.cardFooter}>
                  <Link className={styles.cardLink} href={tool.href}>Ouvrir</Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
