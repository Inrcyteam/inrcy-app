import type { RefObject } from "react";
import EmojiPickerButton from "../../_components/EmojiPickerButton";
import RichSiteContentEditor from "../../booster/publier/components/RichSiteContentEditor";
import styles from "../agent.module.css";
import { AGENT_RICH_TEXT_EDITOR_STYLE } from "../_lib/agent.config";
import {
  contactDisplayName,
  contactMetaLine,
  contactToCampaignRecipient,
  parseRecipientEmails,
} from "../_lib/agent.campaign-preview";
import type {
  CampaignMailPreview,
  CrmContactForAgent,
} from "../_lib/agent.types";

type CampaignTextDraft = { subject: string; body: string };

type CampaignMailTextModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  draft: CampaignTextDraft;
  editorRef: RefObject<HTMLDivElement | null>;
  saveState: "idle" | "saving";
  onClose: () => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onFormat: (kind: "bold" | "italic" | "underline") => void;
  onBeforeEmojiOpen: () => void;
  onEmojiSelect: (emoji: string) => void;
  onSave: () => void;
};

export function CampaignMailTextModal({
  open,
  preview,
  draft,
  editorRef,
  saveState,
  onClose,
  onSubjectChange,
  onBodyChange,
  onFormat,
  onBeforeEmojiOpen,
  onEmojiSelect,
  onSave,
}: CampaignMailTextModalProps) {
  if (!open || !preview) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.mailTextModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier le texte du mail"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Aperçu du mail</p>
        <h2>Modifier le texte</h2>
        <label className={styles.mailTextField}>
          <span>Objet</span>
          <input value={draft.subject} onChange={(event) => onSubjectChange(event.target.value)} maxLength={220} />
        </label>
        <label className={styles.mailTextField}>
          <span>Corps du mail</span>
          <div className={styles.richTextToolbar} aria-label="Mise en forme du corps du mail">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat("bold")} title="Gras">
              <strong>B</strong>
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat("italic")} title="Italique">
              <em>I</em>
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onFormat("underline")} title="Souligné">
              <span className={styles.underlineToolbarLabel}>U</span>
            </button>
            <EmojiPickerButton onBeforeOpen={onBeforeEmojiOpen} onSelect={onEmojiSelect} />
          </div>
          <RichSiteContentEditor
            value={draft.body}
            onChange={(value) => onBodyChange(value.slice(0, 6000))}
            minHeight={250}
            editorRef={editorRef}
            className={styles.richTextEditorSurface}
            style={AGENT_RICH_TEXT_EDITOR_STYLE}
          />
        </label>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose}>Annuler</button>
          <button type="button" onClick={onSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </section>
    </div>
  );
}

type RecipientDraft = { name: string; email: string; phone: string };

type RecipientsPickerModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  manualRecipientsInput: string;
  manualSelectedRecipientEmails: string[];
  crmSearch: string;
  filtersOpen: boolean;
  activeFiltersCount: number;
  category: string;
  contactType: string;
  department: string;
  importantOnly: boolean;
  filteredContacts: CrmContactForAgent[];
  filteredAllSelected: boolean;
  filteredSelectionLabel: string;
  contactsLoading: boolean;
  selectedRecipientEmails: string[];
  newRecipientOpen: boolean;
  newRecipientDraft: RecipientDraft;
  newRecipientState: "idle" | "saving";
  saveState: "idle" | "saving";
  onClose: () => void;
  onManualRecipientsChange: (value: string) => void;
  onAddManualRecipients: () => void;
  onRemoveSelectedRecipient: (email: string) => void;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onToggleFiltered: () => void;
  onToggleNewRecipient: () => void;
  onCategoryChange: (value: string) => void;
  onContactTypeChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onToggleImportantOnly: () => void;
  onNewRecipientNameChange: (value: string) => void;
  onNewRecipientEmailChange: (value: string) => void;
  onAddNewRecipient: () => void;
  onToggleRecipient: (email: string) => void;
  onSave: () => void;
};

