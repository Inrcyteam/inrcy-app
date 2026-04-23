import React from "react";
import styles from "../mails.module.css";

type MailboxSearchPanelProps = {
  open: boolean;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onClose: () => void;
  onClear: () => void;
};

export default function MailboxSearchPanel({ open, value, inputRef, onChange, onClose, onClear }: MailboxSearchPanelProps) {
  if (!open) return null;

  return (
    <div className={styles.searchPanel}>
      <div className={styles.searchPanelInner}>
        <input
          ref={inputRef}
          className={styles.searchInputInline}
          placeholder="Rechercher un envoi…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value.trim() ? (
          <button
            className={styles.searchClearBtn}
            type="button"
            onClick={onClear}
            title="Effacer"
            aria-label="Effacer"
          >
            ×
          </button>
        ) : null}
        <button
          className={styles.searchCloseBtn}
          type="button"
          onClick={onClose}
          title="Fermer"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
