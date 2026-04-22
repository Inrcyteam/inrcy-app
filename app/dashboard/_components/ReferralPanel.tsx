"use client";

import styles from "../dashboard.module.css";

type ReferralPanelProps = {
  referralName: string;
  referralPhone: string;
  referralEmail: string;
  referralFrom: string;
  referralSubmitting: boolean;
  referralNotice: string | null;
  referralError: string | null;
  onReferralNameChange: (value: string) => void;
  onReferralPhoneChange: (value: string) => void;
  onReferralEmailChange: (value: string) => void;
  onReferralFromChange: (value: string) => void;
  onSubmit: () => void;
};

const inputStyle = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.72)",
  colorScheme: "dark" as const,
  padding: "12px 14px",
  color: "white",
  outline: "none",
};

export default function ReferralPanel({
  referralName,
  referralPhone,
  referralEmail,
  referralFrom,
  referralSubmitting,
  referralNotice,
  referralError,
  onReferralNameChange,
  onReferralPhoneChange,
  onReferralEmailChange,
  onReferralFromChange,
  onSubmit,
}: ReferralPanelProps) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          border: "1px solid rgba(96,165,250,0.22)",
          background:
            "linear-gradient(135deg, rgba(14,25,56,0.96) 0%, rgba(33,16,66,0.92) 52%, rgba(10,21,53,0.96) 100%)",
          borderRadius: 20,
          padding: 18,
          display: "grid",
          gap: 16,
          boxShadow: "0 20px 60px rgba(2,6,23,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: -36,
            top: -36,
            width: 140,
            height: 140,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(236,72,153,0.26) 0%, rgba(236,72,153,0.04) 55%, transparent 72%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -50,
            bottom: -56,
            width: 170,
            height: 170,
            borderRadius: 999,
            background: "radial-gradient(circle, rgba(59,130,246,0.24) 0%, rgba(59,130,246,0.04) 58%, transparent 76%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                width: "fit-content",
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              🎁 Programme de parrainage iNrCy
            </div>
            <div style={{ fontSize: 26, lineHeight: 1.08, fontWeight: 800, color: "white" }}>
              Recommandez un professionnel et débloquez <span style={{ color: "#f9a8d4" }}>50 €</span> de chèque cadeau.
            </div>
            <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 14, lineHeight: 1.65 }}>
              Dès qu’un client recommandé rejoint iNrCy et reste engagé au minimum <strong>6 mois</strong>,
              nous validons votre récompense. Remplissez le formulaire ci-dessous : l’équipe contacte directement votre recommandation.
            </div>
          </div>

          <div
            style={{
              minWidth: 220,
              flex: "0 1 250px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 18,
              padding: 14,
              display: "grid",
              gap: 10,
              alignSelf: "start",
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Conditions
            </div>
            <div style={{ display: "grid", gap: 8, color: "white", fontSize: 14, lineHeight: 1.45 }}>
              <div>• 1 contact recommandé qualifié</div>
              <div>• 50 € de chèque cadeau après validation</div>
              <div>• Client engagé au minimum 6 mois</div>
              <div>• Envoi direct à l’équipe iNrCy</div>
            </div>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(8,15,32,0.48)",
            borderRadius: 18,
            padding: 16,
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div className={styles.blockTitle}>Coordonnées à transmettre</div>
            <div className={styles.blockSub}>
              Les informations seront envoyées automatiquement à <strong>parrainage@inrcy.com</strong>.
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <input
              value={referralName}
              onChange={(e) => onReferralNameChange(e.target.value)}
              placeholder="Nom Prénom ou raison sociale"
              style={inputStyle}
            />

            <input
              value={referralPhone}
              onChange={(e) => onReferralPhoneChange(e.target.value)}
              placeholder="Téléphone"
              inputMode="tel"
              style={inputStyle}
            />

            <input
              value={referralEmail}
              onChange={(e) => onReferralEmailChange(e.target.value)}
              placeholder="Mail"
              inputMode="email"
              style={inputStyle}
            />

            <input
              value={referralFrom}
              onChange={(e) => onReferralFromChange(e.target.value)}
              placeholder="Parrain / de la part de"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 1.5 }}>
              Votre recommandation est transmise à l’équipe iNrCy pour prise de contact manuelle.
            </div>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.connectBtn}`}
              onClick={onSubmit}
              disabled={referralSubmitting}
            >
              {referralSubmitting ? "Envoi..." : "Envoyer la recommandation"}
            </button>
          </div>

          {referralNotice && <div className={styles.successNote}>{referralNotice}</div>}
          {referralError && <div style={{ color: "rgba(248,113,113,0.95)", fontSize: 13 }}>{referralError}</div>}
        </div>
      </div>
    </div>
  );
}
