import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  isRequestedNormalizationRepair,
  selectNormalizationRepairCandidates,
} from "../../lib/mediaNormalizationRepairQueue.ts";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

function row(params: {
  id: string;
  status: "not_requested" | "failed_retryable";
  mission?: string;
  scope?: string;
  pipelineVersion?: number;
  updatedAt: string;
}) {
  return {
    id: params.id,
    user_id: `account-${params.id}`,
    processing_status: params.status,
    pipeline_version: params.pipelineVersion ?? 2,
    updated_at: params.updatedAt,
    media_metadata: {
      pipeline_mission: params.mission,
      preparation_scope: params.scope,
    },
  };
}

test("les originaux source_only/not_requested ne rentrent jamais dans la réparation", () => {
  assert.equal(
    isRequestedNormalizationRepair(row({
      id: "source",
      status: "not_requested",
      mission: "source_metadata",
      scope: "source_only",
      updatedAt: "2026-08-01T00:00:00.000Z",
    })),
    false,
  );
  assert.equal(
    isRequestedNormalizationRepair(row({
      id: "ai",
      status: "not_requested",
      mission: "ai_preparation",
      updatedAt: "2026-08-01T00:00:01.000Z",
    })),
    true,
  );
  assert.equal(
    isRequestedNormalizationRepair(row({
      id: "publication",
      status: "not_requested",
      mission: "publication_preparation",
      updatedAt: "2026-08-01T00:00:02.000Z",
    })),
    true,
  );
});

test("une erreur retryable reste réparable quelle que soit sa mission historique", () => {
  assert.equal(
    isRequestedNormalizationRepair(row({
      id: "retry-source",
      status: "failed_retryable",
      mission: "source_metadata",
      scope: "source_only",
      updatedAt: "2026-08-01T00:00:00.000Z",
    })),
    true,
  );
});

test("une intention v1 missionnée est reprise sans sélectionner les médias v1 non missionnés", () => {
  const selected = selectNormalizationRepairCandidates({
    failedRetryableRows: [],
    notRequestedRows: [
      row({
        id: "v1-source-only",
        status: "not_requested",
        mission: "source_metadata",
        scope: "source_only",
        pipelineVersion: 1,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      row({
        id: "v1-without-mission",
        status: "not_requested",
        pipelineVersion: 1,
        updatedAt: "2026-08-01T00:00:01.000Z",
      }),
      row({
        id: "v1-ai-intent",
        status: "not_requested",
        mission: "ai_preparation",
        pipelineVersion: 1,
        updatedAt: "2026-08-01T00:00:02.000Z",
      }),
      row({
        id: "v1-publication-intent",
        status: "not_requested",
        mission: "publication_preparation",
        pipelineVersion: 1,
        updatedAt: "2026-08-01T00:00:03.000Z",
      }),
    ],
    minimumPipelineVersion: 2,
    minimumRequestedPipelineVersion: 1,
    limit: 10,
  });

  assert.deepEqual(selected.map((item) => item.id), [
    "v1-ai-intent",
    "v1-publication-intent",
  ]);
});

test("la sélection bornée réserve une place aux retries et aux demandes neuves", () => {
  const selected = selectNormalizationRepairCandidates({
    failedRetryableRows: [
      row({ id: "retry-1", status: "failed_retryable", updatedAt: "2026-08-01T00:00:03.000Z" }),
      row({ id: "retry-2", status: "failed_retryable", updatedAt: "2026-08-01T00:00:04.000Z" }),
    ],
    notRequestedRows: [
      row({
        id: "source-oldest",
        status: "not_requested",
        mission: "source_metadata",
        scope: "source_only",
        updatedAt: "2026-07-01T00:00:00.000Z",
      }),
      row({
        id: "requested-1",
        status: "not_requested",
        mission: "publication_preparation",
        updatedAt: "2026-08-01T00:00:05.000Z",
      }),
    ],
    limit: 2,
  });

  assert.deepEqual(selected.map((item) => item.id), ["retry-1", "requested-1"]);
});

test("les deux requêtes sont séparées et l'index partiel exclut source_only", () => {
  const queue = read("lib/mediaNormalizationRepairQueue.ts");
  const videoQueue = read("lib/mediaVideoNormalizationQueue.ts");
  const sql = read("ops/sql/2026-08-05_media_normalization_repair_queue_hardening.sql");

  assert.match(queue, /\.eq\("processing_status", "failed_retryable"\)/);
  assert.match(queue, /\.eq\("processing_status", "not_requested"\)/);
  assert.match(queue, /media_metadata->>pipeline_mission/);
  assert.match(
    queue,
    /\.eq\("processing_status", "failed_retryable"\)[\s\S]{0,120}\.gte\("pipeline_version", minimumPipelineVersion\)/,
  );
  assert.match(
    queue,
    /\.eq\("processing_status", "not_requested"\)[\s\S]{0,120}\.gte\("pipeline_version", minimumRequestedPipelineVersion\)/,
  );
  assert.doesNotMatch(queue, /\.in\("processing_status"/);
  assert.match(
    videoQueue,
    /minimumRequestedPipelineVersion:\s*UNIVERSAL_MEDIA_PIPELINE_VERSION/,
  );
  assert.match(sql, /pro_media_library_requested_repair_idx/);
  assert.match(sql, /processing_status = 'not_requested'/);
  assert.match(sql, /'ai_preparation'/);
  assert.match(sql, /'publication_preparation'/);
  assert.doesNotMatch(sql, /'source_metadata'/);
});

test("le scan image reste espacé et le worker vidéo tourne chaque minute", () => {
  const imageCron = read("app/api/cron/media-image-normalization/route.ts");
  const videoCron = read("app/api/cron/media-video-normalization/route.ts");
  const vercel = JSON.parse(read("vercel.json"));
  const schedules = new Map(
    vercel.crons.map((item: { path: string; schedule: string }) => [
      item.path,
      item.schedule,
    ]),
  );
  assert.doesNotMatch(imageCron, /setInterval|shouldRepairQueue/);
  assert.doesNotMatch(videoCron, /setInterval|shouldRepairQueue/);
  assert.match(imageCron, /processImageNormalizationJobs/);
  assert.match(videoCron, /processVideoNormalizationJobs/);
  assert.equal(schedules.get("/api/cron/media-image-normalization"), "2-59/5 * * * *");
  assert.equal(schedules.get("/api/cron/media-video-normalization"), "*/1 * * * *");
});
