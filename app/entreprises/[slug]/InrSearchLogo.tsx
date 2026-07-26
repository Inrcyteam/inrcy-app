"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useMemo, useState } from "react";

type Props = {
  src: string;
  alt: string;
  companyName: string;
  width: number;
  height: number;
  className?: string;
  fallbackClassName?: string;
  loading?: ImageProps["loading"];
  fetchPriority?: ImageProps["fetchPriority"];
};

function initialsFor(companyName: string) {
  const words = companyName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/^(de|des|du|la|le|les|et|à)$/i.test(word));

  if (!words.length) return "iN";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("fr-FR");
  return `${words[0][0] || ""}${words[1][0] || ""}`.toLocaleUpperCase("fr-FR");
}

export default function InrSearchLogo({
  src,
  alt,
  companyName,
  width,
  height,
  className,
  fallbackClassName,
  loading = "eager",
  fetchPriority,
}: Props) {
  const [failed, setFailed] = useState(!src);
  const initials = useMemo(() => initialsFor(companyName), [companyName]);

  useEffect(() => {
    setFailed(!src);
  }, [src]);

  if (failed) {
    return (
      <span
        className={fallbackClassName}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}
