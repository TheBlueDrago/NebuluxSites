// Offline test of the second pre-launch list (src/worker.js and the pages): visit counts and the owner's view,
// Download my data, the first-time tour, the What's new page and the deleted-account email.
// Run: node scripts/test-launch2.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import worker, { hitPath } from "../src/worker.js";

let failed = 0;
const assert = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } else console.log("ok", m); };
const page = (f) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
function d1() {
  const sql = new DatabaseSync(":memory:");
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    first: async () => { const r = sql.prepare(q).get(...args); return r === undefined ? null : { ...r }; },
    all: async () => ({ results: sql.prepare(q).all(...args).map((r) => ({ ...r })) }),
    run: async () => (/^\s*(select|pragma)/i.test(q) ? { results: sql.prepare(q).all(...args) } : { meta: { changes: sql.prepare(q).run(...args).changes } }),
  });
  return { prepare: (q) => stmt(q), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; }, raw: sql };
}
{ const m = new Map(); globalThis.caches = { default: { match: async (r) => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => { m.set(r.url, await res.text()); } } }; }
const db = d1(), HOST = "https://nebuluxsites.thebluedragonstriker.workers.dev", mails = [];
globalThis.fetch = async (url, init = {}) => { if (String(url).includes("api.resend.com")) { mails.push(JSON.parse(init.body)); return new Response("{}"); } throw new Error("unexpected fetch " + url); };
const env = { DB: db, RESEND_API_KEY: "test", OWNER_EMAIL: "owner@known.com", MAINTENANCE: "off", ADMIN_KEY: "k", ASSETS: { fetch: async () => new Response("asset") } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const raw = (path, body, { token = "", ip = "1.1.1.1", admin = false, ua = "Mozilla/5.0 Chrome/130" } = {}) =>
  worker.fetch(new Request(HOST + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: HOST, "cf-connecting-ip": ip, "user-agent": ua, ...(admin ? { "x-admin-key": "k" } : {}), ...(token ? { cookie: "ns_session=" + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
const call = async (...a) => { const r = await raw(...a); return [r.status, await r.json().catch(() => ({}))]; };
await call("/api/packages");
db.raw.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run("u1", "ann@known.com", "Ann", "2026-11-01T00:00:00.000Z");
db.raw.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run("u2", "bo@known.com", "Bo", "2026-11-02T00:00:00.000Z");
db.raw.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha("ann-token"), "u1", Date.now() + 3600e3);
db.raw.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha("bo-token"), "u2", Date.now() + 3600e3);

// ---- visit counts ----
assert(hitPath("/ready.html?x=1#top") === "/ready" && hitPath("/") === "/" && hitPath("/demo/golden-batch/menu.html") === "/demo", "pages are counted by their plain address");
assert(hitPath("/admin.html") === null && hitPath("/api/orders") === null && hitPath("/whatever<script>") === null, "the admin page and unknown addresses aren't counted");
await call("/api/hit", { p: "/", f: true });
await call("/api/hit", { p: "/ready.html", f: false });
await call("/api/hit", { p: "/account.html", f: false });
await call("/api/hit", { p: "/", f: true }, { ip: "2.2.2.2" });
await call("/api/hit", { p: "/", f: true }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" });
await call("/api/hit", { p: "/secret-page", f: true });
let [st, r] = await call("/api/admin/visits", null, { admin: true });
const today = r.days[r.days.length - 1];
assert(st === 200 && r.days.length === 14 && today.visitors === 2 && today.views === 4, "the owner sees visitors and pages opened by day (crawlers and unknown pages aren't counted)");
assert(r.pages[0].path === "/" && r.pages[0].views === 2, "the most opened page is first");
assert(r.funnel.map((f) => f.label).join() === "Visited,Opened the account page,Made an account,Sent a request,Paid" && r.funnel[0].n === 2 && r.funnel[1].n === 1 && r.funnel[3].n === 0, "where people stop, step by step");
assert((await call("/api/admin/visits"))[0] === 403, "only the owner can read the counts");
[st, r] = await call("/api/order", { package: "onetime", details: "A website for my bakery with a menu and a contact page." }, { token: "ann-token" });
assert(st === 200, "an order goes in");
[st, r] = await call("/api/admin/visits", null, { admin: true });
assert(r.funnel[3].n === 1, "sending a request is counted as a step");
assert(db.raw.prepare("PRAGMA table_info(hits)").all().map((c) => c.name).join() === "day,path,n,uniq", "the table holds counts and nothing about a person");
const help = page("help.js");
assert(/doNotTrack === "1"/.test(help) && /globalPrivacyControl/.test(help) && /\/api\/hit/.test(help) && !/document\.cookie/.test(help), "the page counter honors Do Not Track and uses no cookie");
assert(page("admin.html").includes('id="visBox"') && page("admin.html").includes("Where people stop"), "the admin page has a Visitors view");

// ---- Download my data ----
const annOrder = db.raw.prepare("SELECT id FROM orders WHERE user_id = 'u1'").get().id;
db.raw.prepare("INSERT INTO messages (order_id, sender, text, at) VALUES (?, 'user', 'When will it be ready?', ?)").run(annOrder, new Date().toISOString());
db.raw.prepare("INSERT INTO orders (id, user_id, email, name, package, price, kind, details, status, created_at) VALUES ('NS-BO', 'u2', 'bo@known.com', 'Bo', 'onetime', 199, 'shop', 'Bo private details', 'in review', ?)").run(new Date().toISOString());
const res = await raw("/api/account/export", null, { token: "ann-token" });
const text = await res.text(), file = JSON.parse(text);
assert(res.status === 200 && /attachment; filename="nebulux-sites-my-data.json"/.test(res.headers.get("content-disposition")), "Download my data gives a file");
assert(file.account.email === "ann@known.com" && file.requests.length === 1 && /bakery/.test(file.requests[0].details) && file.messages.length === 1, "with the account, its requests and its messages");
assert(!text.includes("Bo private") && !text.includes("bo@known.com"), "and nobody else's");
assert(!/pw_hash|pw_salt|token_hash/.test(text), "no password or sign-in secrets are in the file");
assert((await raw("/api/account/export")).status === 401, "you have to be logged in");
assert(page("account.html").includes('href="/api/account/export"') && page("account.html").includes("Download my data"), "the account menu has Download my data");

// ---- delete my account: one last email ----
db.raw.prepare("DELETE FROM orders WHERE user_id = 'u2'").run();
mails.length = 0;
[st, r] = await call("/api/account/delete", { email: "bo@known.com" }, { token: "bo-token" });
assert(st === 200 && mails.some((m) => m.to[0] === "bo@known.com" && /account was deleted/.test(m.subject)), "a deleted account gets one last email");
assert(!db.raw.prepare("SELECT 1 FROM users WHERE id = 'u2'").get(), "and the account is gone");

// ---- the tour, What's new, share cards ----
const acct = page("account.html");
assert(/function tour\(user\)/.test(acct) && /id="tourSkip"/.test(acct) && /localStorage\.setItem\(key, "1"\)/.test(acct) && /tour\(user\);/.test(acct), "a first-time tour shows after logging in, and Skip closes it for good in one tap");
assert((acct.match(/\["[^"]+", "[^"]+"\],/g) || []).length >= 4, "the tour has a few short steps");
const wn = page("whats-new.html");
assert(/<title>What's new/.test(wn) && /name="description"/.test(wn) && /og:image/.test(wn) && /twitter:card/.test(wn) && /© 2026 Nebulux LLC/.test(wn), "the What's new page has a description, a share card and the LLC footer");
const dates = [...wn.matchAll(/datetime="([\d-]+)"/g)].map((m) => m[1]);
assert(dates.length >= 3 && dates.join() === [...dates].sort().reverse().join(), "newest first");
assert(page("sitemap.xml").includes("/whats-new</loc>") && page("index.html").includes('href="/whats-new.html"'), "it's in the sitemap and linked from the home page");
for (const f of ["index.html", "ready.html", "examples.html", "whats-new.html"]) { const h = page(f); assert(/name="description" content="[^"]{30,}/.test(h) && /og:title/.test(h) && /og:image/.test(h) && /twitter:card/.test(h) && !/noindex/.test(h), f + " has a description and a share card, and can be indexed"); }
const rb = page("robots.txt");
assert(/Sitemap: https:\/\//.test(rb) && /Disallow: \/admin\.html/.test(rb) && /Allow: \//.test(rb), "robots.txt lets crawlers in and names the sitemap");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
