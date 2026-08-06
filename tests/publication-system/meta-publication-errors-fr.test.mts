import assert from "node:assert/strict";
import test from "node:test";

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
