"use client";

import { useEffect, useRef, useState } from "react";

const REFRESH_THRESHOLD = 112;
const MAX_DISTANCE = 120;
const MOBILE_QUERY = "(max-width: 768px) and (pointer: coarse)";

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

function hasScrollableParent(element: Element | null) {
  let current = element?.parentElement ?? null;

  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll = /(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight + 2;

    if (canScroll) return true;
    current = current.parentElement;
  }

  return false;
}

function canPullToRefresh(target: EventTarget | null) {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia(MOBILE_QUERY).matches) return false;
  if (window.scrollY > 2) return false;

  const element = target instanceof Element ? target : null;
  if (isEditableElement(document.activeElement)) return false;
  if (isEditableElement(element)) return false;
  if (isInsideBlockingLayer(element)) return false;
  if (hasScrollableParent(element)) return false;

  return true;
}

export default function PullToRefresh() {
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activeRef = useRef(false);
  const triggeredRef = useRef(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
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
