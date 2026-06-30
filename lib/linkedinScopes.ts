import "server-only";

const DEFAULT_LINKEDIN_SCOPES = [
  "r_basicprofile",
  "w_member_social",
  "w_member_social_feed",
  "rw_organization_admin",
  "r_organization_social",
  "w_organization_social",
  "r_organization_followers",
  "r_organization_social_feed",
  "w_organization_social_feed",
  "r_member_postAnalytics",
  "r_member_profileAnalytics",
  "r_1st_connections_size",
];

const LINKEDIN_SCOPE_ALLOWLIST = new Set(DEFAULT_LINKEDIN_SCOPES);

const LEGACY_LINKEDIN_SCOPES_TO_IGNORE = new Set([
  "openid",
  "profile",
  "email",
  "r_emailaddress",
  "r_liteprofile",
]);

function normalizeScopeList(raw: string) {
  return raw
    .replace(/&quot;/g, "")
    .replace(/["']/g, "")
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getLinkedInOAuthScope() {
  const overrideScopes = normalizeScopeList(
    process.env.LINKEDIN_SCOPE_OVERRIDES || "",
  ).filter(
    (scope) =>
      LINKEDIN_SCOPE_ALLOWLIST.has(scope) &&
      !LEGACY_LINKEDIN_SCOPES_TO_IGNORE.has(scope),
  );

  return [...DEFAULT_LINKEDIN_SCOPES, ...overrideScopes]
    .filter((scope, index, arr) => arr.indexOf(scope) === index)
    .join(" ");
}
