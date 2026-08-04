import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildBoosterPublicationDispatchPlan } from "../../lib/boosterPublicationDispatchPlan.ts";
import { getAutomaticVideoSettingsForPublication } from "../../lib/boosterVideoSettings.ts";
import {
  getYoutubePublicationTypeForDuration,
  validateVideoDurationForChannel,
} from "../../lib/videoPublicationPolicy.ts";

const ROOT = new URL("../../", import.meta.url);
const read = async (relativePath: string) =>
  await readFile(new URL(relativePath, ROOT), "utf8");

test("les bornes de durée statiques sont inclusives et isolées par canal", () => {
  const cases = [
    { channel: "gmb", minOk: 1, maxOk: 30, invalid: 31 },
    { channel: "facebook", minOk: 1, maxOk: 14_400, invalid: 14_401 },
    { channel: "instagram", minOk: 3, maxOk: 900, invalid: 901 },
    { channel: "linkedin", minOk: 3, maxOk: 1_800, invalid: 1_801 },
    { channel: "pinterest", minOk: 4, maxOk: 900, invalid: 901 },
    { channel: "tiktok", minOk: 1, maxOk: 600, invalid: 601 },
    { channel: "youtube_shorts", minOk: 1, maxOk: 43_200, invalid: 43_201 },
  ] as const;

  for (const entry of cases) {
    assert.equal(
      validateVideoDurationForChannel({
        channel: entry.channel,
        durationSeconds: entry.minOk,
      }).ok,
      true,
      `${entry.channel} doit accepter sa borne basse`,
    );
    assert.equal(
      validateVideoDurationForChannel({
        channel: entry.channel,
        durationSeconds: entry.maxOk,
      }).ok,
      true,
      `${entry.channel} doit accepter sa borne haute`,
    );
    const invalid = validateVideoDurationForChannel({
      channel: entry.channel,
      durationSeconds: entry.invalid,
    });
    assert.equal(invalid.ok, false, `${entry.channel} doit refuser le dépassement`);
    if (!invalid.ok) {
      assert.equal(invalid.reason, "video_duration_too_long");
      assert.match(invalid.message, /bloqué/i);
      assert.match(invalid.message, /Règle/i);
    }
  }
});

test("les minima Instagram, LinkedIn et Pinterest affichent la durée réelle et la règle", () => {
  for (const [channel, duration] of [
    ["instagram", 2],
    ["linkedin", 2],
    ["pinterest", 3],
  ] as const) {
    const validation = validateVideoDurationForChannel({
      channel,
      durationSeconds: duration,
    });
    assert.equal(validation.ok, false);
    if (!validation.ok) {
      assert.equal(validation.reason, "video_duration_too_short");
      assert.match(validation.message, new RegExp(`${duration} s`));
      assert.match(validation.message, new RegExp(`Règle .*${channel === "pinterest" ? "4 secondes" : "3 secondes"}`, "i"));
    }
  }
});

test("TikTok applique la limite réelle du compte et bloque si elle ne peut pas être vérifiée", () => {
  const accountLimit = validateVideoDurationForChannel({
    channel: "tiktok",
    durationSeconds: 181,
    tiktokMaxDurationSeconds: 180,
    tiktokAccountLimitVerified: true,
    enforceAccountCapabilities: true,
  });
  assert.equal(accountLimit.ok, false);
  if (!accountLimit.ok) {
    assert.equal(accountLimit.reason, "video_duration_too_long");
    assert.match(accountLimit.message, /3 min maximum pour le compte TikTok connecté/i);
  }

  const unknownLimit = validateVideoDurationForChannel({
    channel: "tiktok",
    durationSeconds: 120,
    tiktokAccountLimitVerified: false,
    enforceAccountCapabilities: true,
  });
  assert.equal(unknownLimit.ok, false);
  if (!unknownLimit.ok) {
    assert.equal(unknownLimit.reason, "video_duration_account_limit_unknown");
    assert.match(unknownLimit.message, /actualisez puis réessayez/i);
  }
});

