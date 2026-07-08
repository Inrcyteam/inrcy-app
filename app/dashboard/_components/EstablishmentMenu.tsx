"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { purgeAllBrowserAccountCaches, setActiveBrowserUserId } from "@/lib/browserAccountCache";
import { switchActiveInrcyAccount } from "@/lib/multicompte/client";
import { getAvailableEstablishmentSlots } from "@/lib/multicompte/normalize";
import type { InrcyAccountSummary, InrcyMultiAccountConfig } from "@/lib/multicompte/types";
import styles from "../dashboard.module.css";

type MenuPayload = {
  ok?: boolean;
  activeUserId?: string;
  accounts?: InrcyAccountSummary[];
  config?: InrcyMultiAccountConfig;
  error?: string;
};

type Copy = {
  button: string;
  title: string;
  loading: string;
  current: string;
  switchError: string;
  create: string;
  createTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  confirm: string;
  cancel: string;
  creating: string;
  contactPrefix: string;
  contactAction: string;
  establishment: string;
  retry: string;
};

const COPIES: Record<string, Copy> = {
  fr: {
    button: "Établissements",
    title: "Mes établissements",
    loading: "Chargement…",
    current: "Actuel",
    switchError: "Impossible de changer d’établissement.",
    create: "Créer",
    createTitle: "Créer un établissement",
    nameLabel: "Nom de l’établissement",
    namePlaceholder: "Etablissement 2",
    confirm: "Créer",
    cancel: "Annuler",
    creating: "Création…",
    contactPrefix: "Pour ajouter un établissement supplémentaire,",
    contactAction: "contactez iNrCy",
    establishment: "Établissement",
    retry: "Réessayer",
  },
  en: {
    button: "Establishments",
    title: "My establishments",
    loading: "Loading…",
    current: "Current",
    switchError: "Unable to switch establishment.",
    create: "Create",
    createTitle: "Create an establishment",
    nameLabel: "Establishment name",
    namePlaceholder: "Establishment 2",
    confirm: "Create",
    cancel: "Cancel",
    creating: "Creating…",
    contactPrefix: "To add another establishment,",
    contactAction: "contact iNrCy",
    establishment: "Establishment",
    retry: "Retry",
  },
  es: {
    button: "Establecimientos", title: "Mis establecimientos", loading: "Cargando…", current: "Actual",
    switchError: "No se puede cambiar de establecimiento.", create: "Crear", createTitle: "Crear un establecimiento",
    nameLabel: "Nombre del establecimiento", namePlaceholder: "Establecimiento 2", confirm: "Crear", cancel: "Cancelar",
    creating: "Creando…", contactPrefix: "Para añadir otro establecimiento,", contactAction: "contacte con iNrCy",
    establishment: "Establecimiento", retry: "Reintentar",
  },
  it: {
    button: "Sedi", title: "Le mie sedi", loading: "Caricamento…", current: "Attuale",
    switchError: "Impossibile cambiare sede.", create: "Crea", createTitle: "Crea una sede",
    nameLabel: "Nome della sede", namePlaceholder: "Sede 2", confirm: "Crea", cancel: "Annulla",
    creating: "Creazione…", contactPrefix: "Per aggiungere un'altra sede,", contactAction: "contatta iNrCy",
    establishment: "Sede", retry: "Riprova",
  },
  de: {
    button: "Standorte", title: "Meine Standorte", loading: "Wird geladen…", current: "Aktuell",
    switchError: "Standortwechsel nicht möglich.", create: "Erstellen", createTitle: "Standort erstellen",
    nameLabel: "Name des Standorts", namePlaceholder: "Standort 2", confirm: "Erstellen", cancel: "Abbrechen",
    creating: "Erstellung…", contactPrefix: "Für einen weiteren Standort", contactAction: "iNrCy kontaktieren",
    establishment: "Standort", retry: "Erneut versuchen",
  },
  nl: {
    button: "Vestigingen", title: "Mijn vestigingen", loading: "Laden…", current: "Actief",
    switchError: "Kan niet van vestiging wisselen.", create: "Maken", createTitle: "Vestiging maken",
    nameLabel: "Naam van de vestiging", namePlaceholder: "Vestiging 2", confirm: "Maken", cancel: "Annuleren",
    creating: "Aanmaken…", contactPrefix: "Om een extra vestiging toe te voegen,", contactAction: "neem contact op met iNrCy",
    establishment: "Vestiging", retry: "Opnieuw proberen",
  },
  pt: {
    button: "Estabelecimentos", title: "Meus estabelecimentos", loading: "A carregar…", current: "Atual",
    switchError: "Não foi possível mudar de estabelecimento.", create: "Criar", createTitle: "Criar estabelecimento",
    nameLabel: "Nome do estabelecimento", namePlaceholder: "Estabelecimento 2", confirm: "Criar", cancel: "Cancelar",
    creating: "A criar…", contactPrefix: "Para adicionar outro estabelecimento,", contactAction: "contacte a iNrCy",
    establishment: "Estabelecimento", retry: "Tentar novamente",
  },
};

function EstablishmentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 21V7.8c0-.5.3-1 .8-1.2l6-2.7c.6-.3 1.2.2 1.2.8V21M12 9h7c.6 0 1 .4 1 1v11M2.5 21h19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 9.5h1M7 13h1M7 16.5h1M15 12.5h1.5M15 16h1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function EstablishmentMenu({
  mobile = false,
  onContact,
  onOpen,
  locale = "fr-FR",
  buttonClassName,
  panelClassName,
  beforeAccountSwitch,
}: {
  mobile?: boolean;
  onContact: () => void;
  onOpen?: () => void;
  locale?: string;
  buttonClassName?: string;
  panelClassName?: string;
  beforeAccountSwitch?: (proceed: () => Promise<void>) => void | Promise<void> | Promise<boolean>;
}) {
  const language = String(locale || "fr").slice(0, 2).toLowerCase();
  const copy = COPIES[language] || COPIES.fr;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createSlot, setCreateSlot] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<MenuPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/multicompte/accounts", { cache: "no-store", credentials: "include" });
      const json = await response.json().catch(() => null) as MenuPayload | null;
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Chargement impossible.");
      setPayload(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (mobile) return;
    void load();
  }, [load, mobile]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const accounts = payload?.accounts || [];
  const config = payload?.config || { multiAccountEnabled: false, maxEstablishments: 1 };
  const availableSlots = getAvailableEstablishmentSlots(config, accounts.length);
  const totalEstablishments = Math.max(config.maxEstablishments, accounts.length || 1);
  const activeAccount = payload ? accounts.find((account) => account.id === payload.activeUserId) : null;
  const buttonLabel = activeAccount?.displayName || copy.button;
  const buttonMeta = payload && config.multiAccountEnabled ? `${accounts.length}/${totalEstablishments}` : null;
  const buttonTitle = activeAccount
    ? `${copy.button}: ${buttonLabel}${buttonMeta ? ` (${buttonMeta})` : ""}`
    : copy.button;

  const switchAccount = async (accountId: string) => {
    if (accountId === payload?.activeUserId || switchingId) return;

    const proceed = async () => {
      setSwitchingId(accountId);
      setError(null);
      try {
        await switchActiveInrcyAccount(accountId);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : copy.switchError);
        setSwitchingId(null);
      }
    };

    if (beforeAccountSwitch) {
      await beforeAccountSwitch(proceed);
      return;
    }
    await proceed();
  };

  const startCreate = (slot: number) => {
    setCreateSlot(slot);
    setDisplayName("");
    setError(null);
  };

  const createAccount = async () => {
    const name = displayName.trim();
    if (name.length < 2 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/multicompte/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: name }),
      });
      const json = await response.json().catch(() => null) as MenuPayload | null;
      if (!response.ok || !json?.ok || !json.activeUserId) {
        throw new Error(json?.error || "Création impossible.");
      }

      purgeAllBrowserAccountCaches();
      setActiveBrowserUserId(json.activeUserId);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
      setCreating(false);
    }
  };

  const buttonClass = buttonClassName || (mobile
    ? `${styles.mobileHeaderIconBtn} ${styles.mobileHeaderEstablishmentBtn}`
    : `${styles.ghostBtn} ${styles.establishmentTopbarBtn}`);

  return (
    <div className={styles.establishmentMenuWrap} ref={rootRef}>
      <button
        type="button"
        className={buttonClass}
        aria-label={buttonTitle}
        title={buttonTitle}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          if (next) onOpen?.();
          setOpen(next);
        }}
      >
        <span className={styles.establishmentTopbarIcon} aria-hidden="true"><EstablishmentIcon /></span>
        {!mobile ? (
          <>
            <span className={styles.establishmentTopbarText}>
              <span className={styles.establishmentTopbarName}>{buttonLabel}</span>
              {buttonMeta ? <span className={styles.establishmentTopbarMeta}>{buttonMeta}</span> : null}
            </span>
            <span className={styles.establishmentTopbarChevron} aria-hidden="true">v</span>
          </>
        ) : null}
      </button>

      {open ? (
        <div className={`${styles.establishmentMenuPanel} ${mobile ? styles.establishmentMenuPanelMobile : ""} ${panelClassName || ""}`.trim()} role="dialog" aria-label={copy.title}>
          <div className={styles.establishmentMenuHeader}>
            <div>
              <strong>{copy.title}</strong>
              {payload && config.multiAccountEnabled ? (
                <small>{accounts.length} / {Math.max(config.maxEstablishments, accounts.length)}</small>
              ) : null}
            </div>
            <span className={styles.establishmentMenuHeaderIcon} aria-hidden="true"><EstablishmentIcon /></span>
          </div>

          {loading && !payload ? <div className={styles.establishmentMenuState}>{copy.loading}</div> : null}

          {!loading && error && !payload ? (
            <div className={styles.establishmentMenuState}>
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>{copy.retry}</button>
            </div>
          ) : null}

          {payload ? (
            <div className={styles.establishmentMenuList}>
              {accounts.map((account) => {
                const active = account.id === payload.activeUserId;
                const switching = switchingId === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`${styles.establishmentAccountRow} ${active ? styles.establishmentAccountRowActive : ""}`}
                    disabled={active || Boolean(switchingId)}
                    onClick={() => void switchAccount(account.id)}
                  >
                    <span className={styles.establishmentAccountMark} aria-hidden="true">{active ? "✓" : "🏢"}</span>
                    <span className={styles.establishmentAccountName}>{account.displayName}</span>
                    <small>{switching ? copy.loading : active ? copy.current : "›"}</small>
                  </button>
                );
              })}

              {Array.from({ length: availableSlots }, (_, index) => {
                const slot = accounts.length + index + 1;
                const editing = createSlot === slot;
                return (
                  <div key={slot} className={styles.establishmentCreateSlot}>
                    {editing ? (
                      <div className={styles.establishmentCreateForm}>
                        <strong>{copy.createTitle}</strong>
                        <label>
                          <span>{copy.nameLabel}</span>
                          <input
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            placeholder={`${copy.establishment} ${slot}`}
                            maxLength={120}
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void createAccount();
                            }}
                          />
                        </label>
                        <div className={styles.establishmentCreateActions}>
                          <button type="button" onClick={() => { setCreateSlot(null); setDisplayName(""); }} disabled={creating}>{copy.cancel}</button>
                          <button type="button" className={styles.establishmentCreateConfirm} onClick={() => void createAccount()} disabled={creating || displayName.trim().length < 2}>
                            {creating ? copy.creating : copy.confirm}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startCreate(slot)} className={styles.establishmentCreateButton}>
                        <span>{copy.establishment} {slot}</span>
                        <strong>＋ {copy.create}</strong>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {error && payload ? <div className={styles.establishmentMenuError}>{error}</div> : null}

          <div className={styles.establishmentContactNote}>
            <span>{copy.contactPrefix}</span>{" "}
            <button type="button" onClick={() => { setOpen(false); onContact(); }}>{copy.contactAction}</button>.
          </div>
        </div>
      ) : null}
    </div>
  );
}
