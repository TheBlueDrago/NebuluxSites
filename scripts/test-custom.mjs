// Offline test of the Custom plan (src/worker.js): for big websites, the owner sets the price, the customer accepts
// it, then pays the $5 starting fee. Also: Krivian Bakery inside the live preview. In-memory database, email faked.
// Run: node scripts/test-custom.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import worker, { quoteFor, PACKAGES } from "../src/worker.js";

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
const env = { DB: db, RESEND_API_KEY: "test", OWNER_EMAIL: "owner@known.com", MAINTENANCE: "off", ADMIN_KEY: "k", STRIPE_SECRET_KEY: "sk_test_x", ASSETS: { fetch: async () => new Response("<p>x</p>", { headers: { "content-type": "text/html" } }) } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const call = async (path, body, { token = "", admin = false } = {}) => {
  const r = await worker.fetch(new Request(HOST + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: HOST, "cf-connecting-ip": "1.1.1.1", ...(admin ? { "x-admin-key": "k" } : {}), ...(token ? { cookie: "ns_session=" + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return [r.status, await r.json().catch(() => ({}))];
};
await call("/api/packages");
for (const [id, email, name, token] of [["u1", "ann@known.com", "Ann", "ann-token"], ["u2", "bo@known.com", "Bo", "bo-token"]]) {
  db.raw.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run(id, email, name, new Date().toISOString());
  db.raw.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha(token), id, Date.now() + 3600e3);
}

assert(PACKAGES.custom && PACKAGES.custom.custom && /big websites/i.test(PACKAGES.custom.blurb) && /Highest/.test(PACKAGES.custom.priority), "there is a Custom plan, for big websites, with the highest priority");
const q = quoteFor("custom", ["seo"], true);
assert(q.custom && q.total === 0 && q.off === 0 && q.addons.join() === "seo" && q.deposit === 5, "a Custom quote has no price yet and no new-account discount; add-ons are listed");
let [st, r] = await call("/api/quote?package=custom&addons=seo,logo&first=1");
assert(st === 200 && r.quote.custom && r.quote.addons.length === 2, "the estimator gets a Custom quote");

// an ordinary request from Ann, sent first
[st, r] = await call("/api/order", { package: "onetime", details: "A small website for my bakery with a menu page." }, { token: "ann-token" });
const annId = r.id;
[st, r] = await call("/api/order", { package: "custom", addons: ["seo", "logo"], details: "A big company website with forty pages, a careers section and a staff login." }, { token: "bo-token" });
const cid = r.id, crow = () => db.raw.prepare("SELECT status, price, addons FROM orders WHERE id = ?").get(cid);
assert(st === 200 && crow().price === 0 && crow().addons === "seo,logo" && crow().status === "in review", "a Custom request goes in with no price and its add-ons");
const told = mails.find((m) => /CUSTOM/.test(m.subject));
assert(told && /no price yet/.test(told.text) && /Logo design/.test(told.text), "the owner's email says it's custom, lists the add-ons and asks for a price");
[st, r] = await call("/api/admin/orders", null, { admin: true });
assert(r.orders[0].id === cid && r.orders[1].id === annId, "open Custom requests come first on the admin page");

[st, r] = await call("/api/admin/order", { id: cid, status: "awaiting deposit", price: "" }, { admin: true });
assert(st === 400 && /price/i.test(r.error) && crow().status === "in review", "accepting it without a price is refused");
mails.length = 0;
[st, r] = await call("/api/admin/order", { id: cid, status: "awaiting deposit", price: "1450" }, { admin: true });
assert(st === 200 && r.sent === "price" && crow().status === "awaiting approval" && crow().price === 1450, "with a price, Accept sends the price to the customer instead of asking for money");
assert(mails.some((m) => m.to.includes("bo@known.com") && /\$1450/.test(m.text) && /Accept/.test(m.text)), "the customer is emailed the price");
[st, r] = await call("/api/billing?id=" + cid, null, { token: "bo-token" });
assert(st === 200 && !(r.amount > 0), "nothing can be paid before they accept");
[st, r] = await call("/api/pay/checkout", { id: cid }, { token: "bo-token" });
assert(st >= 400, "and checkout is refused");
[st, r] = await call("/api/orders", null, { token: "bo-token" });
assert(r.orders[0].status === "awaiting approval" && r.orders[0].stage === 1 && r.orders[0].price === 1450, "their account shows the price waiting for an answer");
[st] = await call("/api/order/approve", { id: cid, accept: true }, { token: "ann-token" });
assert(st === 400 && crow().status === "awaiting approval", "someone else can't accept it for them");
[st] = await call("/api/order/approve", { id: cid, accept: true });
assert(st === 401, "and not without logging in");
mails.length = 0;
[st, r] = await call("/api/order/approve", { id: cid, accept: true }, { token: "bo-token" });
assert(st === 200 && crow().status === "awaiting deposit", "the customer accepts");
[st, r] = await call("/api/billing?id=" + cid, null, { token: "bo-token" });
assert(r.amount === 5, "and now the $5 starting fee is due");
assert(mails.some((m) => m.to.includes("owner@known.com") && /accepted/.test(m.subject)) && mails.some((m) => m.to.includes("bo@known.com") && /billing/.test(m.text)), "both sides are told");
[st] = await call("/api/order/approve", { id: cid, accept: true }, { token: "bo-token" });
assert(st === 400, "it can't be answered twice");
db.raw.prepare("UPDATE orders SET status = 'awaiting approval' WHERE id = ?").run(cid);
[st, r] = await call("/api/order/approve", { id: cid, accept: false }, { token: "bo-token" });
assert(st === 200 && crow().status === "cancelled", "No thanks closes it, with nothing owed");
// an ordinary plan is accepted the usual way
[st, r] = await call("/api/admin/order", { id: annId, status: "awaiting deposit", price: "" }, { admin: true });
assert(st === 200 && db.raw.prepare("SELECT status FROM orders WHERE id = ?").get(annId).status === "awaiting deposit", "other plans are accepted straight away, as before");

const acct = page("account.html"), hm = page("index.html");
assert(acct.includes("approve(") && acct.includes("No thanks") && acct.includes("awaiting approval"), "the account page has Accept and No thanks");
assert(hm.includes('id="custom"') && /company site/.test(hm) && hm.includes("package=custom") && hm.includes("What is the Custom plan?"), "the home page explains Custom is for big websites like companies");
assert(page("admin.html").includes("Custom request (highest priority)"), "the admin page tells the owner how a Custom request works");
const csp = (await worker.fetch(new Request(HOST + "/ready.html"), env)).headers.get("content-security-policy");
assert(/frame-src 'self' https:\/\/krivianbakery\.com/.test(csp) && page("ready.html").includes("FRAME_OK"), "Krivian Bakery is allowed inside the live preview");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
