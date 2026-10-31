// Every script on Nebulux Sites' pages parses: the inline <script> blocks in public/*.html and the
// public/*.js files. (An icon with the wrong quotes inside a JS string once broke the whole account page.)
// Run: node scripts/test-pages-js.mjs
import fs from "node:fs";
import vm from "node:vm";

const dir = new URL("../public/", import.meta.url);
let failed = 0, checked = 0;
for (const f of fs.readdirSync(dir).filter((n) => /\.(html|js)$/.test(n))) {
  const text = fs.readFileSync(new URL(f, dir), "utf8");
  const scripts = f.endsWith(".js") ? [text] : f.endsWith(".html") ? [...text.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]) : [];
  scripts.forEach((code, i) => {
    checked++;
    try { new vm.Script(code, { filename: f }); } catch (e) { failed++; console.error(`FAIL ${f}${f.endsWith(".html") ? ` script ${i + 1}` : ""}: ${e.message}`); }
  });
}
console.log(failed ? `${failed} of ${checked} scripts don't parse` : `ok all ${checked} page scripts parse`);
if (failed) process.exit(1);
