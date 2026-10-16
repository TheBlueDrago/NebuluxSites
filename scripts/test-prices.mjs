// Offline check: the prices and times written on the public pages match what the worker
// charges (PACKAGES, ADDONS in src/worker.js). Run: npm test
import { readFileSync } from "node:fs";
const R = new URL("..", import.meta.url);
const { PACKAGES, ADDONS, READY_EXTRAS } = await import(new URL("src/worker.js", R));
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok " : "FAIL ") + m); if (!c) fails++; };
const page = (f) => readFileSync(new URL("public/" + f, R), "utf8").replace(/<[^>]*>/g, " ").replace(/&ndash;/g, "–").replace(/\s+/g, " ");
const home = page("index.html");

const per = (p) => Math.round(p.price / Number(p.small.match(/\d+/)?.[0] || 1));
ok(home.includes(`One time ($${PACKAGES.onetime.price})`), "home FAQ: one-time price");
ok(home.includes(`3 months ($${per(PACKAGES.monthly3)}/month)`), "home FAQ: 3-month price");
ok(home.includes(`5 months ($${per(PACKAGES.monthly5)}/month)`), "home FAQ: 5-month price");
for (const [id, p] of Object.entries(PACKAGES)) ok(home.includes(p.time), `home FAQ: ${id} takes ${p.time}`);
ok(PACKAGES.monthly3.label === `$${per(PACKAGES.monthly3)}/month` && PACKAGES.monthly5.label === `$${per(PACKAGES.monthly5)}/month`, "monthly labels match their totals");
const prices = Object.values(PACKAGES).map((p) => p.price);
ok(Math.min(...prices) < PACKAGES.monthly3.price && PACKAGES.onetime.price === Math.min(...prices), "paying once is the cheapest total");
for (const [id, a] of Object.entries(ADDONS)) ok(Number.isInteger(a.price) && a.price > 0 && a.name && a.blurb, `add-on ${id} has a name, blurb and whole-dollar price`);
// The search-engine data (JSON-LD) on the home page lists the same prices.
const raw = readFileSync(new URL("public/index.html", R), "utf8");
const ld = [...raw.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
const svc = ld.find((x) => x["@type"] === "ProfessionalService");
const offer = (n) => Number(svc.offers.find((o) => o.name.includes(n))?.price);
ok(offer("One") === PACKAGES.onetime.price && offer("3 months") === per(PACKAGES.monthly3) && offer("5 months") === per(PACKAGES.monthly5), "search-engine offers match the prices");
const faq = ld.find((x) => x["@type"] === "FAQPage");
ok(faq && faq.mainEntity.every((q) => home.includes(q.name)), "every search-engine FAQ question is on the page");
// The Help button's answers (public/help.js).
const help = readFileSync(new URL("public/help.js", R), "utf8");
ok(help.includes(`One time (${PACKAGES.onetime.price}): ${PACKAGES.onetime.time}`) && help.includes(`${PACKAGES.monthly3.label}: ${PACKAGES.monthly3.time}`) && help.includes(`${PACKAGES.monthly5.label}: ${PACKAGES.monthly5.time}`), "Help: prices and times");
ok(help.includes(`(+${READY_EXTRAS.rename.price})`) && help.includes(`(+${READY_EXTRAS.protect.price})`), "Help: ready-made extras");
if (fails) process.exit(1);
