// Offline test of the "I'm not a robot" check (Cloudflare Turnstile) on sign-up and Forgot password
// (src/worker.js), with a stand-in database and Cloudflare's check faked. Nothing real is touched.
// Run: node scripts/test-turnstile.mjs
import worker from "../src/worker.js";

let failed = 0;
const assert = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } else console.log("ok", m); };

// a database that has nobody in it (enough for these two forms to get as far as sending a code)
const stmt = () => ({ bind: () => stmt(), first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) });
const DB = { prepare: stmt, batch: async (l) => l.map(() => ({ results: [] })) };
const sent = [], checked = [];
globalThis.fetch = async (url, init) => {
  if (String(url).includes("challenges.cloudflare.com/turnstile/v0/siteverify")) { const tok = init.body.get("response"); checked.push(tok); return new Response(JSON.stringify({ success: tok === "good-token" }), { status: 200 }); }
  if (String(url).includes("api.resend.com")) { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
  throw new Error("unexpected fetch " + url);
};
const on = { DB, RESEND_API_KEY: "test", TURNSTILE_SITE_KEY: "site-key", TURNSTILE_SECRET: "secret" };
const off = { DB, RESEND_API_KEY: "test", TURNSTILE_SITE_KEY: "site-key" };
const post = (path, body, env) => worker.fetch(new Request("https://nebuluxsites.example" + path, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113." + Math.floor(Math.random() * 200) }, body: JSON.stringify(body) }), env);
const getJ = async (path, env) => (await worker.fetch(new Request("https://nebuluxsites.example" + path), env)).json();

assert((await getJ("/api/turnstile", off)).site_key === null, "the check is off until the secret is set (no site key handed out)");
assert((await getJ("/api/turnstile", on)).site_key === "site-key", "once it's on, the page gets the public site key");
let r = await post("/api/signup", { email: "kid@example.com", password: "Violet-Harbor-58", name: "Kid" }, on);
let j = await r.json();
assert(r.status === 400 && j.code === "turnstile" && sent.length === 0, "sign-up without the check is refused, and no email goes out");
r = await post("/api/signup", { email: "kid@example.com", password: "Violet-Harbor-58", name: "Kid", turnstile_token: "bad-token" }, on);
assert(r.status === 400 && (await r.json()).code === "turnstile" && checked.includes("bad-token"), "a token Cloudflare rejects is refused");
r = await post("/api/signup", { email: "kid@example.com", password: "Violet-Harbor-58", name: "Kid", turnstile_token: "good-token" }, on);
assert(r.status === 200 && (await r.json()).needCode === true && sent.length === 1, "with a good token, sign-up sends the code");
r = await post("/api/reset/start", { email: "kid@example.com" }, on);
assert(r.status === 400 && (await r.json()).code === "turnstile", "Forgot password without the check is refused too");
r = await post("/api/signup", { email: "kid2@example.com", password: "Violet-Harbor-58", name: "Kid" }, off);
assert(r.status === 200 && sent.length === 2, "while it's off, sign-up works as before");
if (failed) { console.error(failed + " failed"); process.exit(1); }
