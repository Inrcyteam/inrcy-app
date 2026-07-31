import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BOOSTER_PUBLICATION_CHANNELS,
  NON_RETRYABLE_BOOSTER_PUBLISH_CODES,
  isBoosterPublishFailureRetryable,
  normalizeBoosterPublicationChannels,
} from "../../lib/boosterPublicationPolicy.ts";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function indexOfOrFail(source: string, marker: string) {
  const index = source.indexOf(marker);
  assert.notEqual(index, -1, `Missing marker: ${marker}`);
  return index;
}

const route = read("app/api/booster/publish-now/route.ts");
const foundations = read("app/api/booster/publish-now/publishNow.foundations.ts");
const asyncPublication = read("lib/boosterAsyncPublication.ts");

const lockAcquisitionMarker = "const publishIdempotency = internalAsyncDispatch";

test("the runtime channel policy accepts only the ten supported channels", () => {
  assert.equal(BOOSTER_PUBLICATION_CHANNELS.length, 10);
  assert.deepEqual(
    normalizeBoosterPublicationChannels([
      " facebook ",
      "facebook",
      "instagram",
      "unknown",
      "unknown",
      null,
    ]),
    {
      channels: ["facebook", "instagram"],
      invalidChannels: ["unknown", "(vide)"],
    },
  );
});

test("unsupported and terminal publication failures are never retryable", () => {
  for (const code of NON_RETRYABLE_BOOSTER_PUBLISH_CODES) {
    assert.equal(
      isBoosterPublishFailureRetryable({ ok: false, code }),
      false,
      `${code} must remain terminal`,
    );
  }
  assert.equal(
    isBoosterPublishFailureRetryable({ ok: false, code: "network_timeout" }),
    true,
  );
  assert.equal(
    isBoosterPublishFailureRetryable({
      ok: false,
      code: "network_timeout",
      retryable: false,
    }),
    false,
  );
  assert.equal(
    isBoosterPublishFailureRetryable({ ok: true, code: "network_timeout" }),
    false,
  );
});

test("publish-now rejects unknown or empty channels before persistence and locking", () => {
  assert.match(route, /normalizeBoosterPublicationChannels\(\s*body\.channels/);
  assert.match(route, /code:\s*"unsupported_channel"/);
  assert.match(route, /retryable:\s*false/);
  assert.match(route, /code:\s*"channels_required"/);
  assert.doesNotMatch(
    route,
    /Array\.isArray\(body\.channels\)[\s\S]{0,120}as ChannelKey\[\]/,
  );

  const validationIndex = indexOfOrFail(
    route,
    "if (normalizedChannels.invalidChannels.length > 0)",
  );
  const requiredIndex = indexOfOrFail(route, "if (!selected.length)");
  const lockIndex = indexOfOrFail(route, lockAcquisitionMarker);
  const publicationInsertIndex = indexOfOrFail(
    route,
    '.from("publications")',
  );

  assert.ok(validationIndex < lockIndex);
  assert.ok(requiredIndex < lockIndex);
  assert.ok(validationIndex < publicationInsertIndex);
});

test("video payload validation completes before the parent idempotency lock", () => {
  const payloadErrorIndex = indexOfOrFail(
    route,
    "if (hasAnyVideoChannel && videoPayloadError)",
  );
  const missingVideoIndex = indexOfOrFail(
    route,
    "if (hasAnyVideoChannel && !publicationVideo)",
  );
  const lockIndex = indexOfOrFail(route, lockAcquisitionMarker);

  assert.ok(payloadErrorIndex < lockIndex);
  assert.ok(missingVideoIndex < lockIndex);
  assert.equal(
    route.match(/if \(hasAnyVideoChannel && videoPayloadError\)/g)?.length,
    1,
  );
  assert.equal(
    route.match(/if \(hasAnyVideoChannel && !publicationVideo\)/g)?.length,
    1,
  );
});

test("unexpected parent failures explicitly close the acquired idempotency lock", () => {
  assert.match(route, /let publishIdempotencyLockId: string \| null = null/);
  assert.match(route, /let shouldFailPublishIdempotencyLockOnError = false/);
  assert.match(
    route,
    /shouldFailPublishIdempotencyLockOnError =\s*!internalAsyncDispatch && Boolean\(publishIdempotencyLockId\)/,
  );
  assert.match(
    route,
    /if \(\s*shouldFailPublishIdempotencyLockOnError &&\s*publishIdempotencyLockId\s*\) \{[\s\S]*failExecutionIdempotencyLock\([\s\S]*stage: "unhandled_exception"/,
  );
  assert.match(route, /shouldFailPublishIdempotencyLockOnError = false;[\s\S]*return NextResponse\.json\(responsePayload\)/);
});

test("unsupported channel fallback is terminal and updates its durable delivery", () => {
  assert.match(
    route,
    /const unsupportedChannelMessage =[\s\S]*await setDelivery\(ch, \{[\s\S]*status: "failed"[\s\S]*code: "unsupported_channel"[\s\S]*retryable: false/,
  );
});

test("synchronous and asynchronous summaries share the same retry policy", () => {
  assert.match(foundations, /isBoosterPublishFailureRetryable\(\{/);
  assert.match(asyncPublication, /isBoosterPublishFailureRetryable\(\{/);
  assert.match(asyncPublication, /isBoosterPublicationChannel\(channel\)/);
  assert.doesNotMatch(asyncPublication, /const CHANNEL_LABELS:/);
});
