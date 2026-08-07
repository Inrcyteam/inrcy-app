import type { ComponentProps } from "react";
import MediaLibraryPickerModal from "../../_components/MediaLibraryPickerModal";
import styles from "../agent.module.css";
import { channelOptions } from "../_lib/agent.config";
import {
  formatAttachmentSize,
  mailAccountLabel,
  mailAccountSecondaryLabel,
  recipientDisplayName,
  recipientMetaLine,
} from "../_lib/agent.campaign-preview";
import type {
  AgentMailAccount,
  AgentPreparedAction,
  AutomationKey,
  CampaignAttachmentRef,
  CampaignMailPreview,
  CampaignRecipientPreview,
  ChannelKey,
  ScheduleListItem,
  ScheduledActionEditSession,
} from "../_lib/agent.types";

type CampaignDraftConfirmModalProps = {
  open: boolean;
  isPublishView: boolean;
  campaignMailPreview: CampaignMailPreview | null;
  selectedAutomationKey: AutomationKey;
  previewNavigationChannels: ChannelKey[];
  selectedConfigChannels: ChannelKey[];
  publishContentKind: string;
  saveState: "idle" | "saving";
  onClose: () => void;
  onSavePublish: () => void;
  onSaveCampaign: () => void;
};

export function CampaignDraftConfirmModal({
  open,
  isPublishView,
  campaignMailPreview,
  selectedAutomationKey,
  previewNavigationChannels,
  selectedConfigChannels,
  publishContentKind,
  saveState,
  onClose,
  onSavePublish,
  onSaveCampaign,
}: CampaignDraftConfirmModalProps) {
  if (!open || (!campaignMailPreview && !isPublishView)) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onClick={() => saveState !== "saving" && onClose()}
    >
      <section
        className={`${styles.settingsModal} ${styles.campaignDraftModal}`}
        role="dialog"
        aria-modal="true"
        aria-label={isPublishView ? "Enregistrer la publication en brouillon" : "Enregistrer la campagne en brouillon"}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer" disabled={saveState === "saving"}>
          ×
        </button>
        <p className={styles.modalEyebrow}>Brouillon iNrSend</p>
        <h2>{isPublishView ? "Enregistrer cette publication ?" : "Enregistrer cette campagne ?"}</h2>
        <div className={styles.campaignDraftNotice}>
          <span aria-hidden>💾</span>
          <div>
            <strong>
              {isPublishView
                ? "La publication va être enregistrée en brouillon dans iNrSend."
                : "La campagne va être enregistrée en brouillon dans iNrSend."}
            </strong>
            <p>
              {isPublishView
                ? "Vous pourrez la retrouver plus tard dans iNrSend, puis la réouvrir dans Publier pour la modifier ou la publier. Elle ne sera pas publiée maintenant."
                : `Vous pourrez la retrouver plus tard, puis la rééditer directement dans${selectedAutomationKey === "loyalty" ? " Fidéliser" : " Propulser"}. Elle ne sera pas envoyée maintenant.`}
            </p>
          </div>
        </div>
        <div className={styles.campaignDraftSummary}>
          {isPublishView ? (
            <>
              <small>Canaux</small>
              <strong>
                {(previewNavigationChannels.length ? previewNavigationChannels : selectedConfigChannels)
                  .map((channel) => channelOptions[channel]?.name || channel)
                  .join(" / ") || "—"}
              </strong>
              <small>Contenu</small>
              <strong>{publishContentKind || "Publication"}</strong>
            </>
          ) : (
            <>
              <small>Objet</small>
              <strong>{campaignMailPreview?.subject || "—"}</strong>
              <small>Destinataires prévus</small>
              <strong>
                {campaignMailPreview?.recipientsCount || 0} contact
                {(campaignMailPreview?.recipientsCount || 0) > 1 ? "s" : ""}
              </strong>
            </>
          )}
        </div>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} disabled={saveState === "saving"}>
            Annuler
          </button>
          <button
            type="button"
            onClick={isPublishView ? onSavePublish : onSaveCampaign}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Enregistrement..." : "Enregistrer en brouillon"}
          </button>
        </div>
      </section>
    </div>
  );
}

