import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMailDeliveryError,
  parseRetryAfterMs,
} from "../../lib/mailDeliveryErrors.ts";

test("Retry-After en secondes est respecte", () => {
  assert.equal(parseRetryAfterMs("120"), 120_000);
});

test("une limitation globale met la boite en pause", () => {
  const error = normalizeMailDeliveryError(
    "Too many requests",
    "gmail",
    429,
    "300",
  );
  assert.equal(error.kind, "rate_limited");
  assert.equal(error.accountLevel, true);
  assert.equal(error.retryable, true);
  assert.equal(error.retryAfterMs, 300_000);
});

test("un SMTP 450 reste une erreur temporaire du destinataire", () => {
  const error = normalizeMailDeliveryError(
    "450 4.2.0 Mailbox temporarily unavailable",
    "imap",
  );
  assert.equal(error.kind, "temporary_recipient");
  assert.equal(error.accountLevel, false);
  assert.equal(error.retryable, true);
  assert.equal(error.providerStatus, 450);
});

test("un SMTP 535 demande une reconnexion et ne devient pas un echec destinataire", () => {
  const error = normalizeMailDeliveryError(
    "535 5.7.1 Authentication failed",
    "imap",
  );
  assert.equal(error.kind, "auth_required");
  assert.equal(error.accountLevel, true);
  assert.equal(error.retryable, false);
});

test("les codes Gmail de quota sont reconnus sans espaces", () => {
  const error = normalizeMailDeliveryError(
    '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
    "gmail",
    403,
  );
  assert.equal(error.kind, "rate_limited");
  assert.equal(error.accountLevel, true);
  assert.equal(error.retryable, true);
});
