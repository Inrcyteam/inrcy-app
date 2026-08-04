import type { CSSProperties, ReactNode } from "react";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishStepTitleProps = {
  styles: PublishModalStyles;
  step: number;
  children: ReactNode;
  testId?: string;
  style?: CSSProperties;
};

export default function PublishStepTitle({
  styles,
  step,
  children,
  testId,
  style,
}: PublishStepTitleProps) {
  return (
    <div
      className={styles.blockTitle}
      data-testid={testId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          display: "inline-grid",
          placeItems: "center",
          border: "1px solid rgba(76,195,255,0.38)",
          background: "rgba(76,195,255,0.12)",
          color: "#dff6ff",
          fontSize: 12,
          fontWeight: 950,
          flex: "0 0 auto",
        }}
      >
        {step}
      </span>
      {children}
    </div>
  );
}