type PublishEditChoiceModalProps = {
  open: boolean;
  isPublishView: boolean;
  hasPreparedAction: boolean;
  mediaName?: string;
  onClose: () => void;
  onOpenText: () => void;
  onOpenMedia: () => void;
};

export function PublishEditChoiceModal({
  open,
  isPublishView,
  hasPreparedAction,
  mediaName,
  onClose,
  onOpenText,
  onOpenMedia,
}: PublishEditChoiceModalProps) {
  if (!open || !isPublishView || !hasPreparedAction) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.campaignEditModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier la publication"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Publication iNr’Agent</p>
        <h2>Modifier la publication</h2>
        <div className={styles.campaignEditGrid}>
          <button type="button" onClick={onOpenText}>
            <strong>Contenu</strong>
            <small>Modifier le titre, le texte, le CTA et les hashtags.</small>
          </button>
          <button type="button" onClick={onOpenMedia}>
            <strong>Média</strong>
            <small>{mediaName ? `Média actuel : ${mediaName}` : "Ajouter, remplacer ou adapter l’image / la vidéo."}</small>
          </button>
        </div>
      </section>
    </div>
  );
}

type CampaignEditChoiceModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  attachmentCount: number;
  onClose: () => void;
  onOpenText: () => void;
  onOpenAttachments: () => void;
  onOpenRecipients: () => void;
  onOpenMailAccount: () => void;
};

export function CampaignEditChoiceModal({
  open,
  preview,
  attachmentCount,
  onClose,
  onOpenText,
  onOpenAttachments,
  onOpenRecipients,
  onOpenMailAccount,
}: CampaignEditChoiceModalProps) {
  if (!open || !preview) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.campaignEditModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier la campagne"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Campagne iNr’Agent</p>
        <h2>Modifier la campagne</h2>
        <div className={styles.campaignEditGrid}>
          <button type="button" onClick={onOpenText}>
            <strong>Texte du mail</strong>
            <small>Modifier l’objet et le corps du message.</small>
          </button>
          <button type="button" onClick={onOpenAttachments}>
            <strong>Pièce jointe</strong>
            <small>{attachmentCount > 0 ? `${attachmentCount} fichier${attachmentCount > 1 ? "s" : ""}` : "Ajouter ou remplacer un fichier."}</small>
          </button>
          <button type="button" onClick={onOpenRecipients}>
            <strong>Destinataires CRM</strong>
            <small>
              {preview.recipientsCount} contact{preview.recipientsCount > 1 ? "s" : ""} prévu
              {preview.recipientsCount > 1 ? "s" : ""}. Voir la liste.
            </small>
          </button>
          <button type="button" onClick={onOpenMailAccount}>
            <strong>Boîte d’envoi</strong>
            <small>{preview.mailAccountLabel}</small>
          </button>
        </div>
      </section>
    </div>
  );
}

type RecipientsPreviewModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  recipients: CampaignRecipientPreview[];
  onClose: () => void;
  onEdit: () => void;
};

export function RecipientsPreviewModal({ open, preview, recipients, onClose, onEdit }: RecipientsPreviewModalProps) {
  if (!open || !preview) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.agentListModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Destinataires prévus"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Destinataires</p>
        <h2>
          {recipients.length} contact{recipients.length > 1 ? "s" : ""} prévu{recipients.length > 1 ? "s" : ""}
        </h2>
        <div className={styles.agentListScroll}>
          {recipients.length > 0 ? (
            recipients.map((recipient) => (
              <article key={recipient.email} className={`${styles.agentListRow} ${styles.agentRecipientRow}`}>
                <span className={styles.agentListContent}>
                  <strong className={styles.agentRecipientMain}>
                    <span>{recipientDisplayName(recipient)}</span>
                    <em>— {recipient.email}</em>
                  </strong>
                  <small>{recipientMetaLine(recipient)}</small>
                </span>
              </article>
            ))
          ) : (
            <p className={styles.campaignEditHint}>Aucun destinataire n’est prévu pour cette campagne.</p>
          )}
        </div>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose}>Fermer</button>
          <button type="button" onClick={onEdit}>Modifier les destinataires</button>
        </div>
      </section>
    </div>
  );
}

type MailAccountEditModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  accounts: AgentMailAccount[];
  loading: boolean;
  selectedAccountId: string;
  saveState: "idle" | "saving";
  onSelect: (accountId: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function MailAccountEditModal({
  open,
  preview,
  accounts,
  loading,
  selectedAccountId,
  saveState,
  onSelect,
  onClose,
  onSave,
}: MailAccountEditModalProps) {
  if (!open || !preview) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.agentListModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Modifier la boîte d’envoi"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Boîte d’envoi</p>
        <h2>Choisir la boîte mail</h2>
        <div className={styles.agentListScroll}>
          {loading ? (
            <p className={styles.campaignEditHint}>Chargement des boîtes connectées...</p>
          ) : accounts.length > 0 ? (
            accounts.map((account) => {
              const usable = account.status === "connected" && account.connection_status !== "needs_update" && !account.requires_update;
              return (
                <label key={account.id} className={`${styles.agentListRow} ${styles.agentSelectableRow} ${!usable ? styles.agentDisabledRow : ""}`}>
                  <input
                    type="radio"
                    name="agent-mail-account"
                    checked={selectedAccountId === account.id}
                    disabled={!usable}
                    onChange={() => onSelect(account.id)}
                  />
                  <span className={styles.agentListAvatar} aria-hidden>✉</span>
                  <span className={styles.agentListContent}>
                    <strong>{mailAccountLabel(account)}</strong>
                    <small>{mailAccountSecondaryLabel(account)}{usable ? " · connectée" : " · à reconnecter"}</small>
                  </span>
                  <span className={styles.agentListTag}>{usable ? "OK" : "À corriger"}</span>
                </label>
              );
            })
          ) : (
            <p className={styles.campaignEditHint}>Aucune boîte mail connectée. Connecte une boîte dans iNrSend avant validation.</p>
          )}
        </div>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} disabled={saveState === "saving"}>Annuler</button>
          <button type="button" onClick={onSave} disabled={saveState === "saving" || !selectedAccountId}>
            {saveState === "saving" ? "Enregistrement..." : "Utiliser cette boîte"}
          </button>
        </div>
      </section>
    </div>
  );
}

type AttachmentModalProps = {
  open: boolean;
  preview: CampaignMailPreview | null;
  attachments: CampaignAttachmentRef[];
  uploadState: "idle" | "saving";
  libraryPickerOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onOpenLibrary: () => void;
  onCloseLibrary: () => void;
  onConfirmLibrary: ComponentProps<typeof MediaLibraryPickerModal>["onConfirm"];
  maxAttachmentBytes: number;
  onOpenOptimizer: ComponentProps<typeof MediaLibraryPickerModal>["onOpenOptimizer"];
  onOversizedMedia: ComponentProps<typeof MediaLibraryPickerModal>["onOversizedMedia"];
  onRemove: (path: string) => void;
};

