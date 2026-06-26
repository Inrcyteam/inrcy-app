"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./eReputation.module.css";

export type EReputationReviewItem = {
  id: string;
  reviewName: string | null;
  name: string;
  rating: number;
  date: string;
  status: "À répondre" | "Répondu" | "À traiter";
  comment: string;
  originalComment?: string | null;
  translatedComment?: string | null;
  reply?: string | null;
  live?: boolean;
};

type Props = {
  reviews: EReputationReviewItem[];
  reviewsReady: boolean;
  reviewsError: string | null;
  initialNextPageToken?: string | null;
  totalReviewCount?: number;
  averageRatingLabel?: string;
  locationLabel?: string;
  statusLabel?: string;
  gmbReady?: boolean;
};

type ReplyResponse = {
  ok?: boolean;
  error?: string;
  user_message?: string;
  reviewName?: string;
  replyStatus?: "answered" | "unanswered";
  reply?: {
    comment?: string;
    updateTime?: string | null;
  };
};

type GenerateReplyResponse = {
  ok?: boolean;
  error?: string;
  user_message?: string;
  reply_text?: string;
};

type ApiReview = {
  name?: string | null;
  reviewId?: string | null;
  reviewerName?: string | null;
  starRating?: number | null;
  comment?: string | null;
  originalComment?: string | null;
  translatedComment?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  replyStatus?: "answered" | "unanswered" | string;
  reply?: {
    comment?: string | null;
    updateTime?: string | null;
  } | null;
};

type ReviewsResponse = {
  error?: string;
  user_message?: string;
  nextPageToken?: string | null;
  totalReviewCount?: number;
  reviews?: ApiReview[];
};

const REVIEWS_PAGE_SIZE = 50;

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <span key={index} className={index < rating ? styles.starOn : styles.starOff} aria-hidden="true">
      ★
    </span>
  ));
}

function defaultReplyFor(review: EReputationReviewItem | null) {
  if (!review) return "";
  if (review.reply) return review.reply;
  return "Merci beaucoup pour votre avis et votre confiance. Nous sommes ravis d’avoir pu vous accompagner. Au plaisir de vous revoir prochainement !";
}

function getErrorMessage(payload: ReplyResponse | GenerateReplyResponse | ReviewsResponse | null, fallback: string) {
  return payload?.user_message || payload?.error || fallback;
}

