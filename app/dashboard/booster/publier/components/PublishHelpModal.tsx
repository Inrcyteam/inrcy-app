import HelpModal from "../../../_components/HelpModal";

type PublishHelpModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function PublishHelpModal({ open, onClose }: PublishHelpModalProps) {
  return (
    <HelpModal
      open={open}
      title="Publication et iNr'Send"
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 12, lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>
          Après publication, retrouvez cette communication dans{" "}
          <strong>iNr'Send / Publications</strong>.
        </p>
        <p style={{ margin: 0 }}>
          Vous pourrez la consulter, la modifier ou la supprimer depuis
          l'outil.
        </p>
        <div
          style={{
            display: "grid",
            gap: 8,
            borderTop: "1px solid rgba(255,255,255,0.12)",
            paddingTop: 10,
          }}
        >
          <strong>États des canaux</strong>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <span style={{ color: "#5ee28a", fontWeight: 900 }}>Vert</span>{" "}
              : prêt / complet.
            </div>
            <div>
              <span style={{ color: "#f2c94c", fontWeight: 900 }}>Jaune</span>{" "}
              : à vérifier, publication possible.
            </div>
            <div>
              <span style={{ color: "#ff8a8a", fontWeight: 900 }}>Rouge</span>{" "}
              : canal vide, publication bloquée.
            </div>
          </div>
          <p style={{ margin: 0 }}>
            Texte seul ou image seule : autorisé. Sans texte ni image : bloqué.
          </p>
        </div>
      </div>
    </HelpModal>
  );
}
