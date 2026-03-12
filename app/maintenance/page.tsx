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
      <div className={styles.noise} />
      <div className={styles.grid} />

      <div className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.inner}>
            <div className={styles.hero}>
              <div className={styles.topBlock}>
                <div className={styles.logoRow}>
                  <div className={styles.logoWrap}>
                    <Image
                      src="/logo-inrcy.png"
                      alt="iNrCy"
                      width={38}
                      height={38}
                      priority
                    />
                  </div>

                  <div className={styles.brand}>
                    <span className={styles.brandName}>iNrCy</span>
                    <span className={styles.brandSub}>Hub connecté · générateurs iNrCy</span>
                  </div>
                </div>

                <div className={styles.badge}>
                  <span className={styles.badgeDot} />
                  Incident technique maîtrisé · accès temporairement suspendu
                </div>

                <div>
                  <h1 className={styles.title}>{maintenance.title || "Maintenance en cours"}</h1>
                  <p className={styles.text}>
                    {maintenance.message ||
                      "Nous effectuons une intervention technique importante sur la plateforme. Les comptes utilisateurs sont temporairement redirigés vers cette page afin de sécuriser les données, stabiliser les services et rétablir l’expérience iNrCy dans les meilleures conditions."}
                  </p>
                </div>
              </div>

              <div className={styles.highlights}>
                <div className={styles.tile}>
                  <div className={styles.tileLabel}>Statut</div>
                  <div className={styles.tileValue}>Accès utilisateur mis en pause</div>
                </div>
                <div className={styles.tile}>
                  <div className={styles.tileLabel}>Suivi</div>
                  <div className={styles.tileValue}>Surveillance active de la plateforme</div>
                </div>
                <div className={styles.tile}>
                  <div className={styles.tileLabel}>Dernière mise à jour</div>
                  <div className={styles.tileValue}>{formatUpdatedAt(maintenance.updatedAt)}</div>
                </div>
              </div>
            </div>

            <aside className={styles.side}>
              <div className={styles.sideTop}>
                <h2 className={styles.sideTitle}>Ce que fait l’équipe iNrCy</h2>
                <p className={styles.sideText}>
                  Nous vérifions les services critiques, sécurisons les traitements en cours et préparons
                  la remise en ligne progressive pour éviter toute instabilité au retour.
                </p>

                <div className={styles.statusBox}>
                  <div className={styles.statusLabel}>État de l’intervention</div>
                  <div className={styles.statusValue}>Plateforme en maintenance contrôlée</div>
                </div>

                <div className={styles.ctaRow}>
                  <a href="/maintenance" className={styles.primaryBtn}>
                    Réessayer
                  </a>
                  <a href="mailto:contact@inrcy.com" className={styles.secondaryBtn}>
                    Contacter iNrCy
                  </a>
                </div>
              </div>

              <div className={styles.sideBottom}>
                <div className={styles.timeline}>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot}>1</div>
                    <div>
                      <div className={styles.timelineTitle}>Diagnostic et sécurisation</div>
                      <div className={styles.timelineText}>
                        Isolation du problème, contrôle des flux et gel temporaire des accès utilisateur.
                      </div>
                    </div>
                  </div>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot}>2</div>
                    <div>
                      <div className={styles.timelineTitle}>Stabilisation des services</div>
                      <div className={styles.timelineText}>
                        Vérification des modules clés, tests internes et validation de la reprise.
                      </div>
                    </div>
                  </div>
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot}>3</div>
                    <div>
                      <div className={styles.timelineTitle}>Retour à la normale</div>
                      <div className={styles.timelineText}>
                        Réouverture progressive des comptes utilisateurs dès que tout est conforme.
                      </div>
                    </div>
                  </div>
                </div>

                <p className={styles.footerNote}>
                  Merci pour votre patience. Les comptes administrateurs internes restent accessibles pour piloter la reprise et superviser la plateforme.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
