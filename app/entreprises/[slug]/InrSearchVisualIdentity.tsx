"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import {
  buildInrSearchFallbackPalette,
  hashInrSearchVisualSeed,
  inferInrSearchVisualTheme,
  rgbTriplet,
  type InrSearchVisualPalette,
  type InrSearchVisualTheme,
} from "@/lib/inrSearchVisualIdentity";
import styles from "./inrSearchPublic.module.css";

type Props = {
  companyName: string;
  logoUrl: string;
  profession: string;
  sector: string;
  initialTheme: InrSearchVisualTheme;
};

type ParticleStyle = CSSProperties & {
  "--particle-x": string;
  "--particle-y": string;
  "--particle-size": string;
  "--particle-delay": string;
  "--particle-duration": string;
  "--particle-drift-x": string;
  "--particle-drift-y": string;
  "--particle-opacity": string;
};

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (!delta) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * ((blue - red) / delta + 2);
  else hue = 60 * ((red - green) / delta + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation, lightness };
}

function hueDistance(first: number, second: number) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function extractPalette(data: Uint8ClampedArray, fallback: InrSearchVisualPalette): InrSearchVisualPalette {
  const bins = Array.from({ length: 24 }, () => ({
    score: 0,
    red: 0,
    green: 0,
    blue: 0,
    weight: 0,
    hue: 0,
  }));

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.42) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 246 && min > 235) continue;
    if (max < 24) continue;

    const hsl = rgbToHsl(red, green, blue);
    if (hsl.saturation < 0.16) continue;

    const vividness = hsl.saturation * (1 - Math.abs(hsl.lightness - 0.54) * 1.15);
    const weight = Math.max(0.02, vividness) * alpha;
    const binIndex = Math.min(23, Math.floor(hsl.hue / 15));
    const bin = bins[binIndex];
    bin.score += weight;
    bin.red += red * weight;
    bin.green += green * weight;
    bin.blue += blue * weight;
    bin.weight += weight;
    bin.hue = binIndex * 15 + 7.5;
  }

  const ranked = bins
    .filter((bin) => bin.weight > 0)
    .sort((first, second) => second.score - first.score);
  if (!ranked.length) return fallback;

  const toRgb = (bin: (typeof ranked)[number]): [number, number, number] => [
    clampChannel(bin.red / bin.weight),
    clampChannel(bin.green / bin.weight),
    clampChannel(bin.blue / bin.weight),
  ];

  const primaryBin = ranked[0];
  const secondaryBin = ranked.find((bin) => hueDistance(primaryBin.hue, bin.hue) >= 42) || ranked[1] || primaryBin;
  const tertiaryBin = ranked.find(
    (bin) => hueDistance(primaryBin.hue, bin.hue) >= 95 && hueDistance(secondaryBin.hue, bin.hue) >= 34,
  ) || ranked[2] || secondaryBin;

  const primary = toRgb(primaryBin);
  const secondary = toRgb(secondaryBin);
  const tertiary = toRgb(tertiaryBin);
  const average = primary.map((channel, index) =>
    clampChannel(channel * 0.35 + secondary[index] * 0.16 + fallback.ink[index] * 0.49),
  ) as [number, number, number];

  return { primary, secondary, tertiary, ink: average };
}

function applyPalette(root: HTMLElement, palette: InrSearchVisualPalette, source: "logo" | "fallback") {
  root.style.setProperty("--brand-primary-rgb", rgbTriplet(palette.primary));
  root.style.setProperty("--brand-secondary-rgb", rgbTriplet(palette.secondary));
  root.style.setProperty("--brand-tertiary-rgb", rgbTriplet(palette.tertiary));
  root.style.setProperty("--brand-ink-rgb", rgbTriplet(palette.ink));
  root.dataset.paletteSource = source;
}

function seededParticles(seed: string) {
  let state = hashInrSearchVisualSeed(seed) || 1;
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };

  return Array.from({ length: 22 }, (_, index): ParticleStyle => ({
    "--particle-x": `${Math.round(random() * 1000) / 10}%`,
    "--particle-y": `${Math.round(random() * 1000) / 10}%`,
    "--particle-size": `${Math.round(2 + random() * 5)}px`,
    "--particle-delay": `${(-random() * 15).toFixed(2)}s`,
    "--particle-duration": `${(11 + random() * 17).toFixed(2)}s`,
    "--particle-drift-x": `${Math.round((random() - 0.5) * 90)}px`,
    "--particle-drift-y": `${Math.round(-28 - random() * 82)}px`,
    "--particle-opacity": `${(0.18 + random() * 0.54).toFixed(2)}`,
    zIndex: index % 3,
  }));
}

export default function InrSearchVisualIdentity({
  companyName,
  logoUrl,
  profession,
  sector,
  initialTheme,
}: Props) {
  const seed = `${companyName}|${profession}|${sector}`;
  const particles = useMemo(() => seededParticles(seed), [seed]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-inrsearch-page]");
    if (!root) return;

    const inferredTheme = inferInrSearchVisualTheme(`${profession} ${sector}`) || initialTheme;
    root.dataset.visualTheme = inferredTheme;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionMode = () => {
      const hardware = navigator.hardwareConcurrency || 8;
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
      root.dataset.motion = media.matches || hardware <= 4 || memory <= 4 ? "lite" : "full";
    };
    updateMotionMode();
    media.addEventListener?.("change", updateMotionMode);

    const fallback = buildInrSearchFallbackPalette(seed, inferredTheme);
    applyPalette(root, fallback, "fallback");

    if (!logoUrl) {
      return () => media.removeEventListener?.("change", updateMotionMode);
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = logoUrl;

    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.clearRect(0, 0, 64, 64);
        context.drawImage(image, 0, 0, 64, 64);
        const palette = extractPalette(context.getImageData(0, 0, 64, 64).data, fallback);
        applyPalette(root, palette, "logo");
      } catch {
        applyPalette(root, fallback, "fallback");
      }
    };
    image.onerror = () => applyPalette(root, fallback, "fallback");

    return () => {
      cancelled = true;
      media.removeEventListener?.("change", updateMotionMode);
    };
  }, [initialTheme, logoUrl, profession, sector, seed]);

  return (
    <div className={styles.visualIdentityLayer} aria-hidden="true">
      <span className={styles.visualIdentityAuraPrimary} />
      <span className={styles.visualIdentityAuraSecondary} />
      <span className={styles.visualIdentityMesh} />
      <span className={styles.visualIdentityScanline} />
      <div className={styles.visualIdentityParticles}>
        {particles.map((style, index) => (
          <i className={styles.visualIdentityParticle} key={index} style={style} />
        ))}
      </div>
    </div>
  );
}
