// Offline test of Nebulux Sites' payments (src/worker.js): Stripe's checkout page, on an in-memory SQLite
// database with Stripe and email faked. Nothing real is touched. Run: node scripts/test-checkout.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";

let failed = 0;
const assert = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } else console.log("ok", m); };

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
const db = d1();
const HOST = "https://nebuluxsites.thebluedragonstriker.workers.dev";
let sessions = {}, intents = {}, created = [], mails = [], stripeDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.resend.com")) { mails.push(JSON.parse(init.body)); return new Response("{}"); }
  if (u.startsWith("https://api.stripe.com/v1/")) {
    if (stripeDown) return new Response('{"error":{"message":"nope"}}', { status: 500 });
    const p = u.slice("https://api.stripe.com/v1/".length);
    if (p === "checkout/sessions" && init.method === "POST") { const form = Object.fromEntries(new URLSearchParams(init.body)); created.push({ form, auth: init.headers.authorization }); return new Response(JSON.stringify({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" })); }
    if (p.startsWith("checkout/sessions/")) return new Response(JSON.stringify(sessions[p.split("/")[2]] || { error: {} }));
    if (p.startsWith("payment_intents/")) return new Response(JSON.stringify(intents[p.split("/")[1]] || { error: {} }));
  }
  throw new Error("unexpected fetch " + u);
};
const env = { DB: db, RESEND_API_KEY: "test", OWNER_EMAIL: "owner@known.com", STRIPE_SECRET_KEY: "sk_test_x", MAINTENANCE: "off", ADMIN_KEY: "k", ASSETS: { fetch: async () => new Response("asset") } };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const call = async (path, body, token = "ann-token", e = env) => {
  const r = await worker.fetch(new Request(HOST + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: HOST, ...(token ? { cookie: "ns_session=" + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), e);
  return [r.status, await r.json().catch(() => ({}))];
};
await call("/api/billing?id=x"); // makes the tables
for (const [id, email, name, token] of [["u1", "ann@known.com", "Ann", "ann-token"], ["u2", "bo@known.com", "Bo", "bo-token"]]) {
  db.raw.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, ?)").run(id, email, name);
  db.raw.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").run(sha(token), id, Date.now() + 3600e3);
}
const order = (id, status, paid = 0, price = 199) => db.raw.prepare("INSERT INTO orders (id, user_id, email, name, package, price, kind, status, paid_total, created_at, updated_at) VALUES (?, 'u1', 'ann@known.com', 'Ann', 'once', ?, 'Shop', ?, ?, 'x', 'x')").run(id, price, status, paid);
const row = (id) => db.raw.prepare("SELECT * FROM orders WHERE id = ?").get(id);
const paidSession = (id, over = {}) => ({ id, status: "complete", payment_status: "paid", currency: "usd", amount_total: 500, client_reference_id: "u1", payment_intent: "pi_1", metadata: { order_id: "NS1", due: "deposit", user_id: "u1" }, ...over });

order("NS1", "awaiting deposit");
let [s, d] = await call("/api/billing?id=NS1");
assert(s === 200 && d.stripe === true && d.amount === 5 && d.pending === "", "the Billing page knows payments are on and what's due");
[s, d] = await call("/api/billing?id=NS1", null, "bo-token");
assert(s === 404, "nobody else can see your order");
[s, d] = await call("/api/pay/checkout", { id: "NS1", amount: 1, price: 1, cents: 1 });
const f = created[0].form;
assert(s === 200 && d.url.startsWith("https://checkout.stripe.com/"), "Pay sends you to Stripe's checkout");
assert(created[0].auth === "Bearer sk_test_x", "the key goes to Stripe only in the header");
assert(f["line_items[0][price_data][unit_amount]"] === "500" && f.mode === "payment", "the amount comes from the order, not the browser");
assert(f.billing_address_collection === "required", "it asks for the full billing address");
assert(!Object.keys(f).some((k) => k.startsWith("payment_method_types")), "card, Cash App Pay, Klarna and bank are left to Stripe's settings");
assert(f["metadata[order_id]"] === "NS1" && f["metadata[due]"] === "deposit" && f.client_reference_id === "u1" && f.customer_email === "ann@known.com", "it says whose it is and what for");
assert(f.success_url === HOST + "/billing.html?id=NS1&session={CHECKOUT_SESSION_ID}" && f.cancel_url === HOST + "/billing.html?id=NS1", "it comes back to the Billing page");
assert(f["metadata[source]"] === "nebulux-sites" && f["metadata[kind]"] === undefined, "Nebulux AI's webhook leaves these alone");
[s, d] = await call("/api/pay/checkout", { id: "NS1" }, "ann-token", { ...env, STRIPE_SECRET_KEY: "" });
assert(s === 503 && /Nothing was charged/.test(d.error), "no key: nothing is charged");
[s, d] = await call("/api/billing?id=NS1", null, "ann-token", { ...env, STRIPE_SECRET_KEY: "" });
assert(d.stripe === false, "and the page says so");
stripeDown = true;
[s, d] = await call("/api/pay/checkout", { id: "NS1" });
stripeDown = false;
assert(s === 502 && /Nothing was charged/.test(d.error), "if Stripe fails it says nothing was charged");

// ---- coming back ----
[s, d] = await call("/api/pay/confirm", { id: "NS1", session: "pi_oldstyle" });
assert(s === 400, "only a checkout counts");
sessions.cs_cheap = paidSession("cs_cheap", { amount_total: 100 });
sessions.cs_other = paidSession("cs_other", { metadata: { order_id: "NS9", due: "deposit" } });
sessions.cs_due = paidSession("cs_due", { metadata: { order_id: "NS1", due: "rest5" } });
sessions.cs_who = paidSession("cs_who", { client_reference_id: "u2" });
sessions.cs_open = paidSession("cs_open", { status: "open", payment_status: "unpaid" });
for (const [c, why] of [["cs_cheap", "for less money"], ["cs_other", "for another order"], ["cs_due", "for something else that's due"], ["cs_who", "by someone else"], ["cs_open", "that was never finished"]]) {
  [s, d] = await call("/api/pay/confirm", { id: "NS1", session: c });
  assert(s === 400 && row("NS1").paid_total === 0 && row("NS1").status === "awaiting deposit", "a checkout " + why + " doesn't count");
}
mails = [];
sessions.cs_good = paidSession("cs_good");
[s, d] = await call("/api/pay/confirm", { id: "NS1", session: "cs_good" });
assert(s === 200 && d.status === "building" && row("NS1").paid_total === 5 && row("NS1").status === "building", "a paid checkout moves the order on");
assert(mails.some((m) => /paid \$5/.test(m.subject)) && mails.some((m) => /Payment received/.test(m.subject)), "you and the owner are emailed");
[s, d] = await call("/api/pay/confirm", { id: "NS1", session: "cs_good" });
assert(row("NS1").paid_total === 5 && row("NS1").status === "building", "opening the page again changes nothing");
order("NS4", "awaiting deposit");
db.raw.prepare("INSERT INTO payments (ppid, order_id, user_id, amount, kind, created_at) VALUES ('cs_twice', 'NS4', 'u1', 5, 'deposit', 'x')").run();
sessions.cs_twice = paidSession("cs_twice", { metadata: { order_id: "NS4", due: "deposit" } });
[s, d] = await call("/api/pay/confirm", { id: "NS4", session: "cs_twice" });
assert(s === 200 && d.already === true && row("NS4").paid_total === 0, "the same payment counts once");

// ---- bank payments ----
order("NS2", "awaiting deposit");
const bank = (id, pi) => { sessions[id] = paidSession(id, { payment_status: "unpaid", payment_intent: pi, metadata: { order_id: "NS2", due: "deposit" } }); };
bank("cs_bank", "pi_wait"); intents.pi_wait = { status: "processing" };
[s, d] = await call("/api/pay/confirm", { id: "NS2", session: "cs_bank" });
assert(s === 202 && d.processing === true && /few days/.test(d.error) && row("NS2").paid_total === 0, "a bank payment waits, and says so");
[s, d] = await call("/api/billing?id=NS2");
assert(d.pending === "cs_bank", "the Billing page remembers it, so nobody pays twice");
sessions.cs_bank.payment_status = "paid";
[s, d] = await call("/api/pay/confirm", { id: "NS2", session: "cs_bank" });
assert(s === 200 && row("NS2").status === "building" && row("NS2").pay_session === "", "when it clears the order moves on");
order("NS3", "awaiting deposit");
sessions.cs_bad = paidSession("cs_bad", { payment_status: "unpaid", payment_intent: "pi_bad", metadata: { order_id: "NS3", due: "deposit" } }); intents.pi_bad = { status: "processing" };
await call("/api/pay/confirm", { id: "NS3", session: "cs_bad" });
assert(row("NS3").pay_session === "cs_bad", "another bank payment is waiting");
intents.pi_bad = { status: "requires_payment_method" };
[s, d] = await call("/api/pay/confirm", { id: "NS3", session: "cs_bad" });
assert(s === 400 && row("NS3").pay_session === "" && row("NS3").paid_total === 0, "if the bank refuses, it's forgotten and they can pay again");

// ---- the page ----
const page = readFileSync(new URL("../public/billing.html", import.meta.url), "utf8");
assert(/\/api\/pay\/checkout/.test(page) && !/js\.stripe\.com|pay\/intent|cardEl/.test(page), "the Billing page uses the checkout, with no card form of its own");
assert(/Cash App Pay, Klarna and bank/.test(page) && /full billing address/.test(page), "it says what's offered");
const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
assert(!/payment_intents", \{/.test(src) && !/STRIPE_PUBLISHABLE_KEY/.test(src.replace(/\/\/.*$/gm, "")), "no leftovers from the old card form");

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
