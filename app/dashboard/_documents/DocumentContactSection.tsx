"use client";

import type { RefObject } from "react";
import styles from "./documents.module.css";
import type { ClientType, CrmContact } from "./documentEditorShared";

type ContactFieldKey =
  | "clientType"
  | "clientName"
  | "clientEmail"
  | "clientSiren"
  | "billingAddress"
  | "billingPostalCode"
  | "billingCity";

type ContactFieldErrors = Partial<Record<ContactFieldKey, string>>;

type ActionMessage = {
  type: "error" | "success";
  text: string;
};

type DocumentContactSectionProps = {
  crmContainerRef: RefObject<HTMLDivElement | null>;
  crmLoading: boolean;
  crmOpen: boolean;
  onToggleCrm: () => void;
  crmButtonText: string;
  crmQuery: string;
  onCrmQueryChange: (value: string) => void;
  filteredCrmContacts: CrmContact[];
  getContactLabel: (contact: CrmContact) => string;
  onSelectCrmContact: (contact: CrmContact) => void;
  clientType: ClientType;
  onClientTypeChange: (value: ClientType) => void;
  fieldErrors: ContactFieldErrors;
  addingToCrm: boolean;
  addToCrmDisabled: boolean;
  onAddCurrentClientToCrm: () => void;
  crmActionMessage: ActionMessage | null;
  crmError: string | null;
  clientName: string;
  onClientNameChange: (value: string) => void;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  clientSiren: string;
  onClientSirenChange: (value: string) => void;
  clientVatNumber: string;
  onClientVatNumberChange: (value: string) => void;
  billingAddress: string;
  onBillingAddressChange: (value: string) => void;
  billingPostalCode: string;
  onBillingPostalCodeChange: (value: string) => void;
  billingCity: string;
  onBillingCityChange: (value: string) => void;
  sameAddresses: boolean;
  onSameAddressesChange: (value: boolean) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (value: string) => void;
  deliveryPostalCode: string;
  onDeliveryPostalCodeChange: (value: string) => void;
  deliveryCity: string;
  onDeliveryCityChange: (value: string) => void;
  editingLocked?: boolean;
  showOptionalSirenLabel?: boolean;
};

