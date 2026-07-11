"use client";

import { useMemo, useState, type CSSProperties } from "react";
import styles from "./inrSearchPublic.module.css";

type SocialLink = {
  key: string;
  label: string;
  url: string;
};

type Props = {
  companyName: string;
  logoUrl: string;
  profession: string;
  city: string;
  links: SocialLink[];
};

type OrbitStyle = CSSProperties & {
  "--social-angle": string;
  "--social-speed": string;
  "--social-distance": string;
};

const NETWORK_ICONS: Record<string, string> = {
  google: "/icons/google.jpg",
  facebook: "/icons/facebook.png",
  instagram: "/icons/instagram.jpg",
  linkedin: "/icons/linkedin.png",
  tiktok: "/icons/tiktok.svg",
  youtube: "/icons/youtube-shorts.png",
  pinterest: "/icons/pinterest-logo-128.png",
};

export default function InrSearchSocialOrbit({ companyName, logoUrl, profession, city, links }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeLink = links[activeIndex] || links[0];
  const total = links.length;

  const planets = useMemo(() => {
    return links.map((link, index) => {
      const ring = index % 3;
      // Une couronne synchronisée conserve un écart constant entre toutes les
      // planètes : elles tournent vraiment, sans jamais se superposer.
      const phase = (index * 360) / Math.max(1, links.length);
      const distance = "clamp(174px, 17vw, 220px)";
      const speed = 34;
      return { link, index, ring, phase, distance, speed };
    });
  }, [links]);

  return (
    <div className={styles.socialOrbitExperience}>
      <div className={styles.socialOrbitHeader}>
        <div>
          <span className={styles.socialOrbitEyebrow}>Système solaire numérique</span>
          <h2>Tout l’écosystème de {companyName}, enfin visible.</h2>
          <p>Chaque canal devient une planète : toutes restent visibles, tournent à leur propre rythme et s’arrêtent dès que vous les explorez.</p>
        </div>
        <span className={styles.socialOrbitCount}><strong>{String(total).padStart(2, "0")}</strong> présence{total > 1 ? "s" : ""} en ligne</span>
      </div>

      <div className={styles.socialOrbitStage}>
        <div className={styles.socialSolarSystem} role="list" aria-label="Présence en ligne de l’entreprise">
          <div className={styles.socialOrbitRings} aria-hidden="true"><span /><span /><span /></div>
          <div className={styles.socialOrbitCore}>
            <span className={styles.socialOrbitCoreGlow} aria-hidden="true" />
            {logoUrl ? <img src={logoUrl} alt="" width={132} height={132} loading="eager" decoding="async" /> : <span className={styles.socialOrbitFallback}>{companyName.slice(0, 1).toUpperCase()}</span>}
            <small>{profession || "Entreprise"}</small>
            <strong>{companyName}</strong>
            {city ? <em>{city}</em> : null}
          </div>

          <div className={styles.socialOrbitNodes}>
            {planets.map(({ link, index, ring, phase, distance, speed }) => {
              const style: OrbitStyle = {
                "--social-angle": `${phase}deg`,
                "--social-speed": `${speed}s`,
                "--social-distance": distance,
              };
              const icon = NETWORK_ICONS[link.key];
              return (
                <div className={styles.socialOrbitTrack} data-ring={ring} style={style} key={link.key}>
                  <a
                    className={styles.socialOrbitNode}
                    data-network={link.key}
                    data-active={index === activeIndex ? "true" : "false"}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="listitem"
                    data-inrsearch-action={link.key}
                    data-inrsearch-target={link.url}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                  >
                    <span className={`${styles.socialOrbitGlyph} ${styles[`social_${link.key}`] || ""}`}>
                      {icon ? <img src={icon} alt="" width={38} height={38} /> : link.key === "website" ? "◎" : link.label.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{link.label}</strong>
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        {activeLink ? (
          <aside className={styles.socialOrbitDetail} aria-live="polite">
            <span className={`${styles.socialOrbitDetailGlyph} ${styles[`social_${activeLink.key}`] || ""}`}>
              {NETWORK_ICONS[activeLink.key] ? <img src={NETWORK_ICONS[activeLink.key]} alt="" width={48} height={48} /> : activeLink.key === "website" ? "◎" : activeLink.label.slice(0, 1).toUpperCase()}
            </span>
            <small>Planète sélectionnée</small>
            <strong>{activeLink.label}</strong>
            <p>Rejoignez l’espace officiel de {companyName} sur {activeLink.label}.</p>
            <a href={activeLink.url} target="_blank" rel="noopener noreferrer" data-inrsearch-action={activeLink.key} data-inrsearch-target={activeLink.url}>
              Découvrir <span aria-hidden="true">↗</span>
            </a>
            <div className={styles.socialOrbitDetailCoordinates} aria-hidden="true"><span /> ORBITE {String(activeIndex + 1).padStart(2, "0")}</div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
