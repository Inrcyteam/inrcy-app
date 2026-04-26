"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

function isInside(ref: RefObject<HTMLDivElement | null>, target: EventTarget | null) {
  if (!ref.current || !target) return false;
  return ref.current.contains(target as Node);
}

export function useDashboardMenus(userEmail: string | null) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const desktopNotificationMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileNotificationMenuRef = useRef<HTMLDivElement | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    document.documentElement.classList.toggle("isTouch", isTouch);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };

    const closeIfOutside = (target: EventTarget | null) => {
      if (!isInside(userMenuRef, target)) setUserMenuOpen(false);
    };

    const onPointerDownMouse = (event: MouseEvent) => closeIfOutside(event.target);
    const onPointerDownTouch = (event: TouchEvent) => closeIfOutside(event.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!notificationMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationMenuOpen(false);
    };

    const closeIfOutside = (target: EventTarget | null) => {
      const inDesktop = isInside(desktopNotificationMenuRef, target);
      const inMobile = isInside(mobileNotificationMenuRef, target);
      if (!inDesktop && !inMobile) setNotificationMenuOpen(false);
    };

    const onPointerDownMouse = (event: MouseEvent) => closeIfOutside(event.target);
    const onPointerDownTouch = (event: TouchEvent) => closeIfOutside(event.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [notificationMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    const closeIfOutside = (target: EventTarget | null) => {
      if (!isInside(menuRef, target)) setMenuOpen(false);
    };

    const onPointerDownMouse = (event: MouseEvent) => closeIfOutside(event.target);
    const onPointerDownTouch = (event: TouchEvent) => closeIfOutside(event.target);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDownMouse);
    window.addEventListener("touchstart", onPointerDownTouch, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDownMouse);
      window.removeEventListener("touchstart", onPointerDownTouch);
    };
  }, [menuOpen]);

  const userFirstLetter = useMemo(
    () => (userEmail?.trim()?.[0] ?? "U").toUpperCase(),
    [userEmail],
  );

  return {
    userMenuOpen,
    setUserMenuOpen,
    userMenuRef,
    notificationMenuOpen,
    setNotificationMenuOpen,
    desktopNotificationMenuRef,
    mobileNotificationMenuRef,
    userFirstLetter,
    menuOpen,
    setMenuOpen,
    menuRef,
  };
}
