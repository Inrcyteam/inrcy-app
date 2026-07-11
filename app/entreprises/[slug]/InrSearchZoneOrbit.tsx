"use client";

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import styles from "./inrSearchPublic.module.css";

type Props = {
  companyName: string;
  city: string;
  profession: string;
  zones: string[];
};

type ZoneStyle = CSSProperties & {
  "--zone-angle": string;
  "--zone-distance": string;
  "--zone-accent": string;
};

const ZONE_ACCENTS = ["#38dcff", "#7b61ff", "#e95cff", "#4d92ff", "#36d8b5", "#ff9a62", "#ffd45f"];

function wrapIndex(index: number, length: number) {
  if (!length) return 0;
  return (index + length) % length;
}

export default function InrSearchZoneOrbit({ companyName, city, profession, zones }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = zones.length;
  const activeZone = zones[activeIndex] || zones[0] || city;

  const radarZones = useMemo(
    () =>
      zones.map((zone, index) => {
        const forward = wrapIndex(index - activeIndex, total);
        const signed = forward > total / 2 ? forward - total : forward;
        const visible = total <= 7 || Math.abs(signed) <= 3;
        const position = total <= 7 ? forward : signed + 3;
        const divisor = Math.min(total, 7);
        const angle = divisor > 1 ? -90 + (position * 360) / divisor : -90;
        const distance = index % 2 === 0 ? "clamp(122px, 14vw, 176px)" : "clamp(108px, 12.5vw, 158px)";
        return { zone, index, visible, angle, distance };
      }),
    [activeIndex, total, zones],
  );

  const move = (offset: number) => {
    setActiveIndex((current) => wrapIndex(current + offset, total));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, total - 1));
    }
  };

  return (
    <div className={styles.zoneOrbitExperience} onKeyDown={onKeyDown}>
      <div className={styles.zoneOrbitHeader}>
        <div>
          <span className={styles.zoneOrbitEyebrow}>Radar d’intervention</span>
          <h2 id="zones-title">La proximité devient un signal clair</h2>
          <p>{companyName} rayonne depuis {city || "son point d’ancrage"}. Choisissez une zone pour préparer une demande locale.</p>
        </div>
        <div className={styles.zoneOrbitNavigator} aria-label="Naviguer entre les zones d’intervention">
          <button type="button" onClick={() => move(-1)} aria-label="Zone précédente">←</button>
          <span><strong>{String(activeIndex + 1).padStart(2, "0")}</strong> / {String(total).padStart(2, "0")}</span>
          <button type="button" onClick={() => move(1)} aria-label="Zone suivante">→</button>
        </div>
      </div>

      <div className={styles.zoneOrbitStage} tabIndex={0} aria-label="Radar des zones d’intervention">
        <div className={styles.zoneRadarCanvas}>
          <div className={styles.zoneOrbitRadar} aria-hidden="true"><span /><span /><span /><i /></div>
          <div className={styles.zoneOrbitCore}>
            <span className={styles.zoneOrbitCorePulse} aria-hidden="true" />
            <small>Point d’ancrage</small>
            <strong>{city || activeZone}</strong>
            <em>{profession || "Zone principale"}</em>
          </div>

          <div className={styles.zoneOrbitSatellites} role="list" aria-label="Communes desservies sur le radar">
            {radarZones.map(({ zone, index, visible, angle, distance }) => {
              const active = index === activeIndex;
              const style: ZoneStyle = {
                "--zone-angle": `${angle}deg`,
                "--zone-distance": distance,
                "--zone-accent": ZONE_ACCENTS[index % ZONE_ACCENTS.length],
              };
              return (
                <button
                  type="button"
                  className={styles.zoneOrbitSatellite}
                  data-active={active ? "true" : "false"}
                  data-visible={visible ? "true" : "false"}
                  style={style}
                  key={`${zone}-${index}`}
                  onClick={() => setActiveIndex(index)}
                  aria-current={active ? "true" : undefined}
                  aria-hidden={visible ? undefined : true}
                  tabIndex={visible ? 0 : -1}
                  aria-label={`Afficher la zone ${zone}`}
                  role="listitem"
                >
                  <span aria-hidden="true" />
                  <strong>{zone}</strong>
                  <small>{active ? "Signal actif" : "Sélectionner"}</small>
                </button>
              );
            })}
          </div>
        </div>

        <aside className={styles.zoneOrbitDetail} aria-live="polite">
          <span className={styles.zoneOrbitDetailIndex}>{String(activeIndex + 1).padStart(2, "0")}</span>
          <small>Zone sélectionnée</small>
          <strong>{activeZone}</strong>
          <p>Vous avez un projet à {activeZone} ? {companyName} peut confirmer la disponibilité et les modalités adaptées à votre besoin.</p>
          <a href="#contact">Présenter mon besoin <span aria-hidden="true">↗</span></a>
          <div className={styles.zoneOrbitDetailPulse} aria-hidden="true"><span /><span /><span /></div>
        </aside>
      </div>

      <div className={styles.zoneOrbitRail} data-local-carousel aria-label="Toutes les zones d’intervention">
        {zones.map((zone, index) => (
          <button type="button" data-active={index === activeIndex ? "true" : "false"} key={`${zone}-rail`} onClick={() => setActiveIndex(index)}>
            <span /> {zone}
          </button>
        ))}
      </div>
      <p className={styles.zoneOrbitSeoCopy}>Zone d’intervention de {companyName} : {zones.join(", ")}.</p>
    </div>
  );
}
