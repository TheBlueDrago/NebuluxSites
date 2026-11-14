// Offline test of the pre-launch additions (src/worker.js and the pages): one sum for quotes and orders, the four
// order steps, Report a bug / request a feature, the live demo and previews. In-memory database, email faked.
// Run: node scripts/test-prelaunch.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import worker, { quoteFor, stageOf, STAGES, PACKAGES, ADDONS } from "../src/worker.js";

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
// the rate limiter keeps its counts in the Workers cache; here a Map stands in for it
{ const m = new Map(); globalThis.caches = { default: { match: async (r) => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => { m.set(r.url, await res.text()); } } }; }
const db = d1(), HOST = "https://nebuluxsites.thebluedragonstriker.workers.dev", mails = [];
globalThis.fetch = async (url, init = {}) => { if (String(url).includes("api.resend.com")) { mails.push(JSON.parse(init.body)); return new Response("{}"); } throw new Error("unexpected fetch " + url); };
const env = { DB: db, RESEND_API_KEY: "test", OWNER_EMAIL: "owner@known.com", MAINTENANCE: "off", ADMIN_KEY: "k", ASSETS: { fetch: async () => new Response("asset") } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const call = async (path, body, { token = "", ip = "1.1.1.1", admin = false, e = env } = {}) => {
  const r = await worker.fetch(new Request(HOST + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: HOST, "cf-connecting-ip": ip, ...(admin ? { "x-admin-key": "k" } : {}), ...(token ? { cookie: "ns_session=" + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), e);
  return [r.status, await r.json().catch(() => ({}))];
};
await call("/api/packages");
db.raw.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run("u1", "ann@known.com", "Ann", new Date(Date.now() - 10 * 86400000).toISOString());
db.raw.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha("ann-token"), "u1", Date.now() + 3600e3);

// ---- one sum for quotes and orders ----
let q = quoteFor("onetime", [], false);
assert(q.total === PACKAGES.onetime.price && q.deposit === 5 && q.rest === q.total - 5 && q.months === 1, "a plain one-time quote is the plan's price, $5 first");
q = quoteFor("monthly5", ["seo", "logo", "seo", "nope"], true);
assert(q.addons.join() === "seo,logo" && q.off === Math.round(PACKAGES.monthly5.price * 0.3) && q.total === PACKAGES.monthly5.price - q.off + ADDONS.seo.price + ADDONS.logo.price && q.months === 5, "add-ons are added once, unknown ones dropped, and the new-account deal is off the plan only");
assert(quoteFor("???").package === "onetime", "an unknown plan falls back to one time");
let [st, r] = await call("/api/quote?package=monthly3&addons=rush&first=0");
assert(st === 200 && r.quote.total === PACKAGES.monthly3.price + ADDONS.rush.price && r.quote.months === 3, "/api/quote gives the same sum");
[st, r] = await call("/api/order", { package: "monthly3", addons: ["rush"], details: "A website for my bakery with a menu and a contact page." }, { token: "ann-token" });
assert(st === 200 && r.id, "an order goes in");
const row = db.raw.prepare("SELECT price, addons FROM orders WHERE id = ?").get(r.id);
assert(row.price === PACKAGES.monthly3.price + ADDONS.rush.price && row.addons === "rush", "and its price is exactly the quote (" + row.price + ")");
for (const [id, p] of Object.entries(PACKAGES)) if (!p.custom) assert(page("index.html").includes(p.label.replace("/month", "")) , `the home page's words use ${id}'s real price ${p.label}`);

// ---- the four steps ----
assert(STAGES.join() === "Requested,In progress,Preview ready,Delivered", "the four steps are requested, in progress, preview ready, delivered");
assert(stageOf({ status: "in review" }) === 1 && stageOf({ status: "awaiting deposit" }) === 1, "waiting for us or for the $5 is Requested");
assert(stageOf({ status: "building" }) === 2 && stageOf({ status: "building", has_preview: 1 }) === 3 && stageOf({ status: "building", preview_url: "https://x" }) === 3, "building is In progress, and Preview ready once there's a preview");
assert(stageOf({ status: "awaiting payment" }) === 3 && stageOf({ status: "complete" }) === 4 && stageOf({ status: "cancelled" }) === 0, "finished is Preview ready until it's paid, then Delivered");
[st, r] = await call("/api/orders", null, { token: "ann-token" });
assert(r.orders[0].stage === 1 && r.stages.length === 4, "the account page gets each order's step");
db.raw.prepare("UPDATE orders SET status = 'building', preview_html = '<p>hi</p>'").run();
[st, r] = await call("/api/orders", null, { token: "ann-token" });
assert(r.orders[0].stage === 3, "an order with a preview shows Preview ready");
assert(page("account.html").includes("track4") && page("account.html").includes("Preview ready"), "the account page draws the four steps");

// ---- Report a bug / request a feature ----
mails.length = 0;
[st, r] = await call("/api/feedback", { kind: "bug", text: "The menu button does nothing on my phone.", page: "/ready.html" }, { token: "ann-token" });
assert(st === 200 && r.ok, "a signed-in customer can send a bug report");
assert(mails.length === 1 && mails[0].to.includes("owner@known.com") && /Bug report/.test(mails[0].subject) && JSON.stringify(mails[0]).includes("menu button"), "the owner gets it by email");
[st, r] = await call("/api/feedback", { kind: "feature", text: "Please add a dark mode to previews.", email: "vis@known.com" }, { ip: "2.2.2.2" });
assert(st === 200, "a visitor can send a feature request without an account");
[st, r] = await call("/api/feedback", { kind: "bug", text: "hi" }, { ip: "3.3.3.3" });
assert(st === 400, "too short is refused");
[st, r] = await call("/api/feedback", { kind: "bug", text: "A long enough message.", email: "not-an-email" }, { ip: "3.3.3.4" });
assert(st === 400, "a bad email is refused");
const before = db.raw.prepare("SELECT COUNT(*) n FROM feedback").get().n;
[st, r] = await call("/api/feedback", { kind: "bug", text: "I am a robot filling every field.", website: "http://spam" }, { ip: "3.3.3.5" });
assert(st === 200 && db.raw.prepare("SELECT COUNT(*) n FROM feedback").get().n === before, "a bot that fills the hidden field is ignored quietly");
let limited = 0; for (let i = 0; i < 8; i++) { [st] = await call("/api/feedback", { kind: "bug", text: "Sending this again and again." }, { ip: "9.9.9.9" }); if (st === 429) limited++; }
assert(limited >= 2, "one sender can't flood it");
[st, r] = await call("/api/admin/feedback", null, { admin: true });
assert(st === 200 && r.feedback.some((f) => f.kind === "feature" && f.email === "vis@known.com") && r.feedback.some((f) => f.name === "Ann" && f.page === "/ready.html"), "the admin page lists them");
[st] = await call("/api/admin/feedback");
assert(st === 403, "only with the admin key");
const id0 = r.feedback[0].id; [st, r] = await call("/api/admin/feedback", { id: id0 }, { admin: true });
assert(!r.feedback.some((f) => f.id === id0), "Done removes one");
const help = page("help.js");
assert(help.includes("Report a bug / request a feature") && help.includes("/api/feedback") && help.includes("data-feedback"), "the Help box on every page has the button");
assert(page("index.html").includes("data-feedback") && page("admin.html").includes("/api/admin/feedback"), "the home page footer and the admin page have it");

// ---- live demo, gallery and previews ----
for (const f of ["index.html", "menu.html", "story.html", "contact.html", "demo.css"]) assert(existsSync(new URL("../public/demo/golden-batch/" + f, import.meta.url)), "the sample website has " + f);
const demo = page("demo/golden-batch/index.html");
assert(/href="\/demo\/golden-batch\/menu"/.test(demo) && demo.includes('target="_top"') && demo.includes("noindex"), "its pages link to each other, and Get one like this leaves the frame");
assert(!/[\u{1F300}-\u{1FAFF}]/u.test(demo + page("examples.html")), "no emojis in the new pages");
const home = page("index.html");
assert(home.includes('data-src="/demo/golden-batch/"') && home.includes("loading=\"lazy\"") && home.includes('id="quote"') && home.includes("/api/quote"), "the home page has the live demo (loaded lazily) and the quote estimator");
assert(home.includes('href="/examples.html"'), "the home page links to Examples");
const ex = page("examples.html");
assert(ex.includes('id="sites"') && ex.includes('id="games"') && ex.includes('id="orbit"') && ex.includes("© 2026 Nebulux LLC"), "the Examples page has websites, games and Orbit uses, and the LLC footer");
assert(!/target="_blank"(?![^>]*rel="noopener")/.test(ex + home + page("ready.html")), "every new-tab link has rel=noopener");
[st, r] = await call("/api/listings");
assert(r.listings.find((l) => l.id === "golden-batch").demo === "/demo/golden-batch/", "Golden Batch's listing has a live demo");
assert(r.listings.every((l) => l.demo), "every ready-made website has something live to open");
const rd = page("ready.html");
assert(rd.includes("rprev") && rd.includes('id="pvF"') && rd.includes("Open the live website"), "ready-made websites open in a live preview (or their own live site)");
// the demo can be framed by our own pages only
const res = await worker.fetch(new Request(HOST + "/demo/golden-batch/"), env);
assert(res.headers.get("x-frame-options") === "SAMEORIGIN", "the demo can be shown inside our own pages, and nobody else's");
const down = await worker.fetch(new Request(HOST + "/demo/golden-batch/"), { ...env, MAINTENANCE: "on" });
assert(down.status === 503, "during maintenance the demo is closed like everything else");
// search engines and link-preview bots read the public pages while people get the down page
{
  const m = { ...env, MAINTENANCE: "on" }, G = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const bot = (p, ua = G, init = {}) => worker.fetch(new Request(HOST + p, { ...init, headers: { "user-agent": ua } }), m);
  for (const p of ["/", "/examples", "/ready", "/demo/golden-batch/", "/og.jpg", "/style.css"]) assert((await bot(p)).status !== 503, "maintenance: Googlebot can read " + p);
  assert((await bot("/", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).status !== 503, "and Discord can make a share card");
  for (const p of ["/account", "/admin", "/billing", "/api/listings", "/api/quote"]) assert((await bot(p)).status === 503, "maintenance: a crawler still cannot open " + p);
  assert((await bot("/", G, { method: "POST" })).status === 503, "a crawler can only read");
  assert((await bot("/", "Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36")).status === 503, "a person still gets the down page");
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
