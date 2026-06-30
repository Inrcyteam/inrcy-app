import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getChannelConnectionStates } from "@/lib/channelConnectionState";
import { getGmbToken } from "@/lib/googleBusiness";
import { getGmbReviewTargetFromRow, gmbListReviews, type NormalizedGmbReview } from "@/lib/googleBusinessReviews";
import { buildBubbleAccessMap, isBubbleEnabled } from "@/lib/bubbleAccess";
import { listTrustpilotReviewsForUser, type NormalizedTrustpilotReview } from "@/lib/trustpilotReviews";
import EReputationReviewsClient, { type EReputationReviewItem, type EReputationReviewsPlatform } from "./EReputationReviewsClient";
import styles from "./eReputation.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GoogleBusinessStatus = {
  accountConnected?: boolean;
  connected?: boolean;
  configured?: boolean;
  requiresUpdate?: boolean;
  resource_label?: string | null;
  url?: string | null;
  email?: string | null;
} | null;

type TrustpilotStatus = {
  accountConnected?: boolean;
  connected?: boolean;
  requiresUpdate?: boolean;
  business_unit_id?: string | null;
  business_name?: string | null;
  profile_url?: string | null;
  review_invite_url?: string | null;
} | null;

type ReviewListItem = EReputationReviewItem;

type ReviewsLoadResult = {
  ready: boolean;
  error: string | null;
  locationTitle: string | null;
  averageRating: number | null;
  totalReviewCount: number;
  nextPageToken: string | null;
  reviews: NormalizedGmbReview[];
};

type TrustpilotReviewsLoadResult = {
  ready: boolean;
  privateAccess: boolean;
  error: string | null;
  businessName: string | null;
  profileUrl: string | null;
  reviewInviteUrl: string | null;
  trustScore: number | null;
  totalReviewCount: number;
  nextPageToken: string | null;
  reviews: NormalizedTrustpilotReview[];
};

const previewGoogleReviews: ReviewListItem[] = [
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

const previewTrustpilotReviews: ReviewListItem[] = [
  {
    id: "trustpilot:preview-1",
    platform: "trustpilot",
    reviewName: null,
    name: "Client Trustpilot",
    rating: 5,
    date: "Aujourd’hui",
    status: "À répondre",
    comment: "Service très sérieux, communication claire et accompagnement efficace. Je recommande.",
    verified: true,
  },
  {
    id: "trustpilot:preview-2",
    platform: "trustpilot",
    reviewName: null,
    name: "Acheteur vérifié",
    rating: 4,
    date: "Hier",
    status: "Répondu",
    comment: "Bonne expérience globale, réponse rapide et équipe professionnelle.",
    reply: "Merci pour votre retour et votre confiance. Nous sommes ravis que l’expérience ait été positive.",
    verified: true,
  },
];

async function getCurrentUserId() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

async function loadBubbleEnabled(bubbleKey: "trustpilot") {
  noStore();
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("app_bubble_access")
      .select("bubble_key,enabled")
      .eq("user_id", user.id)
      .eq("bubble_key", bubbleKey);
    const map = buildBubbleAccessMap(data || []);
    return isBubbleEnabled(map, bubbleKey);
  } catch {
    return false;
  }
}

async function loadGoogleBusinessStatus(): Promise<GoogleBusinessStatus> {
  noStore();
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const states = await getChannelConnectionStates(supabase, user.id);
    return states.gmb ?? null;
  } catch {
    return null;
  }
}

async function loadTrustpilotStatus(): Promise<TrustpilotStatus> {
  noStore();
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const states = await getChannelConnectionStates(supabase, user.id);
    return states.trustpilot ?? null;
  } catch {
    return null;
  }
}

