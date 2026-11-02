// Offline test: every text box, list and picker on the customer pages has a name that screen readers say
// (a <label>, aria-label or title), not just a placeholder, which disappears as soon as you type.
// The owner's admin page isn't checked. Run: node scripts/test-labels.mjs
import { readFileSync, readdirSync } from "node:fs";
const assert = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    process.exitCode = 1;
  } else console.log("ok", m);
};
const dir = new URL("../public/", import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".html") && x !== "admin.html")) {
  const s = readFileSync(new URL(f, dir), "utf8");
  const forIds = new Set([...s.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  const missing = [];
  for (const m of s.matchAll(/<(input|textarea|select)\b([^>]*)>/g)) {
    const a = m[2];
    if (/type="(hidden|submit|button|radio|checkbox)"/.test(a) || /\bclass="hp"/.test(a)) continue;
    if (/aria-label=|aria-labelledby=|\btitle=/.test(a)) continue;
    const id = (a.match(/\bid="([^"]+)"/) || [])[1];
    if (id && forIds.has(id)) continue;
    const before = s.slice(Math.max(0, m.index - 600), m.index);
    if (before.lastIndexOf("<label") > before.lastIndexOf("</label>")) continue; // inside its <label>
    missing.push(m[0].slice(0, 70));
  }
  assert(!missing.length, `${f}: every input has a name for screen readers` + (missing.length ? ": " + missing.join(" | ") : ""));
}