export function RecipientsPickerModal({
  open,
  preview,
  manualRecipientsInput,
  manualSelectedRecipientEmails,
  crmSearch,
  filtersOpen,
  activeFiltersCount,
  category,
  contactType,
  department,
  importantOnly,
  filteredContacts,
  filteredAllSelected,
  filteredSelectionLabel,
  contactsLoading,
  selectedRecipientEmails,
  newRecipientOpen,
  newRecipientDraft,
  newRecipientState,
  saveState,
  onClose,
  onManualRecipientsChange,
  onAddManualRecipients,
  onRemoveSelectedRecipient,
  onSearchChange,
  onToggleFilters,
  onToggleFiltered,
  onToggleNewRecipient,
  onCategoryChange,
  onContactTypeChange,
  onDepartmentChange,
  onToggleImportantOnly,
  onNewRecipientNameChange,
  onNewRecipientEmailChange,
  onAddNewRecipient,
  onToggleRecipient,
  onSave,
}: RecipientsPickerModalProps) {
  if (!open || !preview) return null;
  const selectedCount =
    selectedRecipientEmails.length +
    parseRecipientEmails(manualRecipientsInput).filter(
      (email) => !selectedRecipientEmails.includes(email),
    ).length;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.agentListModal} ${styles.recipientsPickerModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier les destinataires"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <h2>Choisir les destinataires</h2>

        <div className={styles.manualRecipientBox}>
          <div>
            <strong>Destinataires libres</strong>
            <small>Saisissez une ou plusieurs adresses, séparées par un point-virgule.</small>
          </div>
          <div className={styles.manualRecipientRow}>
            <input
              value={manualRecipientsInput}
              onChange={(event) => onManualRecipientsChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddManualRecipients();
                }
              }}
              placeholder="email@exemple.fr; autre@exemple.fr"
            />
            <button type="button" onClick={onAddManualRecipients}>Ajouter</button>
          </div>
          {manualSelectedRecipientEmails.length > 0 && (
            <div className={styles.manualRecipientChips}>
              {manualSelectedRecipientEmails.map((email) => (
                <button key={email} type="button" onClick={() => onRemoveSelectedRecipient(email)} title="Retirer ce destinataire">
                  {email} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.agentPickerToolbar}>
          <input value={crmSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder="Rechercher un contact CRM..." />
          <button
            type="button"
            className={`${styles.agentToolbarButton} ${activeFiltersCount > 0 ? styles.agentToolbarActiveButton : ""}`}
            onClick={onToggleFilters}
          >
            Filtres{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
          </button>
          <button
            type="button"
            className={styles.agentToolbarButton}
            onClick={onToggleFiltered}
            disabled={contactsLoading || filteredContacts.length === 0}
            title={filteredAllSelected ? "Désélectionner les contacts filtrés" : "Sélectionner les contacts filtrés"}
          >
            {filteredSelectionLabel}
          </button>
          <button type="button" className={styles.agentToolbarButton} onClick={onToggleNewRecipient}>+ Contact</button>
          <span className={styles.agentToolbarCount}>
            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""}
          </span>
        </div>

        {filtersOpen && (
          <div className={styles.agentFiltersPanel}>
            <label>
              <span>Catégorie</span>
              <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
                <option value="all">Toutes</option>
                <option value="particulier">Particuliers</option>
                <option value="professionnel">Professionnels</option>
                <option value="institution">Institutions</option>
                <option value="collectivite_publique">Collectivités</option>
              </select>
            </label>
            <label>
              <span>Type</span>
              <select value={contactType} onChange={(event) => onContactTypeChange(event.target.value)}>
                <option value="all">Tous</option>
                <option value="client">Clients</option>
                <option value="prospect">Prospects</option>
                <option value="fournisseur">Fournisseurs</option>
                <option value="partenaire">Partenaires</option>
                <option value="autre">Autres</option>
              </select>
            </label>
            <label>
              <span>Département</span>
              <input value={department} onChange={(event) => onDepartmentChange(event.target.value)} placeholder="62" inputMode="text" maxLength={3} />
            </label>
            <button
              type="button"
              className={`${styles.agentImportantToggle} ${importantOnly ? styles.agentImportantToggleActive : ""}`}
              onClick={onToggleImportantOnly}
              aria-pressed={importantOnly}
            >
              <span aria-hidden>{importantOnly ? "★" : "☆"}</span> Important uniquement
            </button>
          </div>
        )}

        {newRecipientOpen && (
          <div className={styles.newRecipientBox}>
            <input value={newRecipientDraft.name} onChange={(event) => onNewRecipientNameChange(event.target.value)} placeholder="Nom / société" />
            <input value={newRecipientDraft.email} onChange={(event) => onNewRecipientEmailChange(event.target.value)} placeholder="email@exemple.fr" />
            <button type="button" onClick={onAddNewRecipient} disabled={newRecipientState === "saving"}>
              {newRecipientState === "saving" ? "Ajout..." : "Ajouter au CRM"}
            </button>
          </div>
        )}

        <div className={styles.agentListScroll}>
          {contactsLoading ? (
            <p className={styles.campaignEditHint}>Chargement des contacts CRM...</p>
          ) : filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => {
              const recipient = contactToCampaignRecipient(contact);
              if (!recipient) return null;
              const checked = selectedRecipientEmails.includes(recipient.email.toLowerCase());
              return (
                <label
                  key={contact.id}
                  className={`${styles.agentListRow} ${styles.agentSelectableRow} ${styles.agentRecipientRow} ${checked ? styles.agentSelectedRow : ""}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => onToggleRecipient(recipient.email)} />
                  <span className={styles.agentListContent}>
                    <strong className={styles.agentRecipientMain}>
                      <span>
                        {contactDisplayName(contact)}
                        {contact.important ? <span className={styles.agentImportantMark}>★</span> : null}
                      </span>
                      <em>— {recipient.email}</em>
                    </strong>
                    <small>{contactMetaLine(contact)}</small>
                  </span>
                </label>
              );
            })
          ) : (
            <p className={styles.campaignEditHint}>Aucun contact CRM avec email ne correspond à cette recherche.</p>
          )}
        </div>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} disabled={saveState === "saving"}>Annuler</button>
          <button type="button" onClick={onSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Enregistrement..." : `Valider ${selectedCount} contact${selectedCount > 1 ? "s" : ""}`}
          </button>
        </div>
      </section>
    </div>
  );
}
