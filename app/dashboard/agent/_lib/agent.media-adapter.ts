import { clampNumber } from "./agent.utils";

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, body] = dataUrl.split(",");
  const mime = /data:([^;]+);base64/i.exec(header || "")?.[1] || "image/jpeg";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mime });
}

export function offsetFromDrawPosition(params: {
  containerWidth: number;
  containerHeight: number;
  drawW: number;
  drawH: number;
  dx: number;
  dy: number;
}) {
  const { containerWidth, containerHeight, drawW, drawH, dx, dy } = params;
  const maxX = Math.abs(drawW - containerWidth) / 2;
  const maxY = Math.abs(drawH - containerHeight) / 2;
  return {
    offsetX: maxX
      ? clampNumber(
          (((containerWidth - drawW) / 2 - dx) / maxX) * 100,
          -100,
          100,
        )
      : 0,
    offsetY: maxY
      ? clampNumber(
          (((containerHeight - drawH) / 2 - dy) / maxY) * 100,
          -100,
          100,
        )
      : 0,
  };
}

export async function urlToFile(
  url: string,
  fileName: string,
  fallbackType = "image/jpeg",
) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Impossible de récupérer le média à adapter.");
  }
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
    lastModified: Date.now(),
  });
}
