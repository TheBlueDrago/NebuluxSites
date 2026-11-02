// Offline test: with no connection (or a server error page instead of JSON), the account and billing pages'
// requests answer with a plain-words error, so buttons say what happened instead of silently doing nothing,
// and a page that can't load shows Try again instead of "Loading…" forever.
// Run: node scripts/test-offline.mjs
import { readFileSync } from "node:fs";
const assert = (c, m) => {
  if (!c) {
    console.error("FAIL", m);
    process.exitCode = 1;
  } else console.log("ok", m);
};
const root = new URL("../public/", import.meta.url);
for (const page of ["account.html", "billing.html"]) {
  const html = readFileSync(new URL(page, root), "utf8");
  const net = html.match(/^const NETERR = .*$/m), post = html.match(/^const post = .*$/m);
  assert(net && post, `${page}: has the request helper and its no-connection words`);
  if (!net || !post) continue;
  const make = (fetchImpl, online = true) => new Function("fetch", "navigator", `${net[0]}\n${post[0]}\nreturn post;`)(fetchImpl, { onLine: online });
  const json = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let r = await make(async () => { throw new TypeError("Failed to fetch"); })("/api/x", {});
  assert(r.ok === false && r.error === "Couldn't reach Nebulux Sites. Check your connection and try again.", `${page}: no answer at all says Couldn't reach Nebulux Sites`);
  r = await make(async () => { throw new TypeError("Failed to fetch"); }, false)("/api/x", {});
  assert(r.ok === false && /^You're offline/.test(r.error), `${page}: offline says You're offline`);
  r = await make(async () => new Response("<html>502</html>", { status: 502 }))("/api/x", {});
  assert(r.ok === false && /on our side/.test(r.error), `${page}: a server error page says something went wrong on our side`);
  r = await make(json(400, { error: "Type a message." }))("/api/x", {});
  assert(r.ok === false && r.error === "Type a message.", `${page}: the server's own message is kept`);
  r = await make(json(200, { ok: true, id: "NS-1" }))("/api/x", {});
  assert(r.ok === true && r.id === "NS-1" && !r.error, `${page}: a good answer comes through as before`);
  assert(/\nstart\(\)\.catch\(\(\) => \{[^\n]*Try again/.test(html), `${page}: if the page can't load, it shows Try again instead of loading forever`);
}
