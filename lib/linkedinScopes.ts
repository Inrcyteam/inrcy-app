import "server-only";

const DEFAULT_LINKEDIN_SCOPES = [
  "r_liteprofile",
  "r_emailaddress",
  "w_member_social",
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
