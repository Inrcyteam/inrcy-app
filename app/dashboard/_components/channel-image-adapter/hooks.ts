import { useEffect, useState } from "react";

import type { ImageMeta } from "./types";


export function useViewportWidth(defaultWidth = 1440) {
  const [viewportWidth, setViewportWidth] = useState<number>(typeof window === "undefined" ? defaultWidth : window.innerWidth);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewportWidth;
}

export function useNaturalImageMeta(src: string, provided?: ImageMeta) {
  const [meta, setMeta] = useState<ImageMeta | null>(provided && provided.width && provided.height ? provided : null);

  useEffect(() => {
    if (provided?.width && provided?.height) {
      setMeta(provided);
      return;
    }
    if (!src) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setMeta({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
    };
    img.onerror = () => {
      if (!cancelled) setMeta(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, provided?.width, provided?.height]);

  return meta;
}
