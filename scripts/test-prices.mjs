// Offline check: the prices and times written on the public pages match what the worker
// charges (PACKAGES, ADDONS in src/worker.js). Run: npm test
import { readFileSync } from "node:fs";
const R = new URL("..", import.meta.url);
const { PACKAGES, ADDONS, READY_EXTRAS, PAY_PLANS, planTotals } = await import(new URL("src/worker.js", R));
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok " : "FAIL ") + m); if (!c) fails++; };
const page = (f) => readFileSync(new URL("public/" + f, R), "utf8").replace(/<[^>]*>/g, " ").replace(/&ndash;/g, "–").replace(/\s+/g, " ");
const home = page("index.html");

// Every website gets its own price; it can be paid once, over 3 weeks or over 5 weeks, never more than $50 extra.
ok(home.includes("never more than $50 extra") && home.includes("1st in line") && home.includes("Pay weekly if you want"), "home: the ways to pay and the order they're built in");
ok(PAY_PLANS.onetime.rank === 0 && PAY_PLANS.weeks3.rank === 1 && PAY_PLANS.weeks5.rank === 2, "one time first, then 3 weeks, then 5 weeks");
for (const p of [5, 40, 99, 250, 1000, 25000]) { const t = planTotals(p); ok(t.onetime.total === p && t.weeks3.total - p <= 25 && t.weeks5.total - p <= 50 && t.weeks3.total <= t.weeks5.total, `a $${p} price: $${t.onetime.total}, $${t.weeks3.total}, $${t.weeks5.total} (never more than $50 extra)`); }
for (const [id, a] of Object.entries(ADDONS)) ok(Number.isInteger(a.price) && a.price > 0 && a.name && a.blurb, `add-on ${id} has a name, blurb and whole-dollar price`);
// The search-engine data (JSON-LD) on the home page lists the same prices.
const raw = readFileSync(new URL("public/index.html", R), "utf8");
const ld = [...raw.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
const svc = ld.find((x) => x["@type"] === "ProfessionalService");
const offer = (n) => Number(svc.offers.find((o) => o.name.includes(n))?.price);
ok(svc.offers.length === 1 && offer("Starting fee") === 5, "search engines see the $5 starting fee, not old fixed prices");
const faq = ld.find((x) => x["@type"] === "FAQPage");
ok(faq && faq.mainEntity.every((q) => home.includes(q.name)), "every search-engine FAQ question is on the page");
// The Help button's answers (public/help.js).
const help = readFileSync(new URL("public/help.js", R), "utf8");
ok(help.includes("one time is built first, then 3 weeks, then 5 weeks") && !help.includes("$199"), "Help: how long, by the way you pay");
ok(help.includes(`(+$${READY_EXTRAS.rename.price})`) && help.includes(`(+$${READY_EXTRAS.protect.price})`), "Help: ready-made extras");
if (fails) process.exit(1);
