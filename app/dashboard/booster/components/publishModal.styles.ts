import type { CSSProperties } from "react";

export const textAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 130,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "14px 16px",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
  display: "block",
  maxWidth: "100%",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  padding: "0 14px",
  outline: "none",
  boxSizing: "border-box",
  display: "block",
  maxWidth: "100%",
};

export const lightFieldStyle: CSSProperties = {
  ...inputStyle,
  background: "#ffffff",
  color: "#111827",
  border: "1px solid rgba(17,24,39,0.14)",
};

export const darkSelectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "auto",
  WebkitAppearance: "menulist",
  MozAppearance: "menulist",
  color: "#ffffff",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.14)",
  colorScheme: "dark",
};

export const darkOptionStyle: CSSProperties = {
  color: "#ffffff",
  background: "#1f2937",
};

export const channelBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  minHeight: 48,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  padding: "0 12px",
  color: "inherit",
  cursor: "pointer",
};

export const channelBtnActive: CSSProperties = {
  border: "1px solid rgba(76,195,255,0.45)",
  boxShadow: "0 0 0 1px rgba(76,195,255,0.18) inset",
};

export const channelBtnDisabled: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

export const pillBtn: CSSProperties = {
  minHeight: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "0 14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const pillBtnActive: CSSProperties = {
  border: "1px solid rgba(76,195,255,0.45)",
  boxShadow: "0 0 0 1px rgba(76,195,255,0.18) inset",
  background: "rgba(76,195,255,0.10)",
};
