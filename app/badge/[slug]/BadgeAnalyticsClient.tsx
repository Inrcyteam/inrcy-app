"use client";

import { useEffect } from "react";

type Props = {
  slug: string;
};

const VISITOR_KEY = "inrcy_inrbadge_visitor_id_v1";

function createVisitorId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const next = createVisitorId();
    window.localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return createVisitorId();
  }
}

function clean(value: unknown, max = 700) {
  return String(value ?? "").trim().slice(0, max);
}

function getSourceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return clean(params.get("src") || params.get("source") || params.get("utm_source") || "direct", 80).toLowerCase();
}

function isQrSource(source: string) {
  return ["qr", "qrcode", "qr_code", "inrbadge_qr"].includes(source);
}

function sendTrack(slug: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({
    slug,
    visitorId: getVisitorId(),
    referrer: document.referrer || "",
    pathname: window.location.pathname,
    ...payload,
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/inrbadge/track", blob)) return;
    }
  } catch {
    // fallback fetch
  }

  void fetch("/api/inrbadge/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export default function BadgeAnalyticsClient({ slug }: Props) {
  useEffect(() => {
    const source = getSourceFromUrl();
    sendTrack(slug, { eventType: "view", source });
    if (isQrSource(source)) {
      sendTrack(slug, { eventType: "qr_scan", source });
    }
  }, [slug]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-inrbadge-action]") : null;
      if (!target) return;
      sendTrack(slug, {
        eventType: "action_click",
        actionKey: target.dataset.inrbadgeAction || "other",
        targetUrl: target.dataset.inrbadgeTarget || target.getAttribute("href") || "",
        source: getSourceFromUrl(),
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [slug]);

  return null;
}