test("YouTube choisit le type par durée sans imposer une conversion 9:16", () => {
  assert.equal(getYoutubePublicationTypeForDuration(180), "short");
  assert.equal(getYoutubePublicationTypeForDuration(181), "video");
  assert.deepEqual(
    getAutomaticVideoSettingsForPublication({
      channel: "youtube_shorts",
      settings: { format: "original", adaptationMode: "cover_crop" },
      durationSeconds: 180,
    }),
    { format: "original", adaptationMode: "cover_crop" },
  );
  assert.deepEqual(
    getAutomaticVideoSettingsForPublication({
      channel: "youtube_shorts",
      settings: { format: "16_9", adaptationMode: "cover_crop" },
      durationSeconds: 181,
    }),
    { format: "16_9", adaptationMode: "cover_crop" },
  );
});

test("YouTube contrôle l'autorisation des vidéos de plus de 15 minutes", () => {
  assert.equal(
    validateVideoDurationForChannel({
      channel: "youtube_shorts",
      durationSeconds: 901,
      youtubeLongUploadsStatus: "allowed",
      enforceAccountCapabilities: true,
    }).ok,
    true,
  );
  for (const status of ["eligible", "disallowed"] as const) {
    const validation = validateVideoDurationForChannel({
      channel: "youtube_shorts",
      durationSeconds: 901,
      youtubeLongUploadsStatus: status,
      enforceAccountCapabilities: true,
    });
    assert.equal(validation.ok, false);
    if (!validation.ok) {
      assert.equal(validation.reason, "video_duration_long_upload_not_allowed");
      assert.match(validation.message, /dépasse 15 minutes/i);
    }
  }
});

test("un canal bloqué par durée ne retire jamais les autres du dispatch", () => {
  const plan = buildBoosterPublicationDispatchPlan(
    ["site_web", "facebook", "pinterest", "youtube_shorts"],
    {
      pinterest: {
        ok: false,
        code: "video_duration_too_long",
        error: "Pinterest bloqué — règle de durée dépassée.",
        retryable: false,
      },
    },
  );
  assert.deepEqual(plan.dispatchableChannels, [
    "site_web",
    "facebook",
    "youtube_shorts",
  ]);
  assert.deepEqual(plan.failedChannels, ["pinterest"]);
});

test("la conversion réseau normalise codec, audio, FPS, dimensions et interdit le fallback brut", async () => {
  const server = await read("lib/boosterVideoVariantServer.ts");
  const publish = await read("app/api/booster/publish-now/route.ts");
  const shared = await read(
    "app/dashboard/booster/publier/publishModal.shared.tsx",
  );

  assert.match(server, /CHANNEL_VIDEO_VARIANT_PIPELINE_VERSION = 7/);
  assert.match(server, /"libx264"/);
  assert.match(server, /"aac"/);
  assert.match(server, /"-r",\s*"30"/);
  assert.match(server, /ih\/2\.4/);
  assert.match(server, /iw\/2\.4/);
  assert.doesNotMatch(server, /"-shortest"/);
  assert.match(server, /"-t"/);
  assert.match(server, /getVideoTargetBitrateKbps/);
  assert.match(server, /variant\.publicationProfile === "light_background"/);
  assert.doesNotMatch(publish, /requiresPreparedNetworkVideoVariant/);
  assert.match(publish, /video_conversion_failed|video_conversion_or_probe_failed/);
  assert.match(shared, /validateVideoDurationForChannel/);
  assert.match(shared, /mediaBlockerCodes/);
  assert.doesNotMatch(
    publish,
    /Facebook a publié le texte, mais la vidéo n'a pas pu être jointe/,
  );
  assert.doesNotMatch(
    publish,
    /LinkedIn a publié le texte, mais la vidéo n'a pas pu être jointe/,
  );
});
