"use client";

import { useState } from "react";
import { createInrBadgeQrMatrix } from "@/lib/inrBadgeQr";
import styles from "./inrSearchPublic.module.css";

type Props = {
  companyName: string;
  strengths: string[];
  inrBadgeUrl: string;
  inrBadgeQrUrl: string;
};

function InrBadgeQr({ value, label }: { value: string; label: string }) {
  let matrix: boolean[][] = [];
  try {
    matrix = createInrBadgeQrMatrix(value);
  } catch {
    matrix = [];
  }
  if (!matrix.length) return null;

  const quietZone = 4;
  const viewBoxSize = matrix.length + quietZone * 2;
  const path = matrix
    .flatMap((row, rowIndex) =>
      row.map((dark, colIndex) =>
        dark ? `M${colIndex + quietZone},${rowIndex + quietZone}h1v1h-1z` : "",
      ),
    )
    .filter(Boolean)
    .join(" ");

  return (
    <svg className={styles.badgeQrSvg} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={viewBoxSize} height={viewBoxSize} rx="2.5" className={styles.badgeQrBackground} />
      <path d={path} className={styles.badgeQrModules} />
    </svg>
  );
}

export default function InrSearchStrengthsOrbit({ companyName, strengths, inrBadgeUrl, inrBadgeQrUrl }: Props) {
  const cradleStrengths = strengths.length ? strengths.slice(0, 7) : ["iNrBadge"];
  const [activeIndex, setActiveIndex] = useState(0);
  const [impulse, setImpulse] = useState(0);
  const activeStrength = cradleStrengths[activeIndex] || cradleStrengths[0];

  const activate = (index: number) => {
    setActiveIndex(index);
    setImpulse((value) => value + 1);
  };

  return (
    <div className={styles.strengthOrbitExperience}>
      <div className={styles.strengthOrbitHeader}>
        <div>
          <span className={styles.strengthOrbitEyebrow}>Confiance en mouvement</span>
          <h2 id="points-forts-title">Chaque engagement transmet son énergie</h2>
          <p>Les points forts de {companyName} prennent vie dans une balance de Newton, avec iNrBadge comme passeport de contact.</p>
        </div>
      </div>

      <div className={styles.strengthOrbitStage}>
        <div className={styles.strengthNewtonScene}>
          <div className={styles.strengthNewtonFrame} aria-hidden="true"><span /><span /></div>
          <div
            className={styles.strengthNewtonBalls}
            key={impulse}
            data-direction={activeIndex < cradleStrengths.length / 2 ? "left" : "right"}
            role="list"
            aria-label="Points forts de l’entreprise"
          >
            {cradleStrengths.map((strength, index) => (
              <button
                type="button"
                className={styles.strengthNewtonBall}
                data-active={index === activeIndex ? "true" : "false"}
                data-edge={index === 0 ? "left" : index === cradleStrengths.length - 1 ? "right" : "center"}
                key={`${strength}-${index}`}
                onClick={() => activate(index)}
                role="listitem"
                aria-current={index === activeIndex ? "true" : undefined}
              >
                <span className={styles.strengthNewtonStrings} aria-hidden="true"><i /><i /></span>
                <span className={styles.strengthNewtonSphere}><i>{String(index + 1).padStart(2, "0")}</i></span>
                <strong>{strength}</strong>
              </button>
            ))}
          </div>

          <article className={styles.strengthNewtonDetail} aria-live="polite">
            <small>Engagement sélectionné</small>
            <strong>{activeStrength}</strong>
            <p>« {activeStrength} » fait partie des points forts déclarés par {companyName} pour accompagner chaque projet.</p>
            <span>Une impulsion, un engagement clair.</span>
          </article>
        </div>

        <aside className={styles.strengthBadgeCard}>
          <span className={styles.strengthBadgeHalo} aria-hidden="true" />
          <div className={styles.strengthBadgeLabel}><i /> PASSEPORT iNrBADGE</div>
          {inrBadgeQrUrl ? (
            <a
              className={styles.strengthBadgeQr}
              href={inrBadgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-inrsearch-action="inrbadge"
              data-inrsearch-target={inrBadgeUrl}
              aria-label={`Ouvrir l’iNrBadge de ${companyName}`}
            >
              <InrBadgeQr value={inrBadgeQrUrl} label={`QR code iNrBadge de ${companyName}`} />
            </a>
          ) : <span className={styles.strengthBadgeFallback}>iNr</span>}
          <small>Scannez pour garder le contact</small>
          <strong>{companyName}</strong>
          {inrBadgeUrl ? (
            <a
              className={styles.strengthBadgeAction}
              href={inrBadgeUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-inrsearch-action="inrbadge"
              data-inrsearch-target={inrBadgeUrl}
            >
              Ouvrir l’iNrBadge <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </aside>
      </div>

      {strengths.length > cradleStrengths.length ? (
        <div className={styles.strengthOrbitAll} aria-label="Tous les points forts">
          {strengths.map((strength) => <span key={strength}>{strength}</span>)}
        </div>
      ) : null}
    </div>
  );
}
