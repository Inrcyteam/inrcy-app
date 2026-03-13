import styles from "./dashboard.module.css";
import type { ModuleStatus } from "./dashboard.types";
import { DRAWER_PANELS, DRAWER_TITLES } from "./dashboard.constants";

export function statusLabel(s: ModuleStatus) {
  if (s === "connected") return "Connecté";
  if (s === "available") return "À connecter";
  return "Bientôt";
}

export function statusClass(s: ModuleStatus) {
  if (s === "connected") return styles.badgeOk;
  if (s === "available") return styles.badgeWarn;
  return styles.badgeSoon;
}

export function getDrawerTitle(panel: string | null) {
  if (!panel) return "";
  return DRAWER_TITLES[panel as keyof typeof DRAWER_TITLES] ?? "";
}

export function isDrawerPanel(panel: string | null) {
  return !!panel && DRAWER_PANELS.has(panel);
}

export function getNormalizedSiteDomain(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
