"use client";

type Props = {
  onClick: () => void;
  title?: string;
  size?: number; // px
};

export default function HelpButton({ onClick, title = "Aide", size = 28 }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(15,23,42,0.55)",
        color: "rgba(255,255,255,0.9)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onMouseDown={(e) => e.preventDefault()} // évite de voler le focus (petit confort)
    >
      <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1 }}>?</span>
    </button>
  );
}