import React from "react";
import Link from "next/link";
import styles from "./ResponsiveActionButton.module.css";

type Props = {
  /** Texte affiché en desktop */
  desktopLabel: string;
  /** Contenu affiché en mobile (ex: '✕', '⚙️', '☰') */
  mobileIcon: React.ReactNode;
  /** Lien (si fourni, rend un <Link>) */
  href?: string;
  /** Handler (si pas de href) */
  onClick?: () => void;
  /** Accessibilité */
  ariaLabel?: string;
  title?: string;
  className?: string;
  type?: "button" | "submit" | "reset";
};

export default function ResponsiveActionButton({
  desktopLabel,
  mobileIcon,
  href,
  onClick,
  ariaLabel,
  title,
  className,
  type = "button",
}: Props) {
  const label = ariaLabel || desktopLabel;
  const commonProps = {
    className: className ? `${styles.btn} ${className}` : styles.btn,
    "aria-label": label,
    title: title || desktopLabel,
  } as const;

  const content = (
    <>
      <span className={styles.text}>{desktopLabel}</span>
      <span className={styles.icon} aria-hidden>
        {mobileIcon}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} {...commonProps}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} {...commonProps}>
      {content}
    </button>
  );
}
