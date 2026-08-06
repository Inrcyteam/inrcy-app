import assert from "node:assert/strict";
import test from "node:test";

import {
  isMetaAuthorizationError,
  isMetaRateLimitError,
} from "../../lib/metaGraphErrorClassification.ts";
import { getProviderPublicationErrorMessage } from "../../lib/publicationErrorFrench.ts";

test("Facebook exposes an actionable message for a Meta rate limit", () => {
  assert.equal(
    getProviderPublicationErrorMessage(
      "facebook",
      "Application request limit reached",
    ),
    "Facebook limite temporairement les publications. Réessayez dans quelques minutes.",
  );
});

test("Facebook exposes an actionable message for a transient Meta failure", () => {
  assert.equal(
    getProviderPublicationErrorMessage(
      "facebook",
      "An unknown error has occurred. Please try again later.",
    ),
    "Facebook est temporairement indisponible. Réessayez dans quelques minutes.",
  );
});

test("Instagram uses the same actionable Meta transient mapping", () => {
  assert.equal(
    getProviderPublicationErrorMessage("instagram", "Service unavailable"),
    "Instagram est temporairement indisponible. Réessayez dans quelques minutes.",
  );
});

test("Meta code 4 is a temporary quota, never a reconnect error", () => {
  const graphError = {
    message: "Application request limit reached",
    type: "OAuthException",
    code: 4,
    subcode: 2207051,
    httpStatus: 403,
  };
  assert.equal(isMetaRateLimitError(graphError), true);
  assert.equal(isMetaAuthorizationError(graphError), false);
  assert.equal(
    getProviderPublicationErrorMessage("instagram", graphError.message),
    "Instagram limite temporairement les publications. Réessayez dans quelques minutes.",
  );
});
