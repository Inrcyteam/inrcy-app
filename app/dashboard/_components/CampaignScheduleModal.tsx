import { useEffect, useRef, useState } from "react";
import styles from "./CampaignScheduleModal.module.css";
import { useUnsavedExitGuard } from "../_hooks/useUnsavedExitGuard";

export type CampaignScheduleModalProps = {
  open: boolean;
  title?: string;
  kicker?: string;
  description: string;
  recipientCount: number;
  subject: string;
  saving: boolean;
  error?: string | null;
  confirmLabel?: string;
  savingLabel?: string;
  successMessage?: string;
  initialScheduledAt?: string | null;
  showSummary?: boolean;
  onClose: () => void;
  onConfirm: (scheduledAt: string) => void | Promise<void>;
  onSuccess?: () => void | Promise<void>;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateTimeFromIso(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (!Number.isFinite(date.getTime())) {
    return dateTimeFromIso(null);
  }
  date.setSeconds(0, 0);
  return {
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

function defaultDateTime() {
  return dateTimeFromIso(null);
}

function localInputsToIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map((value) => Number(value));
  const [hour, minute] = time.split(":").map((value) => Number(value));
  const scheduled = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    hour || 0,
    minute || 0,
    0,
    0,
  );
  if (!Number.isFinite(scheduled.getTime())) return "";
  return scheduled.toISOString();
}

function openNativeDateTimePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) return;
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof pickerInput.showPicker === "function") {
    try {
      pickerInput.showPicker();
      return;
    } catch {
      // Safari peut refuser showPicker hors interaction directe.
    }
  }
  input.click();
}

function CalendarMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </svg>
  );
}

function ClockMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function CampaignScheduleModal({
  open,
  title = "Programmer l’envoi",
  kicker = "Programmation iNr’Agent",
  description,
  recipientCount,
  subject,
  saving,
  error,
  confirmLabel = "Confier à iNr’Agent",
  savingLabel = "Programmation en cours…",
  successMessage = "Programmation réussie.",
  initialScheduledAt,
  showSummary = true,
  onClose,
  onConfirm,
  onSuccess,
}: CampaignScheduleModalProps) {
  const [date, setDate] = useState(() => defaultDateTime().date);
  const [time, setTime] = useState(() => defaultDateTime().time);
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState("");
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = dateTimeFromIso(initialScheduledAt);
    setDate(next.date);
    setTime(next.time);
    setBaseline(JSON.stringify(next));
    setLocalError("");
    setSubmitting(false);
    setDoneMessage("");
  }, [open, initialScheduledAt]);

  const hasUnsavedChanges = open && Boolean(baseline) && JSON.stringify({ date, time }) !== baseline;
  const { confirmExit } = useUnsavedExitGuard({
    active: open,
    shouldBlock: hasUnsavedChanges,
    onConfirmExit: onClose,
    eyebrow: "Programmation",
    title: "Quitter sans enregistrer ?",
    message: "Cet horaire contient des modifications non enregistrées. Si vous fermez maintenant, elles seront perdues.",
    confirmLabel: "Fermer sans enregistrer",
    cancelLabel: "Continuer l’édition",
    variant: "warning",
  });

  if (!open) return null;

  const busy = saving || submitting;

  const submit = async () => {
    if (busy || doneMessage) return;
    const scheduledAt = localInputsToIso(date, time);
    if (!scheduledAt) {
      setLocalError("Choisissez une date et une heure valides.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now() + 30_000) {
      setLocalError("Choisissez un horaire dans le futur.");
      return;
    }
    setLocalError("");
    setSubmitting(true);
    try {
      await onConfirm(scheduledAt);
      setDoneMessage(successMessage);
      window.setTimeout(() => {
        void onSuccess?.();
      }, 850);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message) {
        setLocalError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || error || "";

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-schedule-title"
    >
      <div
        className={styles.card}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>{kicker}</div>
            <h3 id="campaign-schedule-title" className={styles.title}>
              {title}
            </h3>
            <p className={styles.hint}>{description}</p>
          </div>
          <button
            className={styles.closeBtn}
            type="button"
            onClick={() => void confirmExit()}
            disabled={busy}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Date</span>
            <div
              className={styles.nativeField}
              data-disabled={busy ? "true" : "false"}
              onClick={() => openNativeDateTimePicker(dateInputRef.current)}
            >
              <input
                ref={dateInputRef}
                className={styles.nativeInput}
                type="date"
                value={date}
                disabled={busy}
                onChange={(event) => setDate(event.target.value)}
              />
              <button
                className={styles.pickerBtn}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openNativeDateTimePicker(dateInputRef.current);
                }}
                disabled={busy}
                aria-label="Ouvrir le calendrier"
              >
                <CalendarMiniIcon />
              </button>
            </div>
          </label>
          <label className={styles.field}>
            <span>Heure</span>
            <div
              className={styles.nativeField}
              data-disabled={busy ? "true" : "false"}
              onClick={() => openNativeDateTimePicker(timeInputRef.current)}
            >
              <input
                ref={timeInputRef}
                className={styles.nativeInput}
                type="time"
                value={time}
                disabled={busy}
                onChange={(event) => setTime(event.target.value)}
              />
              <button
                className={styles.pickerBtn}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openNativeDateTimePicker(timeInputRef.current);
                }}
                disabled={busy}
                aria-label="Ouvrir le choix de l’heure"
              >
                <ClockMiniIcon />
              </button>
            </div>
          </label>
        </div>

        {displayedError ? (
          <div className={styles.error}>{displayedError}</div>
        ) : null}
        {doneMessage ? (
          <div className={styles.success}>{doneMessage}</div>
        ) : null}

        {showSummary ? (
          <div className={styles.summary}>
            <strong>
              {recipientCount} destinataire{recipientCount > 1 ? "s" : ""}
            </strong>
            <span>Objet : {subject.trim() || "(sans objet)"}</span>
          </div>
        ) : null}

        <div className={styles.footer}>
          <button
            className={styles.secondaryBtn}
            type="button"
            onClick={() => void confirmExit()}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            className={styles.primaryBtn}
            type="button"
            onClick={submit}
            disabled={busy}
          >
            {busy ? savingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
