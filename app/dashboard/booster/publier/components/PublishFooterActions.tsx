import type { MutableRefObject } from "react";
import HelpButton from "../../../_components/HelpButton";
import StatusMessage from "../../../_components/StatusMessage";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishFooterActionsProps = {
  styles: PublishModalStyles;
  publishAreaRef: MutableRefObject<HTMLDivElement | null>;
  saving: boolean;
  draftSaving: boolean;
  publishProgress: number;
  publishProgressLabel: string;
  draftMessage: string;
  publishError: string;
  onOpenHelp: () => void;
  onSavePublicationDraft: () => void;
  onPublish: () => void;
};

export default function PublishFooterActions({
  styles,
  publishAreaRef,
  saving,
  draftSaving,
  publishProgress,
  publishProgressLabel,
  draftMessage,
  publishError,
  onOpenHelp,
  onSavePublicationDraft,
  onPublish,
}: PublishFooterActionsProps) {
  return (
    <div
      ref={publishAreaRef}
      style={{
        display: "grid",
        gap: 8,
        justifyItems: "end",
        scrollMarginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <HelpButton
          onClick={onOpenHelp}
          title="Aide publication et iNr'Send"
          size={32}
        />
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onSavePublicationDraft}
          disabled={saving || draftSaving}
          title="Enregistrer le brouillon publication"
          aria-label="Enregistrer le brouillon publication"
          style={{
            width: 52,
            minHeight: 52,
            padding: 0,
            display: "inline-grid",
            placeItems: "center",
            fontSize: 22,
            opacity: saving || draftSaving ? 0.64 : 1,
            cursor: saving || draftSaving ? "wait" : "pointer",
          }}
        >
          {draftSaving ? "…" : "💾"}
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onPublish}
          disabled={saving || draftSaving}
          style={{
            minHeight: 52,
            padding: "0 24px",
            fontSize: 16,
            fontWeight: 800,
            opacity: saving || draftSaving ? 0.64 : 1,
            cursor: saving || draftSaving ? "wait" : "pointer",
          }}
        >
          {saving
            ? `Publication en cours ${publishProgress}%`
            : "Vérifier et publier"}
        </button>
      </div>
      <div
        style={{
          width: "min(440px, 100%)",
          minHeight: saving || publishError || draftMessage ? 58 : 0,
          display: "grid",
          gap: 8,
          justifyItems: "stretch",
        }}
      >
        {saving ? (
          <div
            style={{
              justifySelf: "end",
              width: "100%",
              maxWidth: 440,
              borderRadius: 14,
              padding: "10px 12px",
              border: "1px solid rgba(76,195,255,0.22)",
              background: "rgba(76,195,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 12,
                color: "rgba(255,255,255,0.86)",
              }}
            >
              <span>{publishProgressLabel || "Publication en cours..."}</span>
              <strong>{publishProgress}%</strong>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 8,
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${publishProgress}%`,
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))",
                  transition: "width 180ms ease",
                }}
              />
            </div>
          </div>
        ) : null}
        {draftMessage ? (
          <StatusMessage
            variant="success"
            style={{
              marginTop: 0,
              textAlign: "right",
              maxWidth: 440,
              justifySelf: "end",
            }}
          >
            {draftMessage}
          </StatusMessage>
        ) : null}
        {publishError ? (
          <StatusMessage
            variant="error"
            style={{
              marginTop: 0,
              textAlign: "right",
              maxWidth: 440,
              justifySelf: "end",
            }}
          >
            {publishError}
          </StatusMessage>
        ) : null}
      </div>
    </div>
  );
}
