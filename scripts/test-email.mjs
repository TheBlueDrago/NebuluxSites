// Offline test of Nebulux Sites' emails (src/worker.js): Resend's free plan sends 2 emails a second and 100 a day,
// so "too many at once" gets one more try, and a used-up day gives a clear message. Nothing real is touched.
// Run: node scripts/test-email.mjs
import worker from "../src/worker.js";

let failed = 0;
const assert = (c, m) => { if (!c) { failed++; console.error("FAIL", m); } else console.log("ok", m); };

// a database with nobody in it (enough for sign-up to get as far as sending a code)
const stmt = () => ({ bind: () => stmt(), first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) });
const DB = { prepare: stmt, batch: async (l) => l.map(() => ({ results: [] })) };
let sent = [], answers = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes("api.resend.com")) throw new Error("unexpected fetch " + url);
  sent.push(JSON.parse(init.body));
  const a = answers.shift();
  return a ? new Response(JSON.stringify(a.body), { status: a.status }) : new Response("{}", { status: 200 });
};
const env = { DB, RESEND_API_KEY: "test" };
const signup = (email) => worker.fetch(new Request("https://nebuluxsites.example/api/signup", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113." + Math.floor(Math.random() * 200) }, body: JSON.stringify({ email, password: "Violet-Harbor-58", name: "Kid" }) }), env);

let r = await signup("kid@example.com");
assert(r.status === 200 && sent.length === 1 && /is your Nebulux Sites code/.test(sent[0].subject) && sent[0].from === "Nebulux Sites <sites@nebuluxai.com>", "signing up emails a code");

sent = [];
answers = [{ status: 429, body: { name: "rate_limit_exceeded", message: "Too many requests" } }];
r = await signup("sam@example.com");
assert(r.status === 200 && sent.length === 2, "\"too many at once\" from Resend gets one more try, and the code goes out");

sent = [];
answers = [{ status: 429, body: { name: "daily_quota_exceeded", message: "You have reached your daily email sending quota." } }];
r = await signup("pat@example.com");
const j = await r.json();
assert(r.status === 503 && /all the emails we can for today/.test(j.error) && sent.length === 1, "when the day's emails are used up, it says so instead of \"try again in a minute\" (" + j.error + ")");

sent = [];
answers = [{ status: 500, body: { message: "down" } }];
r = await signup("lee@example.com");
assert(r.status === 502 && sent.length === 1, "any other failure isn't retried and says to try again soon");

if (failed) process.exit(1);
