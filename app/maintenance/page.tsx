import Image from "next/image";

import styles from "./maintenance.module.css";
import { getMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Mise à jour en temps réel";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Mise à jour en temps réel";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function MaintenancePage() {
  const maintenance = await getMaintenanceState();

  return (
    <main className={styles.page}>
      <div className={styles.bgGlow} />

      <section className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.header}>
            <Image
              src="/logo-inrcy.png"
              alt="iNrCy"
              width={52}
              height={52}
              priority
              className={styles.logo}
            />

            <div className={styles.brandBlock}>
              <div className={styles.brandName}>iNrCy</div>
              <div className={styles.brandSub}>Plateforme temporairement indisponible</div>
            </div>
          </div>

          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Intervention technique en cours
          </div>

          <div className={styles.content}>
            <div className={styles.main}>
              <h1 className={styles.title}>
                {maintenance.title || "Maintenance en cours"}
              </h1>

              <p className={styles.text}>
                {maintenance.message ||
                  "Nous réalisons actuellement une intervention technique afin de sécuriser et stabiliser la plateforme. L’accès utilisateur est temporairement suspendu. Merci de revenir dans quelques instants."}
              </p>

              <div className={styles.actions}>
                <a href="/maintenance" className={styles.primaryBtn}>
                  Réessayer
                </a>
                <a href="mailto:contact@inrcy.com" className={styles.secondaryBtn}>
                  Contacter iNrCy
                </a>
              </div>
            </div>

            <aside className={styles.infoCard}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Statut</span>
                <span className={styles.infoValue}>Maintenance contrôlée</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Accès</span>
                <span className={styles.infoValue}>Utilisateurs en pause</span>
              </div>

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Dernière mise à jour</span>
                <span className={styles.infoValue}>
                  {formatUpdatedAt(maintenance.updatedAt)}
                </span>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}