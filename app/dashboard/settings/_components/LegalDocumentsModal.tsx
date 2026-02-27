"use client";

import BaseModal from "../../booster/components/BaseModal";
import { legalDocs, type LegalDocKey } from "../../../legal/_components/legalDocs";
import legalStyles from "../../../legal/legal.module.css";

export default function LegalDocumentsModal({
  docKey,
  onClose,
}: {
  docKey: LegalDocKey;
  onClose: () => void;
}) {
  const doc = legalDocs[docKey];
  const Content = doc.Content;

  return (
    <BaseModal title={doc.title} moduleLabel="" onClose={onClose}>
      <div style={{ width: "100%", maxWidth: 980, margin: "0 auto" }}>
        <div className={legalStyles.card} style={{ marginTop: 0 }}>
          {doc.subtitle ? <p className={legalStyles.subtitle} style={{ marginTop: 0 }}>{doc.subtitle}</p> : null}
          <div style={{ marginTop: 14 }}>
            <Content />
          </div>
          <p className={legalStyles.small} style={{ marginTop: 18 }}>
            Dernière mise à jour : 11/02/2026
          </p>
        </div>
      </div>
    </BaseModal>
  );
}
