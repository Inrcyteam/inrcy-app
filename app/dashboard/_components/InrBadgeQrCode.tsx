"use client";

import { useMemo } from "react";
import { createInrBadgeQrMatrix } from "@/lib/inrBadgeQr";
import styles from "../dashboard.module.css";

type Props = {
  value: string;
  label?: string;
};

export default function InrBadgeQrCode({ value, label = "QR Code iNr'Badge" }: Props) {
  const matrix = useMemo(() => {
    try {
      return createInrBadgeQrMatrix(value);
    } catch {
      return [];
    }
  }, [value]);

  if (!matrix.length) {
    return (
      <div className={styles.inrBadgeQrUnavailable} role="img" aria-label="QR Code indisponible">
        QR indisponible
      </div>
    );
  }

  const size = matrix.length;
  const quietZone = 4;
  const viewBoxSize = size + quietZone * 2;
  const path = matrix
    .flatMap((row, rowIndex) => row.map((dark, colIndex) => (dark ? `M${colIndex + quietZone},${rowIndex + quietZone}h1v1h-1z` : "")))
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={styles.inrBadgeQrSvg}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={viewBoxSize} height={viewBoxSize} rx="2" fill="currentColor" className={styles.inrBadgeQrSvgBackground} />
      <path d={path} fill="currentColor" className={styles.inrBadgeQrSvgModules} />
    </svg>
  );
}
