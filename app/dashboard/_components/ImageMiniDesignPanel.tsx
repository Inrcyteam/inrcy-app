import React from "react";

export type MiniDesignState = {
  enabled: boolean;
  text: string;
  color: string;
  background: string;
  position: "top" | "center" | "bottom";
  size: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type Props = {
  value: MiniDesignState;
  onChange: (patch: Partial<MiniDesignState>) => void;
};

const POSITIONS: Array<{ value: MiniDesignState["position"]; label: string }> = [
  { value: "top", label: "Haut" },
  { value: "center", label: "Centre" },
  { value: "bottom", label: "Bas" },
];

export default function ImageMiniDesignPanel({ value, onChange }: Props) {
  return (
    <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 12, opacity: 0.82 }}>Mini design</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#4cc3ff" }} />
        <span>Afficher un texte</span>
      </label>

      <input
        value={value.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Ex : Demandez votre devis"
        style={{ width: "100%", minHeight: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "inherit", padding: "0 12px" }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
          <span>Couleur texte</span>
          <input type="color" value={value.color} onChange={(e) => onChange({ color: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
          <span>Fond texte</span>
          <input type="color" value={value.background} onChange={(e) => onChange({ background: e.target.value })} style={{ width: "100%", height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }} />
        </label>
      </div>

      <div style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
        <span>Position rapide</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {POSITIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ position: option.value, x: 50, y: option.value === "top" ? 10 : option.value === "center" ? 50 : 90 })}
              style={{
                minHeight: 36,
                borderRadius: 999,
                border: value.position === option.value ? "1px solid rgba(76,195,255,0.45)" : "1px solid rgba(255,255,255,0.10)",
                boxShadow: value.position === option.value ? "0 0 0 1px rgba(76,195,255,0.18) inset" : "none",
                background: value.position === option.value ? "rgba(76,195,255,0.10)" : "rgba(255,255,255,0.03)",
                color: "inherit",
                padding: "0 12px",
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.82 }}>
        <span>Taille ({value.size}px)</span>
        <input type="range" min={18} max={72} step={2} value={value.size} onChange={(e) => onChange({ size: Number(e.target.value) || 30 })} />
      </label>

      <div style={{ fontSize: 11, opacity: 0.65 }}>Astuce : glissez le bloc texte dans l’image et utilisez la poignée en bas à droite pour le redimensionner.</div>
    </div>
  );
}
