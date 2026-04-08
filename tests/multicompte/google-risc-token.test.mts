import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractSecurityEventToken, parseJwt, tokenMatchesIdentifier } from "../../lib/security/googleRiscTestables";

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

test("extractSecurityEventToken lit un JWT brut ou encapsulé en JSON", () => {
  const token = [
    b64urlJson({ alg: "RS256", kid: "kid-1", typ: "secevent+jwt" }),
    b64urlJson({ iss: "https://accounts.google.com", aud: "client-id" }),
    "signature",
  ].join(".");

  assert.equal(extractSecurityEventToken(token), token);
  assert.equal(extractSecurityEventToken(JSON.stringify({ jwt: token })), token);
  assert.equal(extractSecurityEventToken(JSON.stringify({ security_event_token: token })), token);
  assert.equal(extractSecurityEventToken("{}"), null);
});

test("parseJwt décode correctement header et payload", () => {
  const token = [
    b64urlJson({ alg: "RS256", kid: "kid-42", typ: "secevent+jwt" }),
    b64urlJson({ iss: "https://accounts.google.com", aud: ["client-a"], jti: "evt-1" }),
    Buffer.from("sig", "utf8").toString("base64url"),
  ].join(".");

  const parsed = parseJwt(token);
  assert.equal(parsed.header.kid, "kid-42");
  assert.deepEqual(parsed.payload.aud, ["client-a"]);
  assert.equal(parsed.payload.jti, "evt-1");
});

test("tokenMatchesIdentifier gère prefix et SHA-256", () => {
  const token = "sample-google-token-value";
  const prefix = token.slice(0, 16);
  const hashUrl = createHash("sha256").update(token, "utf8").digest("base64url");
  const hashB64 = createHash("sha256").update(token, "utf8").digest("base64");
  const hashHex = createHash("sha256").update(token, "utf8").digest("hex");

  assert.equal(tokenMatchesIdentifier(token, "prefix", prefix), true);
  assert.equal(tokenMatchesIdentifier(token, "hash_sha256", hashUrl), true);
  assert.equal(tokenMatchesIdentifier(token, "hash_sha256", hashB64), true);
  assert.equal(tokenMatchesIdentifier(token, "sha256", hashHex), true);
  assert.equal(tokenMatchesIdentifier(token, "prefix", "wrong"), false);
});
