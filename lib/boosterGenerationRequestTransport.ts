import { Buffer } from "node:buffer";

export type BoosterGenerationRequestTransport = "json" | "multipart";

type BinaryImageMetadata = Record<string, unknown> & {
  name?: unknown;
  type?: unknown;
  dataUrl?: unknown;
};

type RequestPayloadLike = Record<string, unknown> & {
  imagesForAI?: BinaryImageMetadata[];
  videoForAI?: (Record<string, unknown> & {
    visualFrames?: BinaryImageMetadata[];
  }) | null;
};

const MULTIPART_PAYLOAD_MAX_LENGTH = 80_000;
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const IMAGE_MAX_COUNT = 5;
const VIDEO_FRAME_MAX_COUNT = 3;
const IMAGE_MAX_DATA_URL_LENGTH = 3_500_000;
const IMAGE_MAX_TOTAL_DATA_URL_LENGTH = 10_000_000;
const IMAGE_MAX_BINARY_BYTES = Math.floor(
  ((IMAGE_MAX_DATA_URL_LENGTH - 40) * 3) / 4,
);
const IMAGE_MAX_TOTAL_BINARY_BYTES = Math.floor(
  ((IMAGE_MAX_TOTAL_DATA_URL_LENGTH - 120) * 3) / 4,
);

function isBlobLike(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value !== "string" &&
    typeof value.arrayBuffer === "function" &&
    Number.isFinite(value.size)
  );
}

function normalizeImageMimeType(value: unknown) {
  const type = String(value || "")
    .toLowerCase()
    .trim();
  if (!IMAGE_MIME_TYPES.has(type)) return "";
  return type === "image/jpg" ? "image/jpeg" : type;
}

async function hydrateMultipartImages(args: {
  formData: FormData;
  fieldPrefix: "aiImage" | "videoFrame";
  metadata: BinaryImageMetadata[];
  maxCount: number;
}) {
  const candidates: Array<{
    blob: File;
    metadata: BinaryImageMetadata;
    mimeType: string;
  }> = [];
  let totalBytes = 0;

  for (
    let index = 0;
    index < Math.min(args.metadata.length, args.maxCount);
    index += 1
  ) {
    const entry = args.formData.get(`${args.fieldPrefix}${index}`);
    if (!isBlobLike(entry)) continue;

    const mimeType = normalizeImageMimeType(entry.type);
    if (!mimeType || entry.size <= 0 || entry.size > IMAGE_MAX_BINARY_BYTES) {
      continue;
    }

    totalBytes += entry.size;
    if (totalBytes > IMAGE_MAX_TOTAL_BINARY_BYTES) break;

    candidates.push({
      blob: entry,
      metadata: args.metadata[index] || {},
      mimeType,
    });
  }

  const hydrated = await Promise.all(
    candidates.map(async ({ blob, metadata, mimeType }) => {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
      if (dataUrl.length > IMAGE_MAX_DATA_URL_LENGTH) return null;

      return {
        ...metadata,
        name: String(metadata.name || blob.name || "image").slice(0, 160),
        type: mimeType,
        dataUrl,
      };
    }),
  );

  return hydrated.filter(
    (image): image is NonNullable<(typeof hydrated)[number]> => !!image,
  );
}

function parseMultipartPayload(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    value.length <= 0 ||
    value.length > MULTIPART_PAYLOAD_MAX_LENGTH
  ) {
    return {} as RequestPayloadLike;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as RequestPayloadLike)
      : ({} as RequestPayloadLike);
  } catch {
    return {} as RequestPayloadLike;
  }
}

export async function readBoosterGenerationRequest<T extends RequestPayloadLike>(
  req: Request,
): Promise<{ body: T; transport: BoosterGenerationRequestTransport }> {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    const body = (await req.json().catch(() => ({}))) as T;
    return { body, transport: "json" };
  }

  const formData = await req.formData();
  const parsed = parseMultipartPayload(formData.get("payload"));
  const imageMetadata = Array.isArray(parsed.imagesForAI)
    ? parsed.imagesForAI
    : [];
  const video =
    parsed.videoForAI && typeof parsed.videoForAI === "object"
      ? parsed.videoForAI
      : null;
  const frameMetadata = Array.isArray(video?.visualFrames)
    ? video.visualFrames
    : [];

  const [imagesForAI, visualFrames] = await Promise.all([
    hydrateMultipartImages({
      formData,
      fieldPrefix: "aiImage",
      metadata: imageMetadata,
      maxCount: IMAGE_MAX_COUNT,
    }),
    hydrateMultipartImages({
      formData,
      fieldPrefix: "videoFrame",
      metadata: frameMetadata,
      maxCount: VIDEO_FRAME_MAX_COUNT,
    }),
  ]);

  const body = {
    ...parsed,
    imagesForAI,
    videoForAI: video
      ? {
          ...video,
          visualFrames,
        }
      : null,
  } as T;

  return { body, transport: "multipart" };
}
