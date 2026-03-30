import type { CSSProperties, ReactNode } from "react";
import styles from "../dashboard.module.css";

type Props = {
  variant: "success" | "error";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export default function StatusMessage({ variant, children, className = "", style }: Props) {
  const variantClass = variant === "success" ? styles.statusSuccess : styles.statusError;
  return (
    <div className={`${styles.statusMessage} ${variantClass} ${className}`.trim()} role={variant === "error" ? "alert" : "status"} style={style}>
      <span aria-hidden className={styles.statusMessageIcon}>{variant === "success" ? "✓" : "!"}</span>
      <span>{children}</span>
    </div>
  );
}
