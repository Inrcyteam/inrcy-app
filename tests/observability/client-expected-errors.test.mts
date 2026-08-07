import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isExpectedRateLimitError,
  isTransientBrowserNetworkError,
} from "../../lib/clientExpectedErrors.ts";

const sentryFilterSource = readFileSync(
  new URL("../../lib/observability/sentryEventFilter.ts", import.meta.url),
  "utf8",
);
const instrumentationClientSource = readFileSync(
  new URL("../../instrumentation-client.ts", import.meta.url),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL("../../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("the expected 429 message is recognized without weakening the limiter", () => {
  assert.equal(
    isExpectedRateLimitError(new Error("Trop de tentatives en peu de temps. Merci de réessayer dans quelques instants.")),
    true,
  );
  assert.equal(isExpectedRateLimitError(new Error("Permission refusée")), false);
});

test("Safari generic network interruptions are recognized narrowly", () => {
  assert.equal(isTransientBrowserNetworkError(new TypeError("Load failed")), true);
  assert.equal(isTransientBrowserNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(
    isTransientBrowserNetworkError(
      new TypeError("The network connection was lost."),
    ),
    true,
  );
  assert.equal(
    isTransientBrowserNetworkError(
      new TypeError("NetworkError when attempting to fetch resource."),
    ),
    true,
  );
  assert.equal(isTransientBrowserNetworkError(new Error("Validation failed")), false);
});

test("Sentry drops expected client noise only in the client configuration", () => {
  assert.match(instrumentationClientSource, /dropExpectedClientErrors: true/);
  assert.match(sentryFilterSource, /isHandledExceptionEvent\(event\) && isTransientBrowserNetworkError\(text\)/);
  assert.match(sentryFilterSource, /if \(isExpectedRateLimitError\(text\)\) return true;/);
});

test("dashboard background refreshes no longer promote handled network noise", () => {
  assert.match(dashboardSource, /reportHandledClientError\(err, "dashboard-kpis"\)/);
  assert.match(dashboardSource, /reportHandledClientError\(error, "dashboard-channel-refresh"\)/);
  assert.match(dashboardSource, /reportHandledClientError\(error, "dashboard-daily-bootstrap"\)/);
});
