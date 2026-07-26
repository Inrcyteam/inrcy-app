import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("stable internal logo URLs remain on the public iNrSearch origin", () => {
  const source = read("lib/inrSearchPublic.ts");
  assert.match(source, /raw\.startsWith\("\/"\)\s*\?\s*new URL\(raw, PUBLIC_ORIGIN\)/);
  assert.match(source, /channelStates\.site_inrcy\.url\s*\|\|\s*channelStates\.site_web\.url/);
});

test("gallery labels are generated from reliable public profile context", () => {
  const source = read("app/entreprises/[slug]/InrSearchGalleryOrbit.tsx");
  const pageSource = read("app/entreprises/[slug]/page.tsx");
  assert.doesNotMatch(source, /item\?\.title/);
  assert.match(source, /function stableHash\(value: string\)/);
  assert.match(source, /const servicePool = uniqueLabels\(services\.length \? services : \[profession\]\)/);
  assert.match(source, /const zonePool = uniqueLabels\(zones\.length \? zones : \[city\]\)/);
  assert.match(source, /stableHash\(`\$\{companyName\}:\$\{item\.id\}`\)/);
  assert.match(source, /`\$\{subject\} — \$\{companyName\}`/);
  assert.match(pageSource, /services=\{data\.services\}/);
  assert.match(pageSource, /zones=\{data\.zones\}/);
  assert.doesNotMatch(source, /return `Média \$\{/);
  assert.doesNotMatch(source, /Math\.random/);
});

test("metadata enriches default company-only titles and avoids duplicated identity leads", () => {
  const source = read("app/entreprises/[slug]/page.tsx");
  assert.match(source, /normalizeMetaComparison\(customTitle\) === normalizeMetaComparison\(data\.companyName\)/);
  assert.match(source, /const title = resolveSeoTitle\(data\)/);
  assert.match(source, /normalizeMetaComparison\(lead\)\.startsWith\(normalizeMetaComparison\(identity\)\)/);
});

test("the public contact modal keeps keyboard focus inside the dialog", () => {
  const source = read("app/entreprises/[slug]/InrSearchContactOrbit.tsx");
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /modalRef\.current\?\.querySelectorAll/);
  assert.match(source, /document\.activeElement === last/);
});

test("public profile lists remove editorial bullets and leading conjunctions", () => {
  const publicData = read("lib/inrSearchPublic.ts");
  const publicPage = read("app/entreprises/[slug]/page.tsx");

  assert.match(publicData, /replace\(\/\^\(\?:\[-–—•·▪◦\*\]\+\|\\d\+\[\.\)\]\)\\s\*\/u, ""\)/);
  assert.match(publicData, /replace\(\/\^\(\?:et\|ou\)\\s\+\/iu, ""\)/);
  assert.match(publicData, /dans les zones suivantes/);
  assert.match(publicPage, /dans les zones suivantes/);
  assert.doesNotMatch(publicPage, /intervient notamment à \$\{joinFrenchList/);
  assert.match(publicPage, /"@type": "AdministrativeArea"/);
});
