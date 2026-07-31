"use client";

import styles from "./DetailSequenceNavigation.module.css";

type Props = {
  label: string;
  canPrevious: boolean;
  canNext: boolean;
  busy?: boolean;
  onPrevious: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  ariaLabel?: string;
};

export default function DetailSequenceNavigation({
  label,
  canPrevious,
  canNext,
  busy = false,
  onPrevious,
  onNext,
  ariaLabel = "Navigation entre les éléments",
}: Props) {
  return (
    <div className={styles.root} aria-label={ariaLabel}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void onPrevious()}
        disabled={busy || !canPrevious}
        aria-label="Élément précédent"
        title="Précédent"
      >
        ‹
      </button>
      <span className={styles.counter} aria-live="polite">
        {busy ? "…" : label}
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={() => void onNext()}
        disabled={busy || !canNext}
        aria-label="Élément suivant"
        title="Suivant"
      >
        ›
      </button>
    </div>
  );
}
