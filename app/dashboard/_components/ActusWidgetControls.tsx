"use client";

import type { CSSProperties } from "react";
import type { ActusDesign, ActusLayout, ActusTheme } from "../dashboard.types";
import { ACTUS_DESIGN_OPTIONS, ACTUS_THEME_OPTIONS, normalizeActusAccent } from "../dashboard.types";

type Props = {
  layout: ActusLayout;
  setLayout: (value: ActusLayout) => void;
  limit: number;
  setLimit: (value: number) => void;
  design: ActusDesign;
  setDesign: (value: ActusDesign) => void;
  theme: ActusTheme;
  setTheme: (value: ActusTheme) => void;
  accent: string;
  setAccent: (value: string) => void;
};

const fieldStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(15,23,42,0.65)",
  colorScheme: "dark",
  padding: "10px 12px",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  minWidth: 0,
};

const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelTextStyle: CSSProperties = { color: "rgba(255,255,255,0.72)", fontSize: 12 };

export default function ActusWidgetControls({
  layout,
  setLayout,
  limit,
  setLimit,
  design,
  setDesign,
  theme,
  setTheme,
  accent,
  setAccent,
}: Props) {
  const pickerValue = normalizeActusAccent(accent) || "#6BD05F";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 10 }}>
      <label style={labelStyle}>
        <span style={labelTextStyle}><strong>Affichage</strong></span>
        <select value={layout} onChange={(event) => setLayout(event.target.value as ActusLayout)} style={fieldStyle}>
          <option value="list">Liste</option>
          <option value="carousel">Carrousel</option>
          <option value="grid">Grille</option>
          <option value="compact">Compact</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}><strong>Nombre d&apos;actus</strong></span>
        <select value={String(limit)} onChange={(event) => setLimit(Math.min(10, Math.max(3, Number(event.target.value) || 5)))} style={fieldStyle}>
          {[3, 5, 10].map((value) => <option key={value} value={value}>{value} derni&egrave;res actus</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}><strong>Design</strong></span>
        <select value={design} onChange={(event) => setDesign(event.target.value as ActusDesign)} style={fieldStyle}>
          {ACTUS_DESIGN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}><strong>Couleurs</strong></span>
        <select value={theme} onChange={(event) => setTheme(event.target.value as ActusTheme)} style={fieldStyle}>
          {ACTUS_THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {theme === "custom" ? <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
        <span style={labelTextStyle}><strong>Couleur de l&apos;iFrame</strong></span>
        <div style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 8, minWidth: 0 }}>
          <input
            type="color"
            value={pickerValue}
            onChange={(event) => setAccent(event.target.value.toUpperCase())}
            aria-label="Choisir la couleur de l'iFrame"
            style={{ width: 52, height: 42, padding: 3, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(15,23,42,0.65)", cursor: "pointer" }}
          />
          <input
            type="text"
            value={accent}
            onChange={(event) => setAccent(event.target.value.toUpperCase())}
            placeholder={"Choisissez une couleur — ex. #D97706"}
            inputMode="text"
            aria-label={"Code hexad\u00e9cimal de la couleur de l'iFrame"}
            style={fieldStyle}
          />
        </div>
        <span style={{ ...labelTextStyle, opacity: 0.72 }}>Choisissez la couleur principale de votre iFrame.</span>
      </label> : null}
    </div>
  );
}