export function AttachmentModal({
  open,
  preview,
  attachments,
  uploadState,
  libraryPickerOpen,
  onClose,
  onFilesSelected,
  onOpenLibrary,
  onCloseLibrary,
  onConfirmLibrary,
  maxAttachmentBytes,
  onOpenOptimizer,
  onOversizedMedia,
  onRemove,
}: AttachmentModalProps) {
  if (!open || !preview) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.attachmentModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Pièce jointe"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Pièce jointe</p>
        <h2>{attachments.length > 0 ? "Pièces jointes" : "Ajouter une pièce jointe"}</h2>
        <div className={styles.attachmentUploadBox}>
          <input
            id="agent-campaign-attachment"
            type="file"
            multiple
            onChange={(event) => {
              onFilesSelected(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
            disabled={uploadState === "saving"}
          />
          <div className={styles.campaignAttachmentActionButtons}>
            <label htmlFor="agent-campaign-attachment">
              <span aria-hidden>📎</span>
              {uploadState === "saving" ? "Préparation..." : "Joindre"}
            </label>
            <button type="button" onClick={onOpenLibrary} disabled={uploadState === "saving"}>
              <span aria-hidden>🖼️</span>
              Médiathèque
            </button>
          </div>
          <small>20 Mo maximum par fichier. Les médias plus lourds peuvent être compressés par iNrCy.</small>
        </div>

        <MediaLibraryPickerModal
          open={libraryPickerOpen}
          title="Joindre depuis la Médiathèque"
          subtitle="Ajoutez un média déjà stocké dans iNrCy · 20 Mo max par fichier."
          accept="all"
          multiple
          maxSelection={10}
          maxImageBytes={maxAttachmentBytes}
          maxVideoBytes={maxAttachmentBytes}
          confirmLabel="Joindre"
          selectedHint="Choisissez les médias à joindre à la campagne."
          onOpenOptimizer={onOpenOptimizer}
          onOversizedMedia={onOversizedMedia}
          onClose={onCloseLibrary}
          onConfirm={onConfirmLibrary}
        />
        {attachments.length > 0 ? (
          <div className={styles.attachmentList}>
            {attachments.map((attachment) => (
              <div key={`${attachment.bucket}-${attachment.path}`} className={styles.attachmentListRow}>
                <span aria-hidden>📄</span>
                <strong>{attachment.name}</strong>
                <small>
                  {attachment.type || "Document"}
                  {attachment.size ? ` · ${formatAttachmentSize(attachment.size)}` : ""}
                </small>
                <button type="button" onClick={() => onRemove(attachment.path)} disabled={uploadState === "saving"}>
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.campaignEditHint}>Aucune pièce jointe n’est prévue pour cette campagne.</p>
        )}
      </section>
    </div>
  );
}

function ScheduleChannelCell({ labels }: { labels: string[] }) {
  const cleanedLabels = labels.filter(Boolean);
  const primaryLabel = cleanedLabels[0] || "—";
  const extraLabels = cleanedLabels.slice(1);
  if (extraLabels.length === 0) return <span className={styles.scheduleChannelSingle}>{primaryLabel}</span>;
  return (
    <details className={styles.scheduleChannelDetails}>
      <summary className={styles.scheduleChannelSummary}>
        <span>{primaryLabel}</span>
        <span className={styles.scheduleChannelChevron} aria-hidden="true">▾</span>
      </summary>
      <div className={styles.scheduleChannelMenu}>
        {cleanedLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </details>
  );
}

type AgentScheduleModalProps = {
  open: boolean;
  items: ScheduleListItem[];
  mutationState: "idle" | "saving";
  onClose: () => void;
  onModify: (item: ScheduleListItem) => void;
  onDelete: (item: ScheduleListItem) => void;
};

export function AgentScheduleModal({ open, items, mutationState, onClose, onModify, onDelete }: AgentScheduleModalProps) {
  if (!open) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <section
        className={`${styles.settingsModal} ${styles.scheduleModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Actions programmées"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.scheduleModalHeader}>
          <div className={styles.scheduleModalTitle}>
            <p className={styles.modalEyebrow}>Programmation</p>
            <h2>Actions programmées</h2>
          </div>
          <div className={styles.scheduleModalHeaderActions}>
            <div className={styles.scheduleSummaryPill} aria-label={`${items.length} actions à venir`}>
              <strong>{items.length}</strong>
              <span>actions à venir</span>
            </div>
            <button type="button" className={styles.scheduleCloseButton} onClick={onClose}>Fermer</button>
          </div>
        </div>

        <section className={styles.scheduleSection}>
          <div className={styles.scheduleSectionHeader}>
            <strong>Actions à venir</strong>
            <span>Ordre chronologique</span>
          </div>
          {items.length > 0 ? (
            <div className={styles.scheduleTable} role="table" aria-label="Actions programmées à venir">
              <div className={styles.scheduleTableHeader} role="row">
                <span>Date</span><span>Heure</span><span>Action</span><span>Type</span><span>Canal</span><span>Origine</span><span>Actions</span>
              </div>
              {items.map((item) => (
                <div key={item.id} className={styles.scheduleTableRow} data-status={item.statusKey} role="row">
                  <span>{item.date}</span>
                  <span>{item.time}</span>
                  <span className={styles.scheduleActionCell} title={item.action}>{item.action}</span>
                  <span>{item.typeLabel}</span>
                  <span className={styles.scheduleChannelCell}><ScheduleChannelCell labels={item.channelLabels} /></span>
                  <span>{item.originLabel}</span>
                  <span className={styles.scheduleActionsCell}>
                    <button
                      type="button"
                      className={styles.scheduleIconButton}
                      onClick={() => onModify(item)}
                      disabled={!item.editable || mutationState === "saving"}
                      aria-label={item.source === "automatic" ? "Modifier la programmation" : item.typeLabel === "Statistiques" ? "Modifier la programmation" : "Modifier le contenu"}
                      title={item.source === "automatic" ? "Modifier la programmation" : item.typeLabel === "Statistiques" ? "Modifier la programmation" : "Modifier le contenu"}
                    >
                      {item.source === "automatic" || item.typeLabel === "Statistiques" ? "🕘" : "✎"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.scheduleIconButton} ${styles.scheduleIconDanger}`}
                      onClick={() => onDelete(item)}
                      disabled={!item.removable || mutationState === "saving"}
                      aria-label="Supprimer"
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.scheduleEmpty}>Aucune action programmée à venir.</p>
          )}
        </section>
      </section>
    </div>
  );
}

type ValidationChoiceModalProps = {
  open: boolean;
  selectedPreparedAction: AgentPreparedAction | null;
  scheduledEditSession: ScheduledActionEditSession | null;
  mutationState: "idle" | "saving";
  onClose: () => void;
  onRunNow: () => void;
  onSchedule: () => void;
};

export function ValidationChoiceModal({
  open,
  selectedPreparedAction,
  scheduledEditSession,
  mutationState,
  onClose,
  onRunNow,
  onSchedule,
}: ValidationChoiceModalProps) {
  if (!open || !selectedPreparedAction) return null;
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={() => mutationState !== "saving" && onClose()}>
      <section
        className={`${styles.settingsModal} ${styles.validationChoiceModal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Valider l’action iNr’Agent"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose} disabled={mutationState === "saving"} aria-label="Fermer">×</button>
        <p className={styles.modalEyebrow}>Validation</p>
        <h2>
          {scheduledEditSession
            ? "Que faire de cette action programmée ?"
            : selectedPreparedAction.automationKey === "publish"
              ? "Publier cette action ?"
              : "Envoyer cette campagne ?"}
        </h2>
        <p className={styles.modalHint}>
          {scheduledEditSession
            ? "Vous pouvez lancer maintenant ce contenu programmé ou enregistrer sa programmation avec les informations actuelles."
            : "L’action est prête. Vous pouvez la lancer maintenant ou la programmer pour qu’iNr’Agent s’en occupe plus tard."}
        </p>
        <div className={styles.validationChoiceGrid}>
          <button type="button" className={styles.validationChoiceCard} onClick={onRunNow} disabled={mutationState === "saving"}>
            <span aria-hidden>⚡</span>
            <strong>
              {scheduledEditSession
                ? "Lancer maintenant"
                : selectedPreparedAction.automationKey === "publish"
                  ? "Publier maintenant"
                  : "Envoyer maintenant"}
            </strong>
            <small>
              {scheduledEditSession
                ? "iNr’Agent exécute l’action immédiatement et retire la programmation future."
                : "iNr’Agent exécute l’action immédiatement."}
            </small>
          </button>
          <button type="button" className={styles.validationChoiceCard} onClick={onSchedule} disabled={mutationState === "saving"}>
            <span aria-hidden>🕒</span>
            <strong>
              {scheduledEditSession
                ? "Programmer"
                : selectedPreparedAction.automationKey === "publish"
                  ? "Programmer la publication"
                  : "Programmer l’envoi"}
            </strong>
            <small>Les informations actuelles sont préremplies.</small>
          </button>
        </div>
      </section>
    </div>
  );
}
