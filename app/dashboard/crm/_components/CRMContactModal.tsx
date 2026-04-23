import type { Dispatch, SetStateAction } from "react";
import styles from "../crm.module.css";
import type { Category, ContactType, CrmDraft } from "../crm.types";

type Props = {
  open: boolean;
  error: string | null;
  isResponsive: boolean;
  editingId: string | null;
  draft: CrmDraft;
  setDraft: Dispatch<SetStateAction<CrmDraft>>;
  saving: boolean;
  deliverySameAsPrimary: boolean;
  setDeliverySameAsPrimary: (checked: boolean) => void;
  updatePrimaryAddress: (value: string) => void;
  onToggleImportant: () => void;
  onClose: () => void;
  onSave: () => void;
};

export default function CRMContactModal({
  open,
  error,
  isResponsive,
  editingId,
  draft,
  setDraft,
  saving,
  deliverySameAsPrimary,
  setDeliverySameAsPrimary,
  updatePrimaryAddress,
  onToggleImportant,
  onClose,
  onSave,
}: Props) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div className={styles.modalTitle}>{editingId ? "Modifier un contact" : "Ajouter un contact"}</div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

        {isResponsive ? (
          <div className={styles.mobileModalForm}>
            <label className={`${styles.label} ${styles.mfName} ${styles.fName}`}>
              <span>Nom Prénom / Raison sociale</span>
              <input
                className={styles.input}
                value={draft.display_name}
                onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
                placeholder="Dupont Marie / SAS Exemple"
                autoComplete="name"
              />
            </label>

            <label className={`${styles.label} ${styles.mfPhone} ${styles.fPhone}`}>
              <span>Téléphone</span>
              <input
                className={styles.input}
                value={draft.phone}
                onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
                placeholder="06 00 00 00 00"
                autoComplete="tel"
              />
            </label>

            <label className={`${styles.label} ${styles.mfMail} ${styles.fMail}`}>
              <span>Mail</span>
              <input
                className={styles.input}
                value={draft.email}
                onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
                placeholder="marie@exemple.fr"
                autoComplete="email"
              />
            </label>

            <label className={`${styles.label} ${styles.mfCategory} ${styles.fCategory}`}>
              <span>Catégorie</span>
              <select className={styles.select} value={draft.category} onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}>
                <option value="">—</option>
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
                <option value="collectivite_publique">Institution</option>
              </select>
            </label>

            <label className={`${styles.label} ${styles.mfType} ${styles.fType}`}>
              <span>Type</span>
              <select className={styles.select} value={draft.contact_type} onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}>
                <option value="">—</option>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
                <option value="fournisseur">Fournisseur</option>
                <option value="partenaire">Partenaire</option>
                <option value="autre">Autre</option>
              </select>
            </label>

            <label className={`${styles.label} ${styles.mfSiren} ${styles.fSiren}`}>
              <span>SIREN</span>
              <input
                className={styles.input}
                value={draft.siret}
                onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))}
                placeholder="123 456 789"
                inputMode="numeric"
              />
            </label>

            <label className={`${styles.label} ${styles.mfVat} ${styles.fVat}`}>
              <span>TVA intracom</span>
              <input
                className={styles.input}
                value={draft.vat_number}
                onChange={(e) => setDraft((s) => ({ ...s, vat_number: e.target.value }))}
                placeholder="FR12345678901"
              />
            </label>

            <label className={`${styles.label} ${styles.mfImportant} ${styles.fImportant}`}>
              <span>Important</span>
              <button
                type="button"
                className={styles.starToggle}
                onClick={onToggleImportant}
                aria-pressed={draft.important ? "true" : "false"}
                title={draft.important ? "Contact important" : "Marquer comme important"}
              >
                {draft.important ? "★" : "☆"}
              </button>
            </label>

            <label className={`${styles.label} ${styles.mfAddress} ${styles.fAddress}`}>
              <span>Adresse principale</span>
              <input
                className={styles.input}
                value={draft.address}
                onChange={(e) => updatePrimaryAddress(e.target.value)}
                placeholder="12 rue ..."
                autoComplete="street-address"
              />
            </label>

            <label className={`${styles.label} ${styles.mfCity} ${styles.fCity}`}>
              <span>Ville</span>
              <input
                className={styles.input}
                value={draft.city}
                onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
                placeholder="Paris"
                autoComplete="address-level2"
              />
            </label>

            <label className={`${styles.label} ${styles.mfCP} ${styles.fCP}`}>
              <span>CP</span>
              <input
                className={styles.input}
                value={draft.postal_code}
                onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))}
                placeholder="75000"
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>

            <label className={`${styles.label} ${styles.mfDeliverySame}`}>
              <span className={styles.sameAddressLabel}>Adresse de livraison identique</span>
              <label className={styles.sameAddressCheck}>
                <input type="checkbox" checked={deliverySameAsPrimary} onChange={(e) => setDeliverySameAsPrimary(e.target.checked)} />
                <span>Utiliser l'adresse principale</span>
              </label>
            </label>

            <label className={`${styles.label} ${styles.mfNotes} ${styles.fNotes}`}>
              <span>Notes</span>
              <textarea
                className={styles.textarea}
                value={draft.notes}
                onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Notes internes"
              />
            </label>
          </div>
        ) : (
          <div className={`${styles.formGrid} ${styles.modalFormGrid} ${styles.desktopModalGrid}`}>
            <label className={`${styles.label} ${styles.col6} ${styles.fName}`}>
              <span>Nom Prénom / Raison sociale</span>
              <input
                className={styles.input}
                value={draft.display_name}
                onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
                placeholder="Dupont Marie / SAS Exemple"
                autoComplete="name"
              />
            </label>

            <label className={`${styles.label} ${styles.col3} ${styles.fPhone}`}>
              <span>Téléphone</span>
              <input
                className={styles.input}
                value={draft.phone}
                onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
                placeholder="06 00 00 00 00"
                autoComplete="tel"
              />
            </label>

            <label className={`${styles.label} ${styles.col3} ${styles.fMail}`}>
              <span>Mail</span>
              <input
                className={styles.input}
                value={draft.email}
                onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
                placeholder="marie@exemple.fr"
                autoComplete="email"
              />
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fCategory}`}>
              <span>Catégorie</span>
              <select className={styles.select} value={draft.category} onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}>
                <option value="">—</option>
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
                <option value="collectivite_publique">Institution</option>
              </select>
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fType}`}>
              <span>Type</span>
              <select className={styles.select} value={draft.contact_type} onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}>
                <option value="">—</option>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
                <option value="fournisseur">Fournisseur</option>
                <option value="partenaire">Partenaire</option>
                <option value="autre">Autre</option>
              </select>
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fSiren}`}>
              <span>SIREN</span>
              <input className={styles.input} value={draft.siret} onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))} placeholder="123 456 789" inputMode="numeric" />
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fVat}`}>
              <span>TVA</span>
              <input className={styles.input} value={draft.vat_number} onChange={(e) => setDraft((s) => ({ ...s, vat_number: e.target.value }))} placeholder="FR12345678901" />
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.modalImportantField} ${styles.fImportant}`}>
              <span>Important</span>
              <button
                type="button"
                className={styles.starToggle}
                onClick={onToggleImportant}
                aria-pressed={draft.important ? "true" : "false"}
                title={draft.important ? "Contact important" : "Marquer comme important"}
              >
                {draft.important ? "★" : "☆"}
              </button>
            </label>

            <label className={`${styles.label} ${styles.col5} ${styles.fAddress}`}>
              <span>Adresse principale</span>
              <input className={styles.input} value={draft.address} onChange={(e) => updatePrimaryAddress(e.target.value)} placeholder="12 rue ..." autoComplete="street-address" />
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fCity}`}>
              <span>Ville</span>
              <input className={styles.input} value={draft.city} onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))} placeholder="Paris" autoComplete="address-level2" />
            </label>

            <label className={`${styles.label} ${styles.col2} ${styles.fCP}`}>
              <span>CP</span>
              <input className={styles.input} value={draft.postal_code} onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))} placeholder="75000" inputMode="numeric" autoComplete="postal-code" />
            </label>

            <label className={`${styles.label} ${styles.col3} ${styles.sameAddressField}`}>
              <span>Adresse de livraison</span>
              <label className={styles.sameAddressCheck}>
                <input type="checkbox" checked={deliverySameAsPrimary} onChange={(e) => setDeliverySameAsPrimary(e.target.checked)} />
                <span>Identique</span>
              </label>
            </label>

            <label className={`${styles.label} ${styles.col12} ${styles.fNotes}`}>
              <span>Notes</span>
              <textarea className={styles.textarea} value={draft.notes} onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))} placeholder="Notes internes" />
            </label>
          </div>
        )}

        <div className={styles.modalFooter}>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onSave} disabled={saving}>
            {editingId ? "Mettre à jour" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
