"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_THRESHOLD = 112;
const MAX_DISTANCE = 120;

function isIosSafari() {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent;
  const vendor = window.navigator.vendor;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  if (!isIOS) return false;

  // On garde ce refresh maison uniquement pour Safari iOS.
  // Android/Chrome garde son pull-to-refresh natif.
  const isSafari =
    /Safari/i.test(ua) &&
    /Apple/i.test(vendor) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Instagram|FBAN|FBAV/i.test(ua);

  return isSafari;
}

function isEditableElement(element: Element | null) {
  if (!element) return false;
  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
    ),
  );
}

function isInsideBlockingLayer(element: Element | null) {
  if (!element) return false;
  return Boolean(
    element.closest(
      [
        '[data-disable-pull-refresh]',
        '[data-pull-refresh="off"]',
        '[aria-modal="true"]',
        '[role="dialog"]',
        'dialog',
        '[class*="modal"]',
        '[class*="Modal"]',
        '[class*="drawer"]',
        '[class*="Drawer"]',
        '[class*="popover"]',
        '[class*="Popover"]',
      ].join(','),
    ),
  );
}

function isVerticallyScrollable(element: Element) {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;

  if (!/(auto|scroll|overlay)/.test(overflowY)) return false;
  return element.scrollHeight > element.clientHeight + 8;
}

function findScrollableContainer(element: Element | null): HTMLElement | null {
  let current = element instanceof HTMLElement ? element : null;

  while (current && current !== document.body && current !== document.documentElement) {
    if (isVerticallyScrollable(current)) return current;
    current = current.parentElement;
  }

  return null;
}

function getDocumentScrollTop() {
  return Math.max(
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
  );
}

function isAtRealTop(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  const scrollContainer = findScrollableContainer(element);

  // Si une page/zone possède son propre scroll, on se base dessus.
  // Ça évite le bug où window.scrollY reste à 0 alors que l’utilisateur est en bas d’un conteneur interne.
  if (scrollContainer) return scrollContainer.scrollTop <= 2;

  return getDocumentScrollTop() <= 2;
}

function canPullToRefresh(target: EventTarget | null) {
  if (typeof window === "undefined") return false;
  if (!isIosSafari()) return false;

  const element = target instanceof Element ? target : null;
  if (isEditableElement(document.activeElement)) return false;
  if (isEditableElement(element)) return false;
  if (isInsideBlockingLayer(element)) return false;
  if (!isAtRealTop(target)) return false;

  return true;
}

export default function PullToRefresh() {
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activeRef = useRef(false);
  const triggeredRef = useRef(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (!isIosSafari()) return;

    const reset = () => {
      activeRef.current = false;
      startYRef.current = 0;
      startXRef.current = 0;
      window.setTimeout(() => setDistance(0), 120);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!canPullToRefresh(event.target)) return;

      const touch = event.touches[0];
      if (!touch) return;

      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      activeRef.current = true;
      triggeredRef.current = false;
      setDistance(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || !canPullToRefresh(event.target)) return;

      const touch = event.touches[0];
      if (!touch) return;

      const diffY = touch.clientY - startYRef.current;
      const diffX = Math.abs(touch.clientX - startXRef.current);

      if (diffX > Math.abs(diffY) + 12) {
        reset();
        return;
      }

      if (diffY <= 0) {
        setDistance(0);
        return;
      }

      setDistance(Math.min(MAX_DISTANCE, Math.round(diffY * 0.55)));
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!activeRef.current) return;

      const touch = event.changedTouches[0];
      const diffY = (touch?.clientY ?? 0) - startYRef.current;

      if (diffY > REFRESH_THRESHOLD && canPullToRefresh(event.target) && !triggeredRef.current) {
        triggeredRef.current = true;
        setDistance(90);
        window.location.reload();
        return;
      }

      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  const ready = distance >= 60;

  return (
    <div
      className={`globalPullRefreshIndicator ${distance > 0 ? "globalPullRefreshIndicatorVisible" : ""}`}
      style={{ transform: `translate(-50%, ${Math.min(76, distance)}px)` }}
      aria-hidden="true"
    >
      {ready ? "Relâcher pour actualiser" : "Tirer pour actualiser"}
    </div>
  );
}
