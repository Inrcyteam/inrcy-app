"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";

import styles from "./RequiredSetupLock.module.css";

type RequiredSetupLockProps = {
  message: string;
  className?: string;
  compact?: boolean;
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

const RESPONSIVE_QUERY = "(max-width: 1100px)";
const TOOLTIP_MAX_WIDTH = 310;
const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 10;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.5 10V7.7a4.5 4.5 0 0 1 9 0V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 14v2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function RequiredSetupLock({ message, className = "", compact = false }: RequiredSetupLockProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isResponsive, setIsResponsive] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useEffect(() => {
    const media = window.matchMedia(RESPONSIVE_QUERY);
    const sync = () => {
      setIsResponsive(media.matches);
      setOpen(false);
    };
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, Math.max(210, viewportWidth - VIEWPORT_GAP * 2));
    const estimatedHeight = 64;
    const canPlaceAbove = rect.top >= estimatedHeight + ANCHOR_GAP + VIEWPORT_GAP;
    const placement: TooltipPosition["placement"] = canPlaceAbove ? "top" : "bottom";
    const desiredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const left = Math.min(
      Math.max(VIEWPORT_GAP, desiredLeft),
      Math.max(VIEWPORT_GAP, viewportWidth - tooltipWidth - VIEWPORT_GAP),
    );
    const top = placement === "top"
      ? Math.max(VIEWPORT_GAP, rect.top - ANCHOR_GAP)
      : Math.min(viewportHeight - VIEWPORT_GAP, rect.bottom + ANCHOR_GAP);

    setPosition({ left, top, placement });
  }, []);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!isResponsive) return;
      if (anchorRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isResponsive, open, updatePosition]);

  const stopParentPointer = (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
  };

  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isResponsive) setOpen((value) => !value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (isResponsive) {
      setOpen((value) => !value);
    } else {
      setOpen(true);
    }
  };

  const tooltipStyle = position
    ? ({
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `min(${TOOLTIP_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_GAP * 2}px))`,
        transform: position.placement === "top" ? "translateY(-100%)" : undefined,
      } satisfies CSSProperties)
    : undefined;

  return (
    <>
      <span
        ref={anchorRef}
        className={`${styles.lock} ${compact ? styles.compact : ""} ${className}`.trim()}
        role="button"
        tabIndex={0}
        aria-label={message}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={isResponsive ? open : undefined}
        onPointerDown={stopParentPointer}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => { if (!isResponsive) setOpen(true); }}
        onMouseLeave={() => { if (!isResponsive) setOpen(false); }}
        onFocus={() => { if (!isResponsive) setOpen(true); }}
        onBlur={() => { if (!isResponsive) setOpen(false); }}
      >
        <LockIcon />
      </span>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              className={`${styles.tooltip} ${position.placement === "top" ? styles.tooltipTop : styles.tooltipBottom}`}
              role="tooltip"
              style={tooltipStyle}
            >
              {message}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
