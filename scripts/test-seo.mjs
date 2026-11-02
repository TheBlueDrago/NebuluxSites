// Offline test: what search engines read. Every address in the sitemap is the final one (the site turns
// /ready.html into /ready with a redirect, and Google wants the address it lands on), each of those pages
// names that same address as its canonical one, and the private pages ask not to be listed.
// Run: node scripts/test-seo.mjs
import { readFileSync } from "node:fs";
const assert = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    process.exitCode = 1;
  } else console.log("ok", m);
};
const read = (p) => readFileSync(new URL("../public/" + p, import.meta.url), "utf8");
const sitemap = read("sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert(locs.length >= 3 && locs.every((u) => !/\.html$/.test(u)), "the sitemap lists final addresses, not ones that redirect");
for (const u of locs) {
  const file = new URL(u).pathname === "/" ? "index.html" : new URL(u).pathname.slice(1) + ".html";
  assert(read(file).includes(`<link rel="canonical" href="${u}">`), `${file} names ${u} as its one true address`);
}
assert(read("robots.txt").includes("Sitemap: " + new URL("/sitemap.xml", locs[0]).href), "robots.txt points to the sitemap");
for (const f of ["account.html", "billing.html", "admin.html", "404.html"]) assert(/<meta name="robots" content="noindex">/.test(read(f)), `${f} asks search engines not to list it`);
