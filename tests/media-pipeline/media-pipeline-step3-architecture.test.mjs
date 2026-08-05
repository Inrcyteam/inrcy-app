import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const intentRoute = read("app/api/media-pipeline/upload-intent/route.ts");
const eventRoute = read("app/api/media-pipeline/upload-event/route.ts");
const client = read("lib/universalMediaUploadClient.ts");
const shared = read("app/dashboard/booster/publier/publishModal.shared.tsx");
const imageController = read(
  "app/dashboard/booster/publier/usePublishImageController.ts",
);
const mediaLibrary = read("app/dashboard/mediatheque/MediaLibraryClient.tsx");
const workspaceHook = read(
  "app/dashboard/booster/publier/usePersistentMediaWorkspace.ts",
);
const migration = read(
  "ops/sql/2026-07-29_media_pipeline_step3_universal_direct_upload.sql",
);

test("aucun binaire lourd ne traverse la nouvelle route Vercel", () => {
  assert.match(intentRoute, /createSignedUploadUrl/);
  assert.doesNotMatch(intentRoute, /request\.formData\(/);
  assert.doesNotMatch(intentRoute, /arrayBuffer\(/);
  assert.doesNotMatch(intentRoute, /Buffer\.from\(/);
  assert.match(intentRoute, /resumableEndpoint/);
  assert.match(intentRoute, /buildDirectStorageResumableEndpoint/);
});

test("le client TUS possède reprise locale, chunks de 6 Mo, progression et annulation", () => {
  assert.match(client, /method:\s*"POST"/);
  assert.match(client, /method:\s*"HEAD"/);
  assert.match(client, /xhr\.open\("PATCH"/);
  assert.match(client, /UNIVERSAL_MEDIA_TUS_CHUNK_SIZE_BYTES/);
  assert.match(client, /window\.localStorage/);
  assert.match(client, /Upload-Offset/);
  assert.match(client, /upload\/resumable\/sign/);
  assert.ok((client.match(/apikey/g) || []).length >= 3);
  assert.match(client, /x-signature/);
  assert.match(client, /x-upsert/);
  assert.match(client, /TUS_RESUME_STORAGE_VERSION/);
  assert.match(client, /endpoint !== intent\.resumableEndpoint/);
  assert.match(client, /AbortSignal/);
  assert.match(client, /onProgress/);
});

test("un échec TUS réel remonte immédiatement au bouton Générer", () => {
  assert.match(workspaceHook, /activeUploadFailureRef/);
  assert.match(
    workspaceHook,
    /getWorkspaceMediaFamilyFailure\([\s\S]{0,80}activeUploadFailureRef\.current/,
  );
  assert.match(workspaceHook, /throw new Error\(uploadFailure\)/);
  assert.match(workspaceHook, /onError\?\.\(message\)/);
});

test("les images, vidéos et la médiathèque utilisent le moteur commun avec secours historique", () => {
  assert.match(shared, /uploadUniversalMediaFile/);
  assert.match(shared, /universal video upload fallback/);
  assert.match(shared, /universal image upload fallback/);
  assert.match(imageController, /uploadBoosterImageFileDirect/);
  assert.match(mediaLibrary, /uploadFileToPreparedUniversalIntent/);
  assert.match(mediaLibrary, /media library signed fallback/);
  assert.match(client, /NEXT_PUBLIC_MEDIA_PIPELINE_UPLOADS_V1/);
});


test("les plafonds produit sont contrôlés avant l’upload direct", () => {
  assert.match(intentRoute, /getUniversalMediaProductMaxBytes/);
  assert.match(intentRoute, /media_product_limit_exceeded/);
});

test("les uploads de source persistants mettent à jour le registre étape 2", () => {
  assert.match(intentRoute, /workspace_source/);
  assert.match(intentRoute, /client_media_key/);
  assert.match(intentRoute, /pipeline_version/);
  assert.match(intentRoute, /UNIVERSAL_MEDIA_PIPELINE_VERSION/);
  assert.match(eventRoute, /upload_status/);
  assert.match(eventRoute, /upload_progress/);
  assert.match(eventRoute, /uploaded_at/);
  assert.match(eventRoute, /\.eq\("user_id", activeUserId\)/);
});

test("la migration Storage est additive et prépare les fichiers volumineux", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /5368709120/);
  assert.match(migration, /'booster'/);
  assert.match(migration, /'inrcy-pro-media'/);
  assert.doesNotMatch(migration, /drop\s+table/i);
  assert.doesNotMatch(migration, /drop\s+column/i);
  assert.doesNotMatch(migration, /truncate\s+/i);
});