export function DocumentContactSection({
  crmContainerRef,
  crmLoading,
  crmOpen,
  onToggleCrm,
  crmButtonText,
  crmQuery,
  onCrmQueryChange,
  filteredCrmContacts,
  getContactLabel,
  onSelectCrmContact,
  clientType,
  onClientTypeChange,
  fieldErrors,
  addingToCrm,
  addToCrmDisabled,
  onAddCurrentClientToCrm,
  crmActionMessage,
  crmError,
  clientName,
  onClientNameChange,
  clientEmail,
  onClientEmailChange,
  clientSiren,
  onClientSirenChange,
  clientVatNumber,
  onClientVatNumberChange,
  billingAddress,
  onBillingAddressChange,
  billingPostalCode,
  onBillingPostalCodeChange,
  billingCity,
  onBillingCityChange,
  sameAddresses,
  onSameAddressesChange,
  deliveryAddress,
  onDeliveryAddressChange,
  deliveryPostalCode,
  onDeliveryPostalCodeChange,
  deliveryCity,
  onDeliveryCityChange,
  editingLocked = false,
  showOptionalSirenLabel = false,
}: DocumentContactSectionProps) {
  return (
    <div className={styles.formBlock}>
      <div className={styles.formBlockHeader}>
        <div>
          <div className={styles.formBlockTitleRow}>
            <span className={styles.formBlockIcon} aria-hidden="true">
              👤
            </span>
            <div className={styles.formBlockTitle}>Infos contact</div>
          </div>
          <div className={styles.formBlockSubtitle}>
            Import CRM, coordonnées et adresse du client.
          </div>
        </div>
      </div>

      <div className={styles.crmActionBar} ref={crmContainerRef}>
        <div className={styles.crmActionMain}>
          <span className={styles.crmActionLabel}>Importer un contact</span>
          <button
            type="button"
            className={styles.crmImportButton}
            onClick={onToggleCrm}
            disabled={crmLoading || editingLocked}
            aria-haspopup="listbox"
            aria-expanded={crmOpen}
          >
            <span className={styles.crmImportButtonText} title={crmButtonText}>
              {crmButtonText}
            </span>
            <span aria-hidden="true">▾</span>
          </button>

          {crmOpen ? (
            <div
              className={styles.crmSearchPanel}
              role="dialog"
              aria-label="Importer ou rechercher un contact CRM"
            >
              <input
                className={styles.crmSearchInput}
                type="search"
                value={crmQuery}
                onChange={(event) => onCrmQueryChange(event.target.value)}
                placeholder="Rechercher un contact, email, téléphone..."
                autoFocus
              />
              <div className={styles.crmSearchResults} role="listbox">
                {filteredCrmContacts.length ? (
                  filteredCrmContacts.map((contact) => {
                    const name = getContactLabel(contact);
                    const line = contact.email
                      ? `${name} — ${contact.email}`
                      : name;
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        className={styles.crmSearchItem}
                        onClick={() => onSelectCrmContact(contact)}
                        title={line}
                      >
                        {line}
                      </button>
                    );
                  })
                ) : (
                  <div className={styles.crmSearchEmpty}>
                    Aucun contact trouvé. Remplissez le client puis utilisez “+
                    Ajouter au CRM”.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className={`${styles.field} ${styles.crmClientTypeField}`}>
          <label>
            Type de client<span className={styles.requiredMark}>*</span>
          </label>
          <select
            value={clientType}
            onChange={(event) =>
              onClientTypeChange(event.target.value as ClientType)
            }
            disabled={editingLocked}
          >
            <option value="">—</option>
            <option value="particulier">Particulier</option>
            <option value="professionnel">Professionnel</option>
            <option value="institution">Institution</option>
          </select>
          {fieldErrors.clientType ? (
            <div className={styles.fieldError}>{fieldErrors.clientType}</div>
          ) : null}
        </div>

        <div className={styles.crmAddColumn}>
          <button
            type="button"
            className={styles.crmAddButton}
            onClick={onAddCurrentClientToCrm}
            disabled={addToCrmDisabled}
          >
            {addingToCrm ? "Ajout CRM…" : "+ Ajouter au CRM"}
          </button>
          {crmActionMessage ? (
            <div
              className={`${styles.crmActionMessage} ${crmActionMessage.type === "success" ? styles.crmActionMessageSuccess : styles.crmActionMessageError}`}
            >
              {crmActionMessage.text}
            </div>
          ) : null}
        </div>

        {crmError ? (
          <div
            style={{
              gridColumn: "1 / -1",
              marginTop: -4,
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            ⚠️ {crmError}
          </div>
        ) : null}
      </div>

      <div className={styles.fourCol}>
        <div className={styles.field}>
          <label>
            Client<span className={styles.requiredMark}>*</span>
          </label>
          <input
            value={clientName}
            onChange={(event) => onClientNameChange(event.target.value)}
            placeholder="Nom du client"
            disabled={editingLocked}
          />
          {fieldErrors.clientName ? (
            <div className={styles.fieldError}>{fieldErrors.clientName}</div>
          ) : null}
        </div>

        <div className={styles.field}>
          <label>
            Email client<span className={styles.requiredMark}>*</span>
          </label>
          <input
            value={clientEmail}
            onChange={(event) => onClientEmailChange(event.target.value)}
            placeholder="email@client.fr"
            disabled={editingLocked}
          />
          {fieldErrors.clientEmail ? (
            <div className={styles.fieldError}>{fieldErrors.clientEmail}</div>
          ) : null}
        </div>

        <div className={styles.field}>
          <label>
            SIREN client
            {clientType && clientType !== "particulier" ? (
              <span className={styles.requiredMark}>*</span>
            ) : showOptionalSirenLabel ? (
              <span> (optionnel)</span>
            ) : null}
          </label>
          <input
            value={clientSiren}
            onChange={(event) => onClientSirenChange(event.target.value)}
            placeholder="Ex : 123456789"
            disabled={editingLocked}
          />
          {fieldErrors.clientSiren ? (
            <div className={styles.fieldError}>{fieldErrors.clientSiren}</div>
          ) : null}
        </div>

        <div className={styles.field}>
          <label>N° TVA client (optionnel)</label>
          <input
            value={clientVatNumber}
            onChange={(event) => onClientVatNumberChange(event.target.value)}
            placeholder="Ex : FR12345678901"
            disabled={editingLocked}
          />
        </div>
      </div>

      <div className={styles.compactThreeCol}>
        <div className={styles.field}>
          <label>
            Adresse<span className={styles.requiredMark}>*</span>
          </label>
          <input
            value={billingAddress}
            onChange={(event) => onBillingAddressChange(event.target.value)}
            placeholder="Adresse"
            disabled={editingLocked}
          />
          {fieldErrors.billingAddress ? (
            <div className={styles.fieldError}>
              {fieldErrors.billingAddress}
            </div>
          ) : null}
        </div>
        <div className={styles.field}>
          <label>
            Code postal<span className={styles.requiredMark}>*</span>
          </label>
          <input
            value={billingPostalCode}
            onChange={(event) =>
              onBillingPostalCodeChange(event.target.value)
            }
            placeholder="Ex : 62440"
            disabled={editingLocked}
          />
          {fieldErrors.billingPostalCode ? (
            <div className={styles.fieldError}>
              {fieldErrors.billingPostalCode}
            </div>
          ) : null}
        </div>
        <div className={styles.field}>
          <label>
            Ville<span className={styles.requiredMark}>*</span>
          </label>
          <input
            value={billingCity}
            onChange={(event) => onBillingCityChange(event.target.value)}
            placeholder="Ex : Harnes"
            disabled={editingLocked}
          />
          {fieldErrors.billingCity ? (
            <div className={styles.fieldError}>{fieldErrors.billingCity}</div>
          ) : null}
        </div>
      </div>

      <div className={styles.field}>
        <label
          className={styles.checkboxLabel}
          style={{ cursor: editingLocked ? "not-allowed" : "pointer" }}
        >
          <input
            className={styles.checkboxInput}
            type="checkbox"
            checked={sameAddresses}
            onChange={(event) => onSameAddressesChange(event.target.checked)}
            disabled={editingLocked}
          />
          <span>
            Adresse de livraison identique à l’adresse de facturation
          </span>
        </label>
      </div>

      {!sameAddresses ? (
        <div
          style={{
            marginTop: -2,
            marginBottom: 4,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <div className={styles.compactThreeCol}>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label>Adresse de livraison</label>
              <input
                value={deliveryAddress}
                onChange={(event) =>
                  onDeliveryAddressChange(event.target.value)
                }
                placeholder="Adresse"
                disabled={editingLocked}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label>Code postal livraison</label>
              <input
                value={deliveryPostalCode}
                onChange={(event) =>
                  onDeliveryPostalCodeChange(event.target.value)
                }
                placeholder="Ex : 62440"
                disabled={editingLocked}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label>Ville livraison</label>
              <input
                value={deliveryCity}
                onChange={(event) =>
                  onDeliveryCityChange(event.target.value)
                }
                placeholder="Ex : Harnes"
                disabled={editingLocked}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
