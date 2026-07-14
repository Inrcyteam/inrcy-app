import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminSecurity";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "inrcy-image-bank";
const MAX_ZIP_ITEMS = 200;
const ZIP_UTF8_FLAG = 0x0800;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let current = index;
  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  CRC_TABLE[index] = current >>> 0;
}

type ImageBankDownloadRow = {
  id: string;
  storage_path: string;
  title: string | null;
  job: string | null;
  created_at: string | null;
};

function cleanText(value: unknown, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function cleanIdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, MAX_ZIP_ITEMS);
}

function sanitizeFilePart(value: string, fallback: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return cleaned || fallback;
}

function getStorageBaseName(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "image.webp";
}

function getExtension(path: string) {
  const baseName = getStorageBaseName(path);
  const match = baseName.match(/\.([a-zA-Z0-9]{2,6})$/);
  return match ? `.${match[1].toLowerCase()}` : ".webp";
}

function buildZipFileName(
  row: ImageBankDownloadRow,
  index: number,
  usedNames: Set<string>,
) {
  const prefix = String(index + 1).padStart(3, "0");
  const titlePart = sanitizeFilePart(
    row.title || row.job || getStorageBaseName(row.storage_path),
    "image-inrcy",
  );
  const extension = getExtension(row.storage_path);
  let fileName = `${prefix}-${titlePart}${extension}`;
  let dedupe = 2;

  while (usedNames.has(fileName)) {
    fileName = `${prefix}-${titlePart}-${dedupe}${extension}`;
    dedupe += 1;
  }

  usedNames.add(fileName);
  return fileName;
}

function getDownloadName(value: unknown) {
  const base = sanitizeFilePart(cleanText(value, 120), "inrcy-banque-images");
  return base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(dateValue: string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, safeDate.getFullYear());
  const month = safeDate.getMonth() + 1;
  const day = safeDate.getDate();
  const hours = safeDate.getHours();
  const minutes = safeDate.getMinutes();
  const seconds = Math.floor(safeDate.getSeconds() / 2);

  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

function writeUInt16LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function makeLocalHeader(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  dateValue: string | null,
) {
  const { time, date } = getDosDateTime(dateValue);
  const header = new Uint8Array(30 + nameBytes.length);
  writeUInt32LE(header, 0, 0x04034b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, ZIP_UTF8_FLAG);
  writeUInt16LE(header, 8, 0);
  writeUInt16LE(header, 10, time);
  writeUInt16LE(header, 12, date);
  writeUInt32LE(header, 14, crc);
  writeUInt32LE(header, 18, size);
  writeUInt32LE(header, 22, size);
  writeUInt16LE(header, 26, nameBytes.length);
  writeUInt16LE(header, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function makeCentralHeader(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  localHeaderOffset: number,
  dateValue: string | null,
) {
  const { time, date } = getDosDateTime(dateValue);
  const header = new Uint8Array(46 + nameBytes.length);
  writeUInt32LE(header, 0, 0x02014b50);
  writeUInt16LE(header, 4, 20);
  writeUInt16LE(header, 6, 20);
  writeUInt16LE(header, 8, ZIP_UTF8_FLAG);
  writeUInt16LE(header, 10, 0);
  writeUInt16LE(header, 12, time);
  writeUInt16LE(header, 14, date);
  writeUInt32LE(header, 16, crc);
  writeUInt32LE(header, 20, size);
  writeUInt32LE(header, 24, size);
  writeUInt16LE(header, 28, nameBytes.length);
  writeUInt16LE(header, 30, 0);
  writeUInt16LE(header, 32, 0);
  writeUInt16LE(header, 34, 0);
  writeUInt16LE(header, 36, 0);
  writeUInt32LE(header, 38, 0);
  writeUInt32LE(header, 42, localHeaderOffset);
  header.set(nameBytes, 46);
  return header;
}

function makeEndCentralDirectory(
  fileCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const footer = new Uint8Array(22);
  writeUInt32LE(footer, 0, 0x06054b50);
  writeUInt16LE(footer, 4, 0);
  writeUInt16LE(footer, 6, 0);
  writeUInt16LE(footer, 8, fileCount);
  writeUInt16LE(footer, 10, fileCount);
  writeUInt32LE(footer, 12, centralDirectorySize);
  writeUInt32LE(footer, 16, centralDirectoryOffset);
  writeUInt16LE(footer, 20, 0);
  return footer;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({}));
  const requestedIds = cleanIdList(body?.ids);

  if (!requestedIds.length) {
    return NextResponse.json(
      { error: "Sélectionne au moins une image à télécharger." },
      { status: 400 },
    );
  }

  const { data: rows, error } = await supabaseAdmin
    .from("inrcy_image_bank")
    .select("id,storage_path,title,job,created_at")
    .in("id", requestedIds);

  if (error) {
    return NextResponse.json(
      { error: "Impossible de préparer le téléchargement." },
      { status: 500 },
    );
  }

  const rowsById = new Map(
    ((rows ?? []) as ImageBankDownloadRow[]).map((row) => [row.id, row]),
  );
  const orderedRows = requestedIds
    .map((id) => rowsById.get(id))
    .filter((row): row is ImageBankDownloadRow => Boolean(row));

  if (!orderedRows.length) {
    return NextResponse.json(
      { error: "Aucune image trouvée pour cette sélection." },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();
  const downloadName = getDownloadName(body?.filename);
  const storage = supabaseAdmin.storage.from(BUCKET);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const centralHeaders: Uint8Array[] = [];
        const usedNames = new Set<string>();
        let offset = 0;
        let exported = 0;

        for (const row of orderedRows) {
          const file = await storage.download(row.storage_path);
          if (file.error || !file.data) continue;

          const bytes = new Uint8Array(await file.data.arrayBuffer());
          if (!bytes.byteLength || bytes.byteLength > 0xffffffff) continue;

          const zipName = buildZipFileName(row, exported, usedNames);
          const nameBytes = encoder.encode(zipName);
          const checksum = crc32(bytes);
          const localHeader = makeLocalHeader(
            nameBytes,
            checksum,
            bytes.byteLength,
            row.created_at,
          );
          const centralHeader = makeCentralHeader(
            nameBytes,
            checksum,
            bytes.byteLength,
            offset,
            row.created_at,
          );

          controller.enqueue(localHeader);
          controller.enqueue(bytes);
          centralHeaders.push(centralHeader);
          offset += localHeader.byteLength + bytes.byteLength;
          exported += 1;
        }

        if (!exported) {
          throw new Error("Aucun fichier Storage téléchargeable.");
        }

        const centralDirectoryOffset = offset;
        let centralDirectorySize = 0;
        for (const centralHeader of centralHeaders) {
          controller.enqueue(centralHeader);
          centralDirectorySize += centralHeader.byteLength;
          offset += centralHeader.byteLength;
        }

        controller.enqueue(
          makeEndCentralDirectory(
            exported,
            centralDirectorySize,
            centralDirectoryOffset,
          ),
        );
        controller.close();
      } catch (streamError) {
        controller.error(streamError);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${downloadName}"`,
      "cache-control": "no-store",
    },
  });
}