function formatReviewDate(value: string | null | undefined) {
  if (!value) return "Date non précisée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date non précisée";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toReviewItem(review: ApiReview): EReputationReviewItem {
  const reviewName = String(review.name || "").trim() || null;
  const reviewId = String(review.reviewId || reviewName || Math.random().toString(36).slice(2)).trim();
  const hasReply = review.replyStatus === "answered" || Boolean(review.reply?.comment);
  const rating = Math.min(5, Math.max(0, Math.round(Number(review.starRating || 0)))) || 0;
  const parsedComment = splitGoogleReviewText(review.comment);
  const originalComment = cleanGoogleReviewText(review.originalComment) || parsedComment.original;
  const translatedComment = cleanGoogleReviewText(review.translatedComment) || parsedComment.translated;
  const cleanComment = originalComment || cleanGoogleReviewText(review.comment) || translatedComment;
  const cleanReply = cleanGoogleReviewText(review.reply?.comment);

  return {
    id: reviewName || reviewId,
    reviewName,
    name: String(review.reviewerName || "Client Google").trim() || "Client Google",
    rating,
    date: formatReviewDate(review.updateTime || review.createTime),
    status: hasReply ? "Répondu" : rating > 0 && rating <= 3 ? "À traiter" : "À répondre",
    comment: cleanComment || "Avis sans commentaire écrit.",
    originalComment: originalComment || cleanComment || null,
    translatedComment: translatedComment || null,
    reply: cleanReply || null,
    live: true,
  };
}

function mergeReviews(current: EReputationReviewItem[], incoming: EReputationReviewItem[]) {
  const map = new Map<string, EReputationReviewItem>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

function isTodo(review: EReputationReviewItem) {
  return review.status !== "Répondu";
}

function compactReviewText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanGoogleReviewText(value: string | null | undefined) {
  return compactReviewText(value)
    .replace(/\(\s*(?:Translated by Google|Traduit par Google|Translation by Google|Traduction Google)\s*\)\s*/gi, "")
    .replace(/\(\s*(?:Original|Texte original)\s*\)\s*/gi, "")
    .trim();
}

function splitGoogleReviewText(value: string | null | undefined) {
  const text = compactReviewText(value);
  if (!text) return { original: "", translated: "" };

  const translatedMarker = /\(\s*(?:Translated by Google|Traduit par Google|Translation by Google|Traduction Google)\s*\)/i;
  const originalMarker = /\(\s*(?:Original|Texte original)\s*\)/i;
  const translatedMatch = translatedMarker.exec(text);
  const originalMatch = originalMarker.exec(text);

  if (originalMatch) {
    const original = cleanGoogleReviewText(text.slice(originalMatch.index + originalMatch[0].length));
    const translatedSource = translatedMatch && translatedMatch.index < originalMatch.index
      ? text.slice(translatedMatch.index + translatedMatch[0].length, originalMatch.index)
      : text.slice(0, originalMatch.index);
    const translated = cleanGoogleReviewText(translatedSource);
    return { original, translated };
  }

  return { original: cleanGoogleReviewText(text), translated: "" };
}

function getReviewOriginalText(review: EReputationReviewItem | null) {
  if (!review) return "";
  const parsed = splitGoogleReviewText(review.comment);
  return cleanGoogleReviewText(review.originalComment) || parsed.original || cleanGoogleReviewText(review.comment);
}

function getReviewTranslatedText(review: EReputationReviewItem | null) {
  if (!review) return "";
  const parsed = splitGoogleReviewText(review.comment);
  return cleanGoogleReviewText(review.translatedComment) || parsed.translated;
}

function truncateText(review: EReputationReviewItem, max = 110) {
  const clean = getReviewOriginalText(review) || review.comment;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}

function renderMultilineText(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => <p key={`${index}-${part.slice(0, 16)}`}>{part}</p>);
}

function ReviewTextBlock({ review }: { review: EReputationReviewItem }) {
  const original = getReviewOriginalText(review);
  const translated = getReviewTranslatedText(review);

  if (translated && original) {
    return (
      <div className={styles.reviewLanguageGroup}>
        <div className={styles.reviewLanguageBlock}>
          <span className={styles.reviewLanguageLabel}>Version originale</span>
          <div className={styles.reviewLanguageText}>{renderMultilineText(original)}</div>
        </div>
        <div className={styles.reviewLanguageBlock}>
          <span className={styles.reviewLanguageLabel}>Version traduite par Google</span>
          <div className={styles.reviewLanguageText}>{renderMultilineText(translated)}</div>
        </div>
      </div>
    );
  }

  return <div className={styles.reviewLanguageText}>{renderMultilineText(original || "Avis sans commentaire écrit.")}</div>;
}

export default function EReputationReviewsClient({
  reviews,
  reviewsReady,
  reviewsError,
  initialNextPageToken = null,
  totalReviewCount = 0,
  averageRatingLabel = "—",
  locationLabel = "Fiche Google Business",
  statusLabel = "Google Business",
  gmbReady = false,
}: Props) {
  const [items, setItems] = useState<EReputationReviewItem[]>(reviews);
  const [filter, setFilter] = useState<"all" | "todo" | "answered">("all");
  const [starFilter, setStarFilter] = useState<"all" | "5" | "4" | "3" | "2" | "1">("all");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState(reviews[0]?.id || "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replyText, setReplyText] = useState(defaultReplyFor(reviews[0] || null));
  const [nextPageToken, setNextPageToken] = useState<string | null>(initialNextPageToken || null);
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [listNotice, setListNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setItems(reviews);
    setNextPageToken(initialNextPageToken || null);
    setCurrentPage(1);
    setSelectedId((current) => (reviews.some((review) => review.id === current) ? current : reviews[0]?.id || ""));
  }, [reviews, initialNextPageToken]);

  const stats = useMemo(() => {
    const answered = items.filter((review) => review.status === "Répondu").length;
    const todo = items.length - answered;
    return { total: items.length, todo, answered };
  }, [items]);

  const selectedReview = items.find((review) => review.id === selectedId) || items[0] || null;

  const filteredReviews = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((review) => {
      if (filter === "todo" && !isTodo(review)) return false;
      if (filter === "answered" && review.status !== "Répondu") return false;
      if (starFilter !== "all" && review.rating !== Number(starFilter)) return false;
      if (!normalizedQuery) return true;
      return [review.name, review.comment, review.originalComment || "", review.translatedComment || "", review.reply || "", review.date, review.status]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filter, items, query, starFilter]);

  const hasLocalFilter = filter !== "all" || starFilter !== "all" || query.trim().length > 0;
  const totalPages = Math.max(
    1,
    Math.ceil((hasLocalFilter ? filteredReviews.length : Math.max(totalReviewCount, filteredReviews.length)) / REVIEWS_PAGE_SIZE)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * REVIEWS_PAGE_SIZE;
  const paginatedReviews = filteredReviews.slice(pageStartIndex, pageStartIndex + REVIEWS_PAGE_SIZE);
  const firstDisplayedReview = paginatedReviews.length ? pageStartIndex + 1 : 0;
  const lastDisplayedReview = paginatedReviews.length ? pageStartIndex + paginatedReviews.length : 0;
  const footerTotalReviews = hasLocalFilter ? filteredReviews.length : Math.max(totalReviewCount, filteredReviews.length);

  const paginationItems = useMemo(() => {
    const pages: Array<number | "ellipsis"> = [];
    if (totalPages <= 7) {
      for (let page = 1; page <= totalPages; page += 1) pages.push(page);
      return pages;
    }

    const current = safeCurrentPage;
    const candidates = new Set([1, 2, totalPages - 1, totalPages, current - 1, current, current + 1]);
    const ordered = Array.from(candidates)
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    for (const page of ordered) {
      const previous = pages[pages.length - 1];
      if (typeof previous === "number" && page - previous > 1) pages.push("ellipsis");
      pages.push(page);
    }

    return pages;
  }, [safeCurrentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, query, starFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setReplyText(defaultReplyFor(selectedReview));
    setNotice(null);
  }, [selectedReview?.id]);

  useEffect(() => {
    if (!detailsOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [detailsOpen]);

  useEffect(() => {
    if (!detailsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailsOpen]);

  const busy = publishing || generating || deleting || loadingMore || refreshing;
  const selectedAlreadyAnswered = selectedReview?.status === "Répondu";
  const canGenerate = Boolean(selectedReview?.live && selectedReview.reviewName && !busy);
  const canPublish = Boolean(selectedReview?.live && selectedReview.reviewName && replyText.trim().length >= 2 && !busy);
  const canDelete = Boolean(selectedReview?.live && selectedReview.reviewName && selectedReview.reply && !busy);
  const loadedLabel = totalReviewCount > 0 ? `${items.length.toLocaleString("fr-FR")} / ${totalReviewCount.toLocaleString("fr-FR")}` : items.length.toLocaleString("fr-FR");
  const totalReviewsLabel = (totalReviewCount > 0 ? totalReviewCount : stats.total).toLocaleString("fr-FR");
  const summaryStatusLabel = reviewsReady ? "Avis Google chargés" : statusLabel;
  const summaryStatusShortLabel = reviewsReady ? "Chargés" : statusLabel;

  function openDetails(review: EReputationReviewItem) {
    setSelectedId(review.id);
    setReplyText(defaultReplyFor(review));
    setNotice(null);
    setDetailsOpen(true);
  }

  async function requestReviews(pageToken?: string | null) {
    const params = new URLSearchParams({ pageSize: String(REVIEWS_PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`/api/e-reputation/google/reviews?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ReviewsResponse | null;

    if (!response.ok || !payload) {
      throw new Error(getErrorMessage(payload, "Impossible de charger les avis Google pour le moment."));
    }

    return {
      incoming: Array.isArray(payload.reviews) ? payload.reviews.map(toReviewItem) : [],
      nextToken: payload.nextPageToken || null,
    };
  }

  async function fetchReviews({ pageToken, replace }: { pageToken?: string | null; replace?: boolean } = {}) {
    const { incoming, nextToken } = await requestReviews(pageToken);
    setItems((current) => (replace ? incoming : mergeReviews(current, incoming)));
    setNextPageToken(nextToken);
    setSelectedId((current) => {
      if (!replace && current) return current;
      return incoming[0]?.id || "";
    });
    return incoming.length;
  }

  async function refreshReviews() {
    if (!reviewsReady) return;
    setRefreshing(true);
    setListNotice(null);

    try {
      const count = await fetchReviews({ replace: true });
      setListNotice({
        type: "success",
        text: count > 0 ? "Avis Google actualisés." : "Aucun avis Google n’a été retourné pour cette fiche.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d’actualiser les avis Google pour le moment.";
      setListNotice({ type: "error", text: message });
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMoreReviews() {
    if (!nextPageToken || !reviewsReady) return;
    setLoadingMore(true);
    setListNotice(null);

    try {
      const count = await fetchReviews({ pageToken: nextPageToken });
      setListNotice({
        type: "success",
        text: count > 0 ? "Avis supplémentaires chargés." : "Aucun autre avis à afficher.",
      });
      if (count > 0) setCurrentPage((page) => page + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de charger les avis suivants.";
      setListNotice({ type: "error", text: message });
    } finally {
      setLoadingMore(false);
    }
  }

  async function goToPage(targetPage: number) {
    if (!reviewsReady || busy) return;
    const cleanTarget = Math.min(Math.max(targetPage, 1), totalPages);
    const requiredCount = (cleanTarget - 1) * REVIEWS_PAGE_SIZE + 1;

    if (hasLocalFilter || items.length >= requiredCount || !nextPageToken) {
      setCurrentPage(cleanTarget);
      return;
    }

    setLoadingMore(true);
    setListNotice(null);

    try {
      let accumulated = items;
      let token: string | null = nextPageToken;

      while (accumulated.length < requiredCount && token) {
        const payload = await requestReviews(token);
        accumulated = mergeReviews(accumulated, payload.incoming);
        token = payload.nextToken;
        if (payload.incoming.length === 0) break;
      }

      setItems(accumulated);
      setNextPageToken(token);
      setCurrentPage(Math.min(cleanTarget, Math.max(1, Math.ceil(accumulated.length / REVIEWS_PAGE_SIZE))));
      setListNotice({ type: "success", text: "Page d’avis chargée." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de charger cette page d’avis.";
      setListNotice({ type: "error", text: message });
    } finally {
      setLoadingMore(false);
    }
  }

  async function generateReply() {
    if (!selectedReview?.reviewName) return;

    setGenerating(true);
    setNotice(null);
    setListNotice(null);

    try {
      const response = await fetch("/api/e-reputation/google/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reviewName: selectedReview.reviewName,
          reviewerName: selectedReview.name,
          rating: selectedReview.rating,
          comment: getReviewOriginalText(selectedReview) || selectedReview.comment,
          existingReply: selectedReview.reply || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as GenerateReplyResponse | null;

      if (!response.ok || !payload?.ok || !payload.reply_text) {
        throw new Error(getErrorMessage(payload, "Impossible de générer une réponse IA pour le moment."));
      }

      setReplyText(payload.reply_text);
      setNotice({
        type: "success",
        text: selectedAlreadyAnswered
          ? "Nouvelle proposition générée. Relisez-la puis modifiez la réponse Google si elle vous convient."
          : "Réponse générée. Relisez-la puis publiez-la sur Google si elle vous convient.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de générer une réponse IA pour le moment.";
      setNotice({ type: "error", text: message });
    } finally {
      setGenerating(false);
    }
  }

  async function publishReply() {
    if (!selectedReview?.reviewName) return;
    const cleanReply = replyText.trim();
    if (cleanReply.length < 2) {
      setNotice({ type: "error", text: "La réponse ne peut pas être vide." });
      return;
    }

    setPublishing(true);
    setNotice(null);
    setListNotice(null);

    try {
      const response = await fetch("/api/e-reputation/google/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewName: selectedReview.reviewName, comment: cleanReply }),
      });
      const payload = (await response.json().catch(() => null)) as ReplyResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(getErrorMessage(payload, "Impossible de publier la réponse Google pour le moment."));
      }

      const publishedComment = payload.reply?.comment || cleanReply;
      setItems((current) =>
        current.map((review) =>
          review.id === selectedReview.id
            ? {
                ...review,
                reply: publishedComment,
                status: "Répondu",
              }
            : review
        )
      );
      setReplyText(publishedComment);
      setNotice({ type: "success", text: "Réponse publiée sur Google Business." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de publier la réponse Google pour le moment.";
      setNotice({ type: "error", text: message });
    } finally {
      setPublishing(false);
    }
  }

  async function deleteReply() {
    if (!selectedReview?.reviewName || !selectedReview.reply) return;
    const confirmed = window.confirm("Supprimer la réponse publiée sur Google pour cet avis ?");
    if (!confirmed) return;

    setDeleting(true);
    setNotice(null);
    setListNotice(null);

    try {
      const response = await fetch("/api/e-reputation/google/reply", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewName: selectedReview.reviewName }),
      });
      const payload = (await response.json().catch(() => null)) as ReplyResponse | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(getErrorMessage(payload, "Impossible de supprimer la réponse Google pour le moment."));
      }

      setItems((current) =>
        current.map((review) =>
          review.id === selectedReview.id
            ? {
                ...review,
                reply: null,
                status: "À répondre",
              }
            : review
        )
      );
      setReplyText(defaultReplyFor({ ...selectedReview, reply: null, status: "À répondre" }));
      setNotice({ type: "success", text: "Réponse supprimée de Google Business." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de supprimer la réponse Google pour le moment.";
      setNotice({ type: "error", text: message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <section className={styles.mailboxPanel} aria-label="Gestion des avis Google">
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <label className={styles.filterLabel} htmlFor="review-filter">Filtrer</label>
          <select id="review-filter" className={styles.select} value={filter} onChange={(event) => setFilter(event.target.value as "all" | "todo" | "answered")}>
            <option value="all">Tous les avis</option>
            <option value="todo">À répondre</option>
            <option value="answered">Répondus</option>
          </select>
          <select id="review-star-filter" className={styles.select} value={starFilter} onChange={(event) => setStarFilter(event.target.value as "all" | "5" | "4" | "3" | "2" | "1")}>
            <option value="all">Toutes les notes</option>
            <option value="5">5 étoiles</option>
            <option value="4">4 étoiles</option>
            <option value="3">3 étoiles</option>
            <option value="2">2 étoiles</option>
            <option value="1">1 étoile</option>
          </select>
          <input
            className={styles.searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un avis..."
            type="search"
          />
        </div>
        <div className={styles.toolbarRight}>
          <div className={`${styles.reputationSummaryChip} ${gmbReady ? styles.reputationSummaryReady : ""}`} aria-label={`${locationLabel} · ${summaryStatusLabel} · ${totalReviewsLabel} avis · Note ${averageRatingLabel}`}>
            <span className={styles.summaryLocation}>{locationLabel}</span>
            <span className={styles.summaryStatus}>
              <span className={styles.summaryDot} aria-hidden="true" />
              <span className={styles.summaryStatusDesktop}>{summaryStatusLabel}</span>
              <span className={styles.summaryStatusMobile}>{summaryStatusShortLabel}</span>
            </span>
            <span>Nombre : {totalReviewsLabel}</span>
            <span>Note {averageRatingLabel}</span>
          </div>
          <button
            type="button"
            className={`${styles.btnGhostSmall} ${styles.refreshButton}`}
            onClick={refreshReviews}
            disabled={!reviewsReady || busy}
            aria-label={refreshing ? "Actualisation des avis" : "Actualiser les avis"}
            title={refreshing ? "Actualisation..." : "Actualiser"}
          >
            <span className={styles.refreshIcon} aria-hidden="true">⟳</span>
            <span className={styles.refreshText}>{refreshing ? "Actualisation..." : "Actualiser"}</span>
          </button>
        </div>
      </div>

      {reviewsError ? (
        <div className={styles.noticeError}>
          <strong>Avis indisponibles</strong>
          <span>{reviewsError}</span>
        </div>
      ) : null}

      {!reviewsReady ? (
        <div className={styles.noticeInfo}>
          <strong>Prévisualisation</strong>
          <span>Les boutons de gestion s’activeront dès que les vrais avis Google seront chargés.</span>
        </div>
      ) : null}

      {listNotice ? (
        <div className={listNotice.type === "success" ? styles.noticeSuccess : styles.noticeError} role="status">
          {listNotice.text}
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.reviewsTable}>
          <thead>
            <tr>
              <th>Avis</th>
              <th>Note</th>
              <th>Statut</th>
              <th>Date</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReviews.length ? (
              paginatedReviews.map((review) => (
                <tr key={review.id} className={review.id === selectedId ? styles.activeRow : undefined}>
                  <td>
                    <button type="button" className={styles.reviewMainCell} onClick={() => openDetails(review)}>
                      <strong>{review.name}</strong>
                      <span>{truncateText(review)}</span>
                      <span className={styles.mobileReviewMeta}>
                        <span className={styles.mobileReviewStars} aria-label={`${review.rating} étoiles sur 5`}>
                          {renderStars(review.rating)}
                        </span>
                        <span className={review.status === "Répondu" ? styles.mobileStatusAnswered : styles.mobileStatusTodo}>
                          {review.status}
                        </span>
                        <span>{review.date}</span>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className={styles.stars} aria-label={`${review.rating} étoiles sur 5`}>
                      {renderStars(review.rating)}
                    </span>
                  </td>
                  <td>
                    <span className={review.status === "Répondu" ? styles.answeredBadge : styles.todoBadge}>{review.status}</span>
                  </td>
                  <td>{review.date}</td>
                  <td>
                    <button type="button" className={styles.detailsBtn} onClick={() => openDetails(review)} aria-label={`Ouvrir le détail de l’avis de ${review.name}`}>
                      ↗
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  <div className={styles.emptyState}>
                    <strong>Aucun avis dans ce filtre</strong>
                    <span>Changez de filtre ou réclamez de nouveaux avis via Propulser → Récolter.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footerBar}>
        <span>
          {paginatedReviews.length
            ? `Affichage ${firstDisplayedReview.toLocaleString("fr-FR")}–${lastDisplayedReview.toLocaleString("fr-FR")} sur ${footerTotalReviews.toLocaleString("fr-FR")} avis`
            : "Affichage 0 avis"} · {loadedLabel} chargés
        </span>
        {reviewsReady ? (
          <div className={styles.paginationControls} aria-label="Pagination des avis">
            <button type="button" className={styles.paginationArrow} onClick={() => goToPage(safeCurrentPage - 1)} disabled={busy || safeCurrentPage <= 1}>
              ‹
            </button>
            {paginationItems.map((page, index) =>
              page === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className={styles.paginationEllipsis}>…</span>
              ) : (
                <button
                  key={page}
                  type="button"
                  className={page === safeCurrentPage ? styles.paginationActive : styles.paginationPage}
                  onClick={() => goToPage(page)}
                  disabled={busy || page === safeCurrentPage}
                >
                  {page}
                </button>
              )
            )}
            <button type="button" className={styles.paginationArrow} onClick={() => goToPage(safeCurrentPage + 1)} disabled={busy || safeCurrentPage >= totalPages || (!hasLocalFilter && !nextPageToken && items.length <= safeCurrentPage * REVIEWS_PAGE_SIZE)}>
              ›
            </button>
          </div>
        ) : (
          <span className={styles.footerHint}>Connexion Google requise</span>
        )}
      </div>

    </section>

    {detailsOpen && selectedReview && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setDetailsOpen(false)}>
            <section className={styles.detailsModal} role="dialog" aria-modal="true" aria-labelledby="review-details-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className={styles.modalHeader}>
                <span className={styles.modalKicker}>Avis Google</span>
                <h2 id="review-details-title">Détails de l’avis</h2>
                <button type="button" className={styles.modalClose} onClick={() => setDetailsOpen(false)} aria-label="Fermer">
                  Fermer
                </button>
              </header>

              <div className={styles.modalBody}>
                <article className={styles.reviewDetailCard}>
                  <div className={styles.reviewDetailTop}>
                    <div>
                      <strong>{selectedReview.name}</strong>
                      <span>{selectedReview.date}</span>
                    </div>
                    <span className={selectedReview.status === "Répondu" ? styles.answeredBadge : styles.todoBadge}>{selectedReview.status}</span>
                  </div>
                  <div className={styles.modalStars} aria-label={`${selectedReview.rating} étoiles sur 5`}>
                    {renderStars(selectedReview.rating)}
                  </div>
                  <div className={styles.reviewDetailScroll}>
                    <ReviewTextBlock review={selectedReview} />
                    {selectedReview.reply ? (
                      <div className={styles.currentReplyBox}>
                        <strong>Réponse actuelle</strong>
                        <span>{selectedReview.reply}</span>
                      </div>
                    ) : null}
                  </div>
                </article>

                <article className={styles.replyDetailCard}>
                  <div className={styles.replyHeaderLine}>
                    <div>
                      <span className={styles.modalKicker}>Réponse Google</span>
                      <h3>{selectedAlreadyAnswered ? "Modifier la réponse" : "Préparer la réponse"}</h3>
                    </div>
                    <span className={styles.aiChip}>IA</span>
                  </div>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    disabled={!selectedReview.live || busy}
                    maxLength={4096}
                    placeholder="Rédigez votre réponse Google..."
                  />
                  <div className={styles.charCount}>{replyText.trim().length.toLocaleString("fr-FR")} / 4 096 caractères</div>
                  {notice ? (
                    <div className={notice.type === "success" ? styles.noticeSuccess : styles.noticeError} role="status">
                      {notice.text}
                    </div>
                  ) : null}
                  <div className={styles.modalActions}>
                    <button className={styles.btnGhostSmall} type="button" disabled={!canGenerate} onClick={generateReply}>
                      {generating ? "Génération..." : "Générer avec iNrCy"}
                    </button>
                    <button className={styles.btnPrimarySmall} type="button" disabled={!canPublish} onClick={publishReply}>
                      {publishing ? "Publication..." : selectedAlreadyAnswered ? "Modifier la réponse" : "Publier la réponse"}
                    </button>
                    {selectedAlreadyAnswered ? (
                      <button className={styles.btnDangerSmall} type="button" disabled={!canDelete} onClick={deleteReply}>
                        {deleting ? "Suppression..." : "Supprimer"}
                      </button>
                    ) : null}
                  </div>
                  <p className={styles.secureText}>Vous validez chaque réponse avant publication sur Google.</p>
                </article>
              </div>
            </section>
          </div>,
          document.body
        )
      : null}
    </>
  );
}
