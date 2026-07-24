import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

test("the public directory API never serves a stale membership response", () => {
  const route = read("app/api/public/inrsearch/directory/route.ts");

  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /export const revalidate = 0/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(route, /s-maxage|stale-while-revalidate/);
});

test("directory changes trigger an authenticated WordPress purge", () => {
  const cache = read("lib/inrSearchDirectoryCache.ts");
  const settings = read("app/api/inr-search/settings/route.ts");
  const settingsUi = read("app/dashboard/settings/_components/InrSearchSettingsContent.tsx");
  const adminTools = read("app/api/admin/tools/route.ts");

  assert.match(cache, /createHmac\("sha256", secret\)/);
  assert.match(cache, /update\(`\$\{timestamp\}\.\$\{body\}`\)/);
  assert.match(cache, /"X-iNrCy-Timestamp": timestamp/);
  assert.match(cache, /"X-iNrCy-Signature": signature/);
  assert.match(cache, /cache: "no-store"/);
  assert.match(settings, /await purgeInrSearchDirectoryCache/);
  assert.match(settings, /directory_enabled/);
  assert.match(settings, /directory_disabled/);
  assert.match(settingsUi, /payload\?\.directoryCache\?\.ok === false/);
  assert.match(adminTools, /await purgeInrSearchDirectoryCache\(\{ reason: "admin_access_changed" \}\)/);
});

test("the WordPress plugin invalidates every filter and page cache atomically", () => {
  const plugin = read("ops/wordpress-directory-plugin/inrcy-directory.php");

  assert.match(plugin, /Version: 1\.2\.0/);
  assert.match(plugin, /register_rest_route\(/);
  assert.match(plugin, /'\/directory-cache\/purge'/);
  assert.match(plugin, /hash_hmac\('sha256', \$timestamp \. '\.' \. \$request->get_body\(\), \$secret\)/);
  assert.match(plugin, /hash_equals\(\$expected, \$signature\)/);
  assert.match(plugin, /abs\(time\(\) - \(int\) \$timestamp\) > 300/);
  assert.match(plugin, /inrcy_directory_bump_cache_version\(\)/);
  assert.match(
    plugin,
    /'inrcy_directory_' \. inrcy_directory_cache_version\(\) \. '_' \. md5\(\$url\)/,
  );
});
