import "server-only";

const DEFAULT_LINKEDIN_SCOPES = [
  "r_basicprofile",
  "w_member_social",
  "rw_organization_admin",
  "r_organization_social",
  "w_organization_social",
  "r_organization_followers",
  "r_organization_social_feed",
  "w_organization_social_feed",
  "r_member_postAnalytics",
  "r_member_profileAnalytics",
];

export function getLinkedInOAuthScope() {
  const raw = process.env.LINKEDIN_SCOPE_OVERRIDES || DEFAULT_LINKEDIN_SCOPES.join(" ");
  return raw
    .replace(/&quot;/g, "")
    .replace(/["']/g, "")
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .filter((scope, index, arr) => arr.indexOf(scope) === index)
    .join(" ");
}
