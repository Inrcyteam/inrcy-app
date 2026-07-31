"use client";

import styles from "./documents.module.css";
import {
  DocumentDateInput,
  type ServiceDateMode,
} from "./documentEditorShared";

type ServiceDateFieldsProps = {
  radioName: string;
  mode: ServiceDateMode;
  onModeChange: (mode: ServiceDateMode) => void;
  serviceDate: string;
  onServiceDateChange: (value: string) => void;
  servicePeriodStart: string;
  onServicePeriodStartChange: (value: string) => void;
  servicePeriodEnd: string;
  onServicePeriodEndChange: (value: string) => void;
  disabled?: boolean;
};

export function ServiceDateFields({
  radioName,
  mode,
  onModeChange,
  serviceDate,
  onServiceDateChange,
  servicePeriodStart,
  onServicePeriodStartChange,
  servicePeriodEnd,
  onServicePeriodEndChange,
  disabled = false,
}: ServiceDateFieldsProps) {
  return (
    <>
      <div
        className={styles.serviceDateModeSelector}
        role="radiogroup"
        aria-label="Type de date de prestation"
      >
        <label
          className={`${styles.serviceDateModeOption} ${mode === "single" ? styles.serviceDateModeOptionActive : ""}`}
        >
          <input
            type="radio"
            name={radioName}
            value="single"
            checked={mode === "single"}
            onChange={() => onModeChange("single")}
            disabled={disabled}
          />
          <span>Date unique</span>
        </label>
        <label
          className={`${styles.serviceDateModeOption} ${mode === "period" ? styles.serviceDateModeOptionActive : ""}`}
        >
          <input
            type="radio"
            name={radioName}
            value="period"
            checked={mode === "period"}
            onChange={() => onModeChange("period")}
            disabled={disabled}
          />
          <span>Période</span>
        </label>
      </div>

      {mode === "single" ? (
        <div className={styles.serviceDateSingleGrid}>
          <div className={styles.field}>
            <label>Date de prestation / livraison</label>
            <DocumentDateInput
              value={serviceDate}
              onChange={onServiceDateChange}
              disabled={disabled}
            />
          </div>
        </div>
      ) : (
        <div className={styles.serviceDateFieldsGrid}>
          <div className={styles.field}>
            <label>Début de prestation</label>
            <DocumentDateInput
              value={servicePeriodStart}
              onChange={onServicePeriodStartChange}
              disabled={disabled}
            />
          </div>
          <div className={styles.field}>
            <label>Fin de prestation</label>
            <DocumentDateInput
              value={servicePeriodEnd}
              onChange={onServicePeriodEndChange}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </>
  );
}

type NotesAndMentionsSectionProps = {
  notes: string;
  onNotesChange: (value: string) => void;
  mentionLabel: string;
  mention: string;
  onMentionChange: (value: string) => void;
  mentionPlaceholder: string;
  disabled?: boolean;
};

export function NotesAndMentionsSection({
  notes,
  onNotesChange,
  mentionLabel,
  mention,
  onMentionChange,
  mentionPlaceholder,
  disabled = false,
}: NotesAndMentionsSectionProps) {
  return (
    <div className={styles.advancedSection}>
      <div className={styles.advancedSectionTitle}>Notes & mentions</div>
      <div className={styles.twoCol}>
        <div className={styles.field}>
          <label>Notes</label>
          <textarea
            className={styles.advancedTextArea}
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Ex : Merci pour votre confiance."
            disabled={disabled}
          />
        </div>
        <div className={styles.field}>
          <label>{mentionLabel}</label>
          <textarea
            className={styles.advancedTextArea}
            value={mention}
            onChange={(event) => onMentionChange(event.target.value)}
            placeholder={mentionPlaceholder}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
