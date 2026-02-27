"use client";

import { useState } from "react";
import type { LegalDocKey } from "../../../legal/_components/legalDocs";
import LegalDocumentsModal from "./LegalDocumentsModal";

type Props = {
  mode?: "page" | "drawer";
};

export default function LegalContent({ mode = "page" }: Props) {
  const [openDoc, setOpenDoc] = useState<LegalDocKey | null>(null);

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const shell: React.CSSProperties = {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(135deg, rgba(0, 200, 255, 0.10), rgba(97, 87, 255, 0.10) 45%, rgba(255, 77, 166, 0.12))",
  };

  const titleAccent: React.CSSProperties = {
    margin: 0,
    fontSize: 16,
    paddingLeft: 10,
    borderLeft: "3px solid transparent",
    borderImage: "linear-gradient(180deg, rgba(0,200,255,0.85), rgba(97,87,255,0.85), rgba(255,77,166,0.8)) 1",
  };

  const btn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  };

  const primaryBtn: React.CSSProperties = {
    ...btn,
    background:
      "linear-gradient(135deg, rgba(0, 200, 255, 0.18), rgba(97, 87, 255, 0.18), rgba(255, 77, 166, 0.14))",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...card, ...shell, padding: 18 }}>
        <h2 style={titleAccent}>Informations légales</h2>
        <p style={{ margin: "10px 0 0", opacity: 0.85, lineHeight: 1.5 }}>
          Retrouvez ici la politique de confidentialité, les mentions légales et les conditions générales d’abonnement.
        </p>
      </div>

      <div style={card}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Documents</h3>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <button type="button" onClick={() => setOpenDoc("confidentialite")} style={primaryBtn}>
            Politique de confidentialité
          </button>
          <button type="button" onClick={() => setOpenDoc("mentions-legales")} style={btn}>
            Mentions légales
          </button>
          <button type="button" onClick={() => setOpenDoc("cga")} style={btn}>
            CGA (Conditions Générales d’Abonnement)
          </button>
        </div>
        {mode === "drawer" ? null : null}
      </div>

      {openDoc ? <LegalDocumentsModal docKey={openDoc} onClose={() => setOpenDoc(null)} /> : null}
    </div>
  );
}
