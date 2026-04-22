"use client";

import Link from "next/link";

import styles from "../dashboard.module.css";
import type { ModuleAction } from "../dashboard.types";

type DashboardActionButtonProps = {
  action: ModuleAction;
};

export default function DashboardActionButton({ action }: DashboardActionButtonProps) {
  const className =
    action.variant === "connect"
      ? `${styles.actionBtn} ${styles.connectBtn}`
      : action.variant === "danger"
      ? `${styles.actionBtn} ${styles.actionDanger}`
      : `${styles.actionBtn} ${styles.actionView}`;

  if (action.href) {
    const isExternal = action.href.startsWith("http");

    return (
      <Link href={action.href} className={className} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </button>
  );
}
