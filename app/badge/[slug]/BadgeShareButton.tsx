"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./badge.module.css";

type Props = {
  publicUrl: string;
  company: string;
  vCardUri: string;
  vCardFilename: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true;
}

function detectPlatform() {
  if (typeof navigator === "undefined") return { ios: false, android: false, safari: false };
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const safari = /Safari/i.test(ua) && !/Chrome|CriOS|EdgiOS|FxiOS|OPiOS/i.test(ua);
  return { ios, android, safari };
}

export default function BadgeShareButton({ publicUrl, company, vCardUri, vCardFilename }: Props) {
  const [open, setOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [helperText, setHelperText] = useState("");
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!open) setHelperText("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function handleNativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: company || "iNr'Badge", text: `Découvrez ${company || "cette entreprise"} sur iNr'Badge`, url: publicUrl });
      } else {
        await navigator.clipboard.writeText(publicUrl);
        setHelperText("Lien copié. Vous pouvez maintenant le partager où vous voulez.");
      }
    } catch {
      // utilisateur a annulé ou navigateur indisponible
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setHelperText("Lien copié dans le presse-papiers.");
    } catch {
      setHelperText("Impossible de copier automatiquement. Vous pouvez sélectionner l'URL et la copier manuellement.");
    }
  }

  async function handleInstall() {
    if (isStandaloneMode()) {
      setHelperText("Cette fiche est déjà disponible sur l'écran d'accueil de ce téléphone.");
      return;
    }

    if (installPromptEvent) {
      try {
        await installPromptEvent.prompt();
        await installPromptEvent.userChoice;
        setHelperText("Demande d'ajout à l'écran d'accueil envoyée.");
      } catch {
        setHelperText("L'ajout à l'écran d'accueil n'a pas pu être lancé.");
      }
      return;
    }

    if (platform.ios && platform.safari) {
      setHelperText("Sur iPhone : appuyez sur Partager dans Safari, puis choisissez “Sur l’écran d’accueil”.");
      return;
    }

    setHelperText("Sur Android : ouvrez le menu du navigateur puis choisissez “Ajouter à l’écran d’accueil” ou “Installer l’application”.");
  }

  function handleSaveContact() {
    const link = document.createElement("a");
    link.href = vCardUri;
    link.download = vCardFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function handleClosePage() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed && document.visibilityState === "visible") {
        window.history.back();
      }
    }, 120);
  }

  return (
    <>
      <div className={styles.floatingActions}>
        <button type="button" className={styles.shareButton} onClick={() => setOpen(true)} aria-label="Partager cette fiche" title="Partager">
          <span className={styles.shareGlyph} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.5 8.5L8.5 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15.5 15.5L8.5 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="18" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
              <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
              <circle cx="18" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
            </svg>
          </span>
        </button>
        <button type="button" className={`${styles.closePageButton} ${styles.iconActionButton}`} onClick={handleClosePage} aria-label="Fermer" title="Fermer">×</button>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.sheetLayer} aria-hidden={false}>
              <button type="button" className={styles.sheetBackdrop} aria-label="Fermer" onClick={() => setOpen(false)} />
              <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Partager cette fiche">
                <div className={styles.sheetHandle} />
                <div className={styles.sheetHeader}>
                  <div>
                    <strong>Garder cette fiche</strong>
                    <p>Partagez-la, copiez le lien ou ajoutez-la à l'écran d'accueil.</p>
                  </div>
                  <button type="button" className={styles.sheetClose} onClick={() => setOpen(false)} aria-label="Fermer">
                    ×
                  </button>
                </div>

                <div className={styles.sheetActions}>
                  <button type="button" className={styles.sheetAction} onClick={handleNativeShare}>
                    <span className={`${styles.sheetActionIcon} ${styles.shareTone}`}>
                      <span className={styles.shareGlyph}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15.5 8.5L8.5 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M15.5 15.5L8.5 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="18" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
                          <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
                          <circle cx="18" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.9"/>
                        </svg>
                      </span>
                    </span>
                    <span>
                      Partager
                      <small>WhatsApp, SMS, mail…</small>
                    </span>
                  </button>

                  <button type="button" className={styles.sheetAction} onClick={handleCopyLink}>
                    <span className={`${styles.sheetActionIcon} ${styles.copyTone}`}>⧉</span>
                    <span>
                      Copier le lien
                      <small>Conserver la fiche pour plus tard</small>
                    </span>
                  </button>

                  <button type="button" className={styles.sheetAction} onClick={handleInstall}>
                    <span className={`${styles.sheetActionIcon} ${styles.installTone}`}>＋</span>
                    <span>
                      Ajouter à l&apos;écran d&apos;accueil
                      <small>iPhone / Android</small>
                    </span>
                  </button>

                  <button type="button" className={styles.sheetAction} onClick={handleSaveContact}>
                    <span className={`${styles.sheetActionIcon} ${styles.contactTone}`}>👤</span>
                    <span>
                      Enregistrer le contact
                      <small>Ajouter la fiche dans le téléphone</small>
                    </span>
                  </button>
                </div>

                {helperText ? <div className={styles.sheetHelper}>{helperText}</div> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
