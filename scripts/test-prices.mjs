// Offline check: the prices and times written on the public pages match what the worker
// charges (PACKAGES, ADDONS in src/worker.js). Run: npm test
import { readFileSync } from "node:fs";
const R = new URL("..", import.meta.url);
const { PACKAGES, ADDONS } = await import(new URL("src/worker.js", R));
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
if (fails) process.exit(1);
