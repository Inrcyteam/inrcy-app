import Link from "next/link";
import EReputationReviewsClient, {
  type EReputationReviewItem,
  type EReputationReviewsPlatform,
} from "./EReputationReviewsClient";
import styles from "./eReputation.module.css";

const previewGoogleReviews: EReputationReviewItem[] = [
  {
    id: "google:preview-1",
    platform: "google",
    reviewName: null,
    name: "Sophie M.",
    rating: 5,
    date: "Aujourd’hui",
    status: "À répondre",
    comment: "Très bonne expérience, équipe réactive et travail propre. Je recommande sans hésiter.",
  },
  {
    id: "google:preview-2",
    platform: "google",
    reviewName: null,
    name: "Marc D.",
    rating: 4,
    date: "Hier",
    status: "Répondu",
    comment: "Prestation sérieuse, petit retard au démarrage mais le résultat est conforme à nos attentes.",
    reply: "Merci pour votre confiance et votre retour constructif. Nous restons disponibles avec plaisir.",
  },
  {
    id: "google:preview-3",
    platform: "google",
    reviewName: null,
    name: "Client Google",
    rating: 2,
    date: "Il y a 3 jours",
    status: "À traiter",
    comment: "Je n’ai pas réussi à joindre l’entreprise rapidement. Dommage car le premier contact était bon.",
  },
];

export default function EReputationPage() {
  const askReviewsHref = "/dashboard/propulser?action=recolter";
  const platforms: EReputationReviewsPlatform[] = [
    {
      id: "google",
      label: "Google",
      shortLabel: "Google",
      iconSrc: "/icons/google.jpg",
      modalKicker: "Avis Google",
      replyLabel: "Réponse Google",
      reviews: previewGoogleReviews,
      reviewsReady: false,
      reviewsError: null,
      initialNextPageToken: null,
      totalReviewCount: 0,
      averageRatingLabel: "—",
      locationLabel: "Fiche Google Business",
      statusLabel: "Synchronisation Google…",
      connected: false,
      canReply: false,
      reportUrl: null,
      profileUrl: null,
      inviteUrl: askReviewsHref,
    },
  ];

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.brandIconWrap} aria-hidden="true">
              <div className={styles.reputationBrandIcon}>
                <span className={`${styles.reputationBrandStar} ${styles.reputationBrandStarCenter}`}>★</span>
                <span className={`${styles.reputationBrandStar} ${styles.reputationBrandStarTopLeft}`}>★</span>
                <span className={`${styles.reputationBrandStar} ${styles.reputationBrandStarTopRight}`}>★</span>
                <span className={`${styles.reputationBrandStar} ${styles.reputationBrandStarBottomLeft}`}>★</span>
              </div>
            </div>
            <div className={styles.brandText}>
              <div className={styles.brandRow}>
                <h1>E-réputation</h1>
                <span className={styles.tagline}>Tous vos avis Google, depuis une seule et même machine.</span>
              </div>
              <p className={styles.subline}>
                <span className={styles.sublineDesktop}>
                  Pilotez vos avis, préparez une réponse avec l’IA iNrCy, puis publiez-la après validation.
                </span>
                <span className={styles.sublineMobile}>Répondez à vos avis avec iNrCy.</span>
              </p>
            </div>
          </div>

          <div className={styles.actions}>
            <Link className={styles.btnPrimary} href="/dashboard?panel=gmb">Gérer Google</Link>
            <Link className={styles.btnGhost} href={askReviewsHref}>Réclamez des avis</Link>
            <Link className={`${styles.btnGhost} ${styles.headerCloseButton}`} href="/dashboard" aria-label="Fermer">
              <span className={styles.closeDesktopLabel}>Fermer</span>
              <span className={styles.closeMobileLabel} aria-hidden="true">×</span>
            </Link>
          </div>
        </header>

        <EReputationReviewsClient
          reviews={previewGoogleReviews}
          reviewsReady={false}
          reviewsError={null}
          initialNextPageToken={null}
          totalReviewCount={0}
          locationLabel="Fiche Google Business"
          statusLabel="Synchronisation Google…"
          gmbReady={false}
          averageRatingLabel="—"
          reportGoogleUrl={null}
          platforms={platforms}
        />
      </div>
    </main>
  );
}