async function loadGoogleReviews(): Promise<ReviewsLoadResult> {
  noStore();
  try {
    const token = await getGmbToken();
    if (!token?.accessToken) {
      return { ready: false, error: null, locationTitle: null, averageRating: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
    }

    const target = getGmbReviewTargetFromRow(token.row);
    if (!target.accountName || !target.locationName) {
      return { ready: false, error: null, locationTitle: target.locationTitle, averageRating: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
    }

    const payload = await gmbListReviews(token.accessToken, target.accountName, target.locationName, { pageSize: 50, orderBy: "updateTime desc" });
    return {
      ready: true,
      error: null,
      locationTitle: target.locationTitle,
      averageRating: payload.averageRating,
      totalReviewCount: payload.totalReviewCount,
      nextPageToken: payload.nextPageToken,
      reviews: payload.reviews,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger les avis Google pour le moment.";
    return { ready: false, error: message, locationTitle: null, averageRating: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
  }
}

async function loadTrustpilotReviews(enabled: boolean): Promise<TrustpilotReviewsLoadResult> {
  noStore();
  if (!enabled) {
    return { ready: false, privateAccess: false, error: null, businessName: null, profileUrl: null, reviewInviteUrl: null, trustScore: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { ready: false, privateAccess: false, error: null, businessName: null, profileUrl: null, reviewInviteUrl: null, trustScore: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
    }

    const payload = await listTrustpilotReviewsForUser(userId, { pageSize: 50 });
    return {
      ready: payload.configured,
      privateAccess: payload.privateAccess,
      error: null,
      businessName: payload.businessName,
      profileUrl: payload.profileUrl,
      reviewInviteUrl: payload.reviewInviteUrl,
      trustScore: payload.trustScore,
      totalReviewCount: payload.totalReviewCount,
      nextPageToken: payload.nextPageToken,
      reviews: payload.reviews,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger les avis Trustpilot pour le moment.";
    return { ready: false, privateAccess: false, error: message, businessName: null, profileUrl: null, reviewInviteUrl: null, trustScore: null, totalReviewCount: 0, nextPageToken: null, reviews: [] };
  }
}

function formatReviewDate(value: string | null) {
  if (!value) return "Date non précisée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non précisée";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAverageRating(value: number | null) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function buildEReputationTagline(trustpilotEnabled: boolean) {
  return trustpilotEnabled
    ? "Tous vos avis Google et Trustpilot, depuis une seule et même machine."
    : "Tous vos avis Google, depuis une seule et même machine.";
}

function toGoogleReviewListItem(review: NormalizedGmbReview): ReviewListItem {
  const hasReply = review.replyStatus === "answered";
  const rating = review.starRating || 0;
  return {
    id: `google:${review.name || review.reviewId}`,
    platform: "google",
    reviewName: review.name || null,
    name: review.reviewerName || "Client Google",
    rating,
    date: formatReviewDate(review.updateTime || review.createTime),
    status: hasReply ? "Répondu" : rating > 0 && rating <= 3 ? "À traiter" : "À répondre",
    comment: review.originalComment || review.comment || "Avis sans commentaire écrit.",
    originalComment: review.originalComment || review.comment || null,
    translatedComment: review.translatedComment || null,
    reply: review.reply?.comment || null,
    live: true,
    replyable: true,
  };
}

function toTrustpilotReviewListItem(review: NormalizedTrustpilotReview): ReviewListItem {
  const hasReply = review.replyStatus === "answered";
  return {
    id: `trustpilot:${review.reviewId}`,
    platform: "trustpilot",
    reviewName: review.reviewId || null,
    name: review.reviewerName || "Client Trustpilot",
    rating: review.rating || 0,
    date: formatReviewDate(review.updateTime || review.createTime),
    status: hasReply ? "Répondu" : review.rating > 0 && review.rating <= 3 ? "À traiter" : "À répondre",
    comment: review.comment || "Avis sans commentaire écrit.",
    originalComment: review.comment || null,
    translatedComment: null,
    reply: review.reply?.comment || null,
    live: true,
    replyable: review.replyable,
    verified: review.isVerified,
  };
}

export default async function EReputationPage() {
  const trustpilotEnabled = await loadBubbleEnabled("trustpilot");
  const [gmb, trustpilot, googleReviewsData, trustpilotReviewsData] = await Promise.all([
    loadGoogleBusinessStatus(),
    trustpilotEnabled ? loadTrustpilotStatus() : Promise.resolve(null),
    loadGoogleReviews(),
    loadTrustpilotReviews(trustpilotEnabled),
  ]);

  const gmbReady = Boolean(gmb?.connected && !gmb?.requiresUpdate);
  const gmbNeedsUpdate = Boolean(gmb?.requiresUpdate);
  const gmbAccountOnly = Boolean(gmb?.accountConnected && !gmb?.connected && !gmbNeedsUpdate);
  const googleLiveReviews = googleReviewsData.reviews.map(toGoogleReviewListItem);
  const googleDisplayedReviews = googleReviewsData.ready ? googleLiveReviews : previewGoogleReviews;
  const locationLabel = String(googleReviewsData.locationTitle || gmb?.resource_label || "Fiche Google Business").trim();
  const statusLabel = gmbNeedsUpdate
    ? "Connexion à actualiser"
    : gmbReady
      ? googleReviewsData.ready
        ? "Avis Google chargés"
        : "Fiche connectée"
      : gmbAccountOnly
        ? "Établissement à choisir"
        : "Google Business à connecter";

  const trustpilotReady = trustpilotReviewsData.ready;
  const trustpilotLiveReviews = trustpilotReviewsData.reviews.map(toTrustpilotReviewListItem);
  const trustpilotDisplayedReviews = trustpilotReady ? trustpilotLiveReviews : previewTrustpilotReviews;
  const trustpilotLabel = String(trustpilotReviewsData.businessName || trustpilot?.business_name || "Trustpilot").trim();
  const trustpilotConnected = Boolean(trustpilot?.connected && !trustpilot?.requiresUpdate);
  const trustpilotStatusLabel = trustpilot?.requiresUpdate
    ? "Connexion à actualiser"
    : trustpilotReady
      ? trustpilotReviewsData.privateAccess
        ? "Avis Trustpilot chargés"
        : "Lecture seule"
      : trustpilotConnected
        ? "Fiche connectée"
        : "A connecter";

  const connectHref = `/api/integrations/google-business/start?returnTo=${encodeURIComponent("/dashboard/e-reputation")}`;
  const askReviewsHref = "/dashboard/propulser?action=recolter";
  const primaryAction = gmbReady
    ? { href: gmb?.url || "/dashboard?panel=gmb", label: "Voir la fiche", external: Boolean(gmb?.url) }
    : gmbNeedsUpdate
      ? { href: connectHref, label: "Actualiser Google", external: false }
      : gmbAccountOnly
        ? { href: "/dashboard?panel=gmb", label: "Choisir la fiche", external: false }
        : { href: connectHref, label: "Connecter Google", external: false };

  const platforms: EReputationReviewsPlatform[] = [
    {
      id: "google",
      label: "Google",
      shortLabel: "Google",
      iconSrc: "/icons/google.jpg",
      modalKicker: "Avis Google",
      replyLabel: "Réponse Google",
      reviews: googleDisplayedReviews,
      reviewsReady: googleReviewsData.ready,
      reviewsError: googleReviewsData.error,
      initialNextPageToken: googleReviewsData.nextPageToken,
      totalReviewCount: googleReviewsData.totalReviewCount,
      averageRatingLabel: googleReviewsData.ready ? formatAverageRating(googleReviewsData.averageRating) : "—",
      locationLabel,
      statusLabel,
      connected: gmbReady,
      canReply: gmbReady,
      reportUrl: gmb?.url || null,
      profileUrl: gmb?.url || null,
      inviteUrl: askReviewsHref,
    },
  ];

  if (trustpilotEnabled) {
    platforms.push({
      id: "trustpilot",
      label: "Trustpilot",
      shortLabel: "Trustpilot",
      iconSrc: "/icons/trustpilot.png",
      modalKicker: "Avis Trustpilot",
      replyLabel: "Réponse Trustpilot",
      reviews: trustpilotDisplayedReviews,
      reviewsReady: trustpilotReady,
      reviewsError: trustpilotReviewsData.error,
      initialNextPageToken: trustpilotReviewsData.nextPageToken,
      totalReviewCount: trustpilotReviewsData.totalReviewCount,
      averageRatingLabel: trustpilotReady ? formatAverageRating(trustpilotReviewsData.trustScore) : "—",
      locationLabel: trustpilotLabel,
      statusLabel: trustpilotStatusLabel,
      connected: trustpilotConnected || trustpilotReady,
      canReply: trustpilotReviewsData.privateAccess,
      reportUrl: null,
      profileUrl: trustpilotReviewsData.profileUrl || trustpilot?.profile_url || null,
      inviteUrl: trustpilotReviewsData.reviewInviteUrl || trustpilot?.review_invite_url || null,
    });
  }

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
                <span className={styles.tagline}>{buildEReputationTagline(trustpilotEnabled)}</span>
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
            {primaryAction.external ? (
              <a className={styles.btnPrimary} href={primaryAction.href} target="_blank" rel="noreferrer">{primaryAction.label}</a>
            ) : (
              <Link className={styles.btnPrimary} href={primaryAction.href}>{primaryAction.label}</Link>
            )}
            <Link className={styles.btnGhost} href={askReviewsHref}>Réclamez des avis</Link>
            <Link className={`${styles.btnGhost} ${styles.headerCloseButton}`} href="/dashboard" aria-label="Fermer">
              <span className={styles.closeDesktopLabel}>Fermer</span>
              <span className={styles.closeMobileLabel} aria-hidden="true">×</span>
            </Link>
          </div>
        </header>

        <EReputationReviewsClient
          reviews={googleDisplayedReviews}
          reviewsReady={googleReviewsData.ready}
          reviewsError={googleReviewsData.error}
          initialNextPageToken={googleReviewsData.nextPageToken}
          totalReviewCount={googleReviewsData.totalReviewCount}
          locationLabel={locationLabel}
          statusLabel={statusLabel}
          gmbReady={gmbReady}
          averageRatingLabel={googleReviewsData.ready ? formatAverageRating(googleReviewsData.averageRating) : "—"}
          reportGoogleUrl={gmb?.url || null}
          platforms={platforms}
        />
      </div>
    </main>
  );
}
