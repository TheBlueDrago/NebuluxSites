// Nebulux Sites: people tell us the website they want, pay, and we build it.
// A Cloudflare Worker: static pages in /public, this file answers /api/*.
// Accounts: email + password, and every sign-up and log-in is confirmed with a 6-digit code
// sent by email (unless "Remember me" was ticked on that device, for 30 days).
// Storage: D1 (binding DB). Emails: Resend (secret RESEND_API_KEY). Admin page: secret ADMIN_KEY.

// The packages and prices (US dollars). Change them here.
// price = the total; each plan's label says how it's paid.
export const PACKAGES = {
  monthly5: { name: "5 months", price: 245, label: "$49/month", small: "for 5 months", priority: "Standard priority", time: "about 1 month", blurb: "Pay a little at a time: $49 a month for 5 months. Lower priority, so it takes the longest." },
  monthly3: { name: "3 months", price: 225, label: "$75/month", small: "for 3 months", priority: "Faster priority", time: "about 2–3 weeks", blurb: "$75 a month for 3 months. We start sooner than the 5-month plan." },
  onetime: { name: "One time", price: 199, label: "$199", small: "one time", priority: "Top priority", time: "about 1–2 weeks", blurb: "Pay once and save. Your site goes first in line, so it's ready fastest." },
};
// Add-ons: extras a customer can pick when ordering. Their prices are added to the website's
// price (checked here, never trusted from the browser). Change them here.
export const ADDONS = {
  security: { name: "Extra security", price: 39, blurb: "Spam and bot protection on forms, security headers, safe settings for your host, and a security check before launch." },
  seo: { name: "Google & SEO setup", price: 29, blurb: "Titles, descriptions, sitemap and Google Search Console set up so people can find you." },
  rush: { name: "Rush delivery", price: 59, blurb: "We start right away and finish faster than your plan's normal time." },
  logo: { name: "Logo design", price: 35, blurb: "A simple, clean logo for your business, in all the sizes you need." },
  pages: { name: "Extra pages (up to 3)", price: 45, blurb: "Up to 3 more pages, like a gallery, menu or team page." },
  care: { name: "1 month of changes", price: 25, blurb: "After launch, we make small changes for a month (new photos, prices, text)." },
};
// Messages: a customer gets FREE_MSGS free messages on each order. After that they buy
// MSG_BLOCK more for MSG_PRICE dollars on the Billing page (so people describe things up front).
const FREE_MSGS = 5, MSG_BLOCK = 10, MSG_PRICE = 1;
// A customer's first website: FIRST_OFF percent off the plan (not the add-ons), applied automatically.
const FIRST_OFF = 30, FIRST_DAYS = 2;
// Who still gets it: no earlier order that went ahead, and the account is under 2 days old.
async function firstDeal(db, userId) {
  const u = await db.prepare("SELECT created_at FROM users WHERE id = ?").bind(userId).first();
  const ends = u ? Date.parse(u.created_at) + FIRST_DAYS * 86400000 : 0;
  if (!ends || ends < Date.now()) return { ok: false, ends: 0 };
  const before = await db.prepare("SELECT id FROM orders WHERE user_id = ? AND status != 'cancelled' LIMIT 1").bind(userId).first();
  return { ok: !before, ends };
}
const DEPOSIT = 5;
// The order flow: in review -> (you accept) awaiting deposit -> (they pay $5) building ->
// (you finish) awaiting payment -> complete. Customers get an email when you accept and when
// it's finished; you get an email for every new request and every "I've paid".
const STATUSES = ["in review", "awaiting deposit", "building", "awaiting payment", "complete", "cancelled"];
const SITE = "https://nebuluxsites.thebluedragonstriker.workers.dev";
// Every email also has a branded HTML version: the text in a card, links turned into buttons.
function mailHtml(subject, text) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const body = esc(text).split(/\n{2,}/).map((p) => {
    const link = p.match(/^(.*?)(https:\/\/\S+)\s*$/s);
    if (link && link[2].startsWith(SITE)) {
      const label = /billing/.test(link[2]) ? "Pay now" : /admin/.test(link[2]) ? "Open the admin page" : "Open my account";
      return (link[1].trim() ? `<p style="margin:0 0 14px">${link[1].trim().replace(/\n/g, "<br>")}</p>` : "") + `<p style="margin:6px 0 18px"><a href="${link[2]}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:linear-gradient(100deg,#6b5bff,#d16cf5);color:#fff;font-weight:700;text-decoration:none">${label} &rarr;</a></p>`;
    }
    return `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return `<div style="background:#0b0920;padding:32px 14px;font-family:Inter,Segoe UI,Arial,sans-serif"><div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 18px;font-size:20px;font-weight:800;color:#fff;letter-spacing:-.02em">Nebulux Sites</p>
<div style="background:#16132e;border:1px solid #2c2654;border-radius:20px;padding:26px;color:#e9e5ff;font-size:16px;line-height:1.6">
<p style="margin:0 0 16px;font-size:20px;font-weight:800;color:#fff">${esc(subject)}</p>${body}</div>
<p style="margin:18px 4px 0;color:#8b84b8;font-size:12px">You're getting this because of your Nebulux Sites account. <a href="${SITE}/legal.html#privacy" style="color:#c4b5fd">Privacy</a></p>
</div></div>`;
}
async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Nebulux Sites <sites@nebuluxai.com>", to: [to], subject, text, html: mailHtml(subject, text) }) }).catch(() => {});
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256));
}
const sameText = async (a, b) => (await sha(String(a))) === (await sha(String(b)));
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const cleanEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 254);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e);
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
function cookie(req, name) { const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)")); return m ? m[1] : ""; }
const setCookie = (name, value, days) => `${name}=${value}; Path=/; Max-Age=${Math.round(days * 86400)}; HttpOnly; Secure; SameSite=Lax`;

// a light per-network limit (Cloudflare's free cache)
async function allow(key, max, sec) {
  try {
    const slot = Math.floor(Date.now() / 1000 / sec), req = new Request(`https://limits.nebuluxsites/${encodeURIComponent(key)}/${slot}`);
    const hit = await caches.default.match(req), n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= max) return false;
    await caches.default.put(req, new Response(String(n + 1), { headers: { "cache-control": `max-age=${sec}` } }));
  } catch (e) {}
  return true;
}

// What the customer owes right now: the $5 starting fee after we accept a request, then the rest
// (one payment, or one month at a time on the monthly plans) once the website is finished.
const INSTALL = { monthly5: 49, monthly3: 75 };
function billFor(o) {
  const paid = o.paid_total || 0, left = Math.max(0, (o.price || 0) - paid);
  if (o.status === "awaiting deposit" && left > 0) return { due: "deposit", amount: Math.min(5, left), label: "starting fee", paid, left };
  if (o.status === "awaiting payment" && left > 0) {
    const n = INSTALL[o.package];
    return { due: "rest" + Math.round(paid), amount: n ? Math.min(n, left) : left, label: n ? `monthly payment ($${n}/month)` : "the rest of the price", paid, left };
  }
  return { due: "", amount: 0, label: "", paid, left };
}

// The website being built lives in a GitHub repo ("owner/repo"); the live preview and the ZIP come
// straight from it, so every push updates the customer's preview by itself. Public repos work as
// is; for private ones add a GITHUB_TOKEN secret (read-only access to the repo's contents).
function ghRepo(v) {
  const m = String(v || "").trim().replace(/\.git$/, "").match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  return m ? m[1] + "/" + m[2] : "";
}
const TYPES = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", txt: "text/plain; charset=utf-8", xml: "application/xml" };
async function ghFile(env, repo, file) {
  const enc = file.split("/").map(encodeURIComponent).join("/");
  const r = env.GITHUB_TOKEN
    ? await fetch(`https://api.github.com/repos/${repo}/contents/${enc}`, { headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github.raw", "user-agent": "nebulux-sites" } })
    : await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${enc}`, { headers: { "user-agent": "nebulux-sites" }, cf: { cacheTtl: 30 } });
  return r.ok ? r : null;
}

const previewKey = async (env, id) => (await sha("preview:" + id + ":" + (env.ADMIN_KEY || env.RESEND_API_KEY || ""))).slice(0, 24);

let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, pw_hash TEXT, pw_salt TEXT, verified INTEGER DEFAULT 0, created_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, code_hash TEXT, expires INTEGER, tries INTEGER DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS trusted (token_hash TEXT PRIMARY KEY, user_id TEXT, expires INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS promos (code TEXT PRIMARY KEY, percent INTEGER, uses INTEGER DEFAULT 0, max_uses INTEGER DEFAULT 0, expires INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS reviews (order_id TEXT PRIMARY KEY, user_id TEXT, name TEXT, business TEXT, stars INTEGER, text TEXT, approved INTEGER DEFAULT 0, at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, sender TEXT, text TEXT, at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS waitlist (email TEXT PRIMARY KEY, created_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payments (ppid TEXT PRIMARY KEY, order_id TEXT, user_id TEXT, amount REAL, kind TEXT, created_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, name TEXT, package TEXT, price INTEGER, kind TEXT, details TEXT, pages TEXT, deadline TEXT, links TEXT, status TEXT, pay_link TEXT, note TEXT, created_at TEXT, updated_at TEXT)"),
  ]);
  await db.prepare("ALTER TABLE users ADD COLUMN signup_net TEXT DEFAULT ''").run().catch(() => {});
  for (const c of ["progress INTEGER DEFAULT 0", "claimed TEXT DEFAULT ''", "preview_html TEXT DEFAULT ''", "zip_url TEXT DEFAULT ''", "paid_total REAL DEFAULT 0", "github TEXT DEFAULT ''", "addons TEXT DEFAULT ''", "wish TEXT DEFAULT ''", "msg_credits INTEGER DEFAULT 5", "admin_hidden INTEGER DEFAULT 0", "user_hidden INTEGER DEFAULT 0", "promo TEXT DEFAULT ''", "price_before INTEGER DEFAULT 0", "preview_url TEXT DEFAULT ''", "updates TEXT DEFAULT '[]'"]) await db.prepare("ALTER TABLE orders ADD COLUMN " + c).run().catch(() => {});
  ready = true;
}

async function sendCode(env, email) {
  if (!env.RESEND_API_KEY) throw Object.assign(new Error("Email isn't set up yet. Please try again later."), { status: 503 });
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare("INSERT OR REPLACE INTO codes (email, code_hash, expires, tries) VALUES (?, ?, ?, 0)").bind(email, await sha(code), Date.now() + 10 * 60000).run();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Nebulux Sites <sites@nebuluxai.com>", to: [email], subject: `${code} is your Nebulux Sites code`,
      text: `Your Nebulux Sites code is ${code}\n\nIt works for 10 minutes. If you didn't try to sign in, you can ignore this email.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0f172a"><h2>Your Nebulux Sites code</h2><p style="font-size:34px;font-weight:800;letter-spacing:6px">${code}</p><p>It works for 10 minutes. If you didn't try to sign in, you can ignore this email.</p></div>`,
    }),
  }).catch(() => null);
  if (!r || !r.ok) throw Object.assign(new Error("We couldn't send the email. Please try again in a minute."), { status: 502 });
}
async function startSession(env, userId, remember) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)").bind(await sha(token), userId, Date.now() + 30 * 86400000).run();
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("set-cookie", setCookie("ns_session", token, remember ? 30 : 1));
  if (remember) {
    const t = randomHex(32);
    await env.DB.prepare("INSERT INTO trusted (token_hash, user_id, expires) VALUES (?, ?, ?)").bind(await sha(t), userId, Date.now() + 30 * 86400000).run();
    headers.append("set-cookie", setCookie("ns_trust2", t, 30));
  }
  return new Response(JSON.stringify({ ok: true }), { headers });
}
async function currentUser(env, req) {
  const t = cookie(req, "ns_session"); if (!t) return null;
  const s = await env.DB.prepare("SELECT user_id, expires FROM sessions WHERE token_hash = ?").bind(await sha(t)).first();
  if (!s || s.expires < Date.now()) return null;
  return env.DB.prepare("SELECT id, email, name FROM users WHERE id = ?").bind(s.user_id).first();
}
async function trustedFor(env, req, userId) {
  const t = cookie(req, "ns_trust2"); if (!t) return false;
  const row = await env.DB.prepare("SELECT user_id, expires FROM trusted WHERE token_hash = ?").bind(await sha(t)).first();
  return !!(row && row.user_id === userId && row.expires > Date.now());
}

async function api(req, env, path) {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const db = env.DB;
  if (path === "/api/packages") return json({ packages: PACKAGES, addons: ADDONS, firstOff: FIRST_OFF });
  // Reviews: only from customers whose website is finished, and only shown after the owner approves.
  if (path === "/api/reviews") {
    const r = await db.prepare("SELECT name, business, stars, text, at FROM reviews WHERE approved = 1 ORDER BY at DESC LIMIT 12").all().catch(() => ({ results: [] }));
    return json({ reviews: r.results || [] }, 200, { "cache-control": "public, max-age=300" });
  }
  if (path === "/api/review" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    const o = await db.prepare("SELECT id, kind FROM orders WHERE id = ? AND user_id = ? AND status = 'complete'").bind(clip(body.id, 20), u.id).first();
    if (!o) return json({ error: "You can review a website once it's finished." }, 400);
    const stars = Math.max(1, Math.min(5, Math.round(+body.stars || 0)));
    const text = clip(String(body.text || "").trim(), 600);
    if (text.length < 10) return json({ error: "Write a sentence or two about your experience." }, 400);
    await db.prepare("INSERT OR REPLACE INTO reviews (order_id, user_id, name, business, stars, text, approved, at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").bind(o.id, u.id, clip(String(u.name || "A customer").split(" ")[0], 40), clip(o.kind || "", 60), stars, text, new Date().toISOString()).run();
    await mail(env, env.OWNER_EMAIL, `New ${stars}-star review from ${u.name}`, `${"★".repeat(stars)}\n\n${text}\n\nApprove it to show it on the homepage: ${SITE}/admin.html`);
    return json({ ok: true });
  }

  // ---- Continue with Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets) ----
  if (path === "/api/google") {
    const origin = new URL(req.url).origin;
    if (!env.GOOGLE_CLIENT_ID) return Response.redirect(origin + "/account.html?google=off", 302);
    const state = randomHex(16), g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [k, v] of Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + "/api/google/callback", response_type: "code", scope: "openid email profile", state, prompt: "select_account" })) g.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { location: g.toString(), "set-cookie": setCookie("ns_gstate", state, 1) } });
  }
  if (path === "/api/google/callback") {
    const u = new URL(req.url), origin = u.origin, bad = Response.redirect(origin + "/account.html?google=fail", 302);
    const code = u.searchParams.get("code"), state = u.searchParams.get("state");
    if (!code || !state || !(await sameText(state, cookie(req, "ns_gstate") || ""))) return bad;
    const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET || "", redirect_uri: origin + "/api/google/callback", grant_type: "authorization_code" }) }).then((r) => r.json()).catch(() => ({}));
    if (!tok.access_token) return bad;
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: "Bearer " + tok.access_token } }).then((r) => r.json()).catch(() => ({}));
    if (!info.email || !info.email_verified) return bad;
    const email = String(info.email).toLowerCase();
    let user = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!user) { user = { id: randomHex(12) }; await db.prepare("INSERT INTO users (id, email, name, pw_hash, pw_salt, verified, created_at, signup_net) VALUES (?, ?, ?, '', '', 1, ?, ?)").bind(user.id, email, clip(info.name || email.split("@")[0], 60), new Date().toISOString(), "").run(); }
    else await db.prepare("UPDATE users SET verified = 1 WHERE id = ?").bind(user.id).run();
    if (!(await trustedFor(env, req, user.id))) {
      await sendCode(env, email);
      return new Response(null, { status: 302, headers: { location: origin + "/account.html?code=" + encodeURIComponent(email), "set-cookie": setCookie("ns_gstate", "", 0) } });
    }
    const res = await startSession(env, user.id, true), h = new Headers(res.headers);
    h.set("location", origin + "/account.html"); h.append("set-cookie", setCookie("ns_gstate", "", 0));
    return new Response(null, { status: 302, headers: h });
  }

  // ---- accounts ----
  if (path === "/api/signup" && req.method === "POST") {
    if (!(await allow("signup:" + ip, 10, 3600))) return json({ error: "Too many tries. Please wait a while." }, 429);
    const email = cleanEmail(body.email), pw = String(body.password || ""), name = clip(body.name, 80).trim();
    if (!validEmail(email)) return json({ error: "Enter a real email address." }, 400);
    if (pw.length < 8) return json({ error: "Use at least 8 characters for your password." }, 400);
    if (!name) return json({ error: "Tell us your name." }, 400);
    const existing = await db.prepare("SELECT id, verified FROM users WHERE email = ?").bind(email).first();
    if (existing && existing.verified) return json({ error: "There's already an account with this email. Log in instead." }, 400);
    const salt = randomHex(16), hash = await hashPassword(pw, salt);
    if (existing) await db.prepare("UPDATE users SET name = ?, pw_hash = ?, pw_salt = ? WHERE id = ?").bind(name, hash, salt, existing.id).run();
    else await db.prepare("INSERT INTO users (id, email, name, pw_hash, pw_salt, verified, created_at, signup_net) VALUES (?, ?, ?, ?, ?, 0, ?, ?)").bind(randomHex(12), email, name, hash, salt, new Date().toISOString(), "").run();
    await sendCode(env, email);
    return json({ needCode: true });
  }
  if (path === "/api/login" && req.method === "POST") {
    const email = cleanEmail(body.email);
    if (!(await allow("login:" + ip, 30, 900)) || !(await allow("login:" + email, 10, 900))) return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    const u = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (u && !u.pw_hash) return json({ error: "This account uses Google. Press Continue with Google." }, 400);
    if (!u || !(await sameText(await hashPassword(String(body.password || ""), u.pw_salt), u.pw_hash))) return json({ error: "Wrong email or password." }, 401);
    // a device that ticked "Remember me" skips the code
    if (u.verified && (await trustedFor(env, req, u.id))) return startSession(env, u.id, true);
    await sendCode(env, email);
    return json({ needCode: true });
  }
  if (path === "/api/verify" && req.method === "POST") {
    const email = cleanEmail(body.email);
    if (!(await allow("verify:" + ip, 30, 900))) return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    const c = await db.prepare("SELECT * FROM codes WHERE email = ?").bind(email).first();
    if (!c || c.expires < Date.now() || c.tries >= 5) return json({ error: "That code has expired. Send a new one." }, 400);
    if (!(await sameText(await sha(String(body.code || "").trim()), c.code_hash))) {
      await db.prepare("UPDATE codes SET tries = tries + 1 WHERE email = ?").bind(email).run();
      return json({ error: "That code isn't right. Check the email and try again." }, 400);
    }
    await db.prepare("DELETE FROM codes WHERE email = ?").bind(email).run();
    const u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!u) return json({ error: "Please sign up again." }, 400);
    await db.prepare("UPDATE users SET verified = 1 WHERE id = ?").bind(u.id).run();
    return startSession(env, u.id, !!body.remember);
  }
  if (path === "/api/resend" && req.method === "POST") {
    const email = cleanEmail(body.email);
    if (!(await allow("resend:" + email, 4, 3600))) return json({ error: "Too many codes. Please wait a while." }, 429);
    const u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (u) await sendCode(env, email);
    return json({ ok: true });
  }
  // Forgot password: an emailed code, then a new password. Every device is signed out after.
  // The answer is the same whether or not the email has an account (so it can't be used to find accounts).
  if (path === "/api/reset/start" && req.method === "POST") {
    const email = cleanEmail(body.email);
    if (!(await allow("reset:" + ip, 10, 3600)) || !(await allow("reset:" + email, 4, 3600))) return json({ error: "Too many tries. Please wait a while." }, 429);
    const u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (u) await sendCode(env, email).catch(() => {});
    return json({ ok: true });
  }
  if (path === "/api/reset/finish" && req.method === "POST") {
    const email = cleanEmail(body.email), pw = String(body.password || "");
    if (!(await allow("verify:" + ip, 30, 900))) return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    if (pw.length < 8) return json({ error: "Use at least 8 characters for your new password." }, 400);
    const c = await db.prepare("SELECT * FROM codes WHERE email = ?").bind(email).first();
    if (!c || c.expires < Date.now() || c.tries >= 5) return json({ error: "That code has expired. Send a new one." }, 400);
    if (!(await sameText(await sha(String(body.code || "").trim()), c.code_hash))) {
      await db.prepare("UPDATE codes SET tries = tries + 1 WHERE email = ?").bind(email).run();
      return json({ error: "That code isn't right. Check the email and try again." }, 400);
    }
    const u = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!u) return json({ error: "That code has expired. Send a new one." }, 400);
    const salt = randomHex(16), hash = await hashPassword(pw, salt);
    await db.batch([
      db.prepare("DELETE FROM codes WHERE email = ?").bind(email),
      db.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, verified = 1 WHERE id = ?").bind(hash, salt, u.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      db.prepare("DELETE FROM trusted WHERE user_id = ?").bind(u.id),
    ]);
    await mail(env, email, "Your Nebulux Sites password was changed", "Your password was just changed, and every device was signed out. If this wasn't you, reset it again right away from the log-in page.");
    return startSession(env, u.id, false);
  }
  // Account: sign out on every device, or delete the account (and its orders) for good.
  if (path === "/api/account/logout-all" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    await db.batch([db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id), db.prepare("DELETE FROM trusted WHERE user_id = ?").bind(u.id)]);
    return json({ ok: true }, 200, { "set-cookie": setCookie("ns_session", "", 0) });
  }
  if (path === "/api/account/delete" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    if (cleanEmail(body.email) !== u.email) return json({ error: "Type your email exactly to confirm." }, 400);
    const busy = await db.prepare("SELECT id FROM orders WHERE user_id = ? AND status NOT IN ('complete', 'cancelled', 'in review') LIMIT 1").bind(u.id).first();
    if (busy) return json({ error: `You have a website in the works (${busy.id}). Finish or cancel it before deleting your account.` }, 400);
    await db.batch([
      db.prepare("DELETE FROM orders WHERE user_id = ?").bind(u.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      db.prepare("DELETE FROM trusted WHERE user_id = ?").bind(u.id),
      db.prepare("DELETE FROM codes WHERE email = ?").bind(u.email),
      db.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
    ]);
    if (env.AIDB) await env.AIDB.prepare("DELETE FROM site_orders WHERE email = ?").bind(u.email).run().catch(() => {});
    return json({ ok: true }, 200, { "set-cookie": setCookie("ns_session", "", 0) });
  }
  if (path === "/api/logout" && req.method === "POST") {
    const t = cookie(req, "ns_session");
    if (t) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(t)).run();
    return json({ ok: true }, 200, { "set-cookie": setCookie("ns_session", "", 0) });
  }
  if (path === "/api/me") return json({ user: await currentUser(env, req) });

  // ---- orders ----
  if (path === "/api/order" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    if (!(await allow("order:" + u.id, 10, 3600))) return json({ error: "Too many orders at once. Please wait a while." }, 429);
    if (!PACKAGES[body.package]) body.package = "onetime";
    // One website at a time: a new request only once the last one is finished or declined.
    const busy = await db.prepare("SELECT id FROM orders WHERE user_id = ? AND status NOT IN ('complete', 'cancelled') LIMIT 1").bind(u.id).first();
    if (busy) return json({ error: `You already have a website in the works (${busy.id}). You can request another one when it's finished.` }, 400);
    const pkg = PACKAGES[body.package]; if (!pkg) return json({ error: "Pick a package." }, 400);
    const details = clip(body.details, 4000).trim();
    if (details.length < 20) return json({ error: "Tell us a bit more about the website you want (at least a sentence or two)." }, 400);
    const id = "NS-" + randomHex(4).toUpperCase(), now = new Date().toISOString();
    const extras = [...new Set(Array.isArray(body.addons) ? body.addons : [])].filter((a) => ADDONS[a]);
    // First website (no earlier order that went ahead): 30% off the plan.
    const deal = await firstDeal(db, u.id);
    const off = deal.ok ? Math.round(pkg.price * FIRST_OFF / 100) : 0;
    const total = pkg.price - off + extras.reduce((n, a) => n + ADDONS[a].price, 0);
    await db.prepare("INSERT INTO orders (id, user_id, email, name, package, price, kind, details, pages, deadline, links, status, pay_link, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)")
      .bind(id, u.id, u.email, u.name, body.package, total, clip(body.kind, 80), details, "", clip(body.deadline, 40), clip(body.links, 600), "in review", now, now).run();
    if (extras.length) await db.prepare("UPDATE orders SET addons = ? WHERE id = ?").bind(extras.join(","), id).run();
    const wish = clip(String(body.wish || "").trim(), 1500);
    if (wish) await db.prepare("UPDATE orders SET wish = ? WHERE id = ?").bind(wish, id).run();
    if (env.AIDB) await env.AIDB.prepare("ALTER TABLE site_orders ADD COLUMN status TEXT DEFAULT 'in review'").run().catch(() => {});
    if (env.AIDB) await env.AIDB.batch([
      env.AIDB.prepare("CREATE TABLE IF NOT EXISTS site_orders (id TEXT PRIMARY KEY, name TEXT, email TEXT, package TEXT, price INTEGER, kind TEXT, details TEXT, created_at TEXT, status TEXT DEFAULT 'in review')"),
      env.AIDB.prepare("INSERT OR IGNORE INTO site_orders (id, name, email, package, price, kind, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, u.name, u.email, pkg.name, pkg.price, clip(body.kind, 80), clip(details, 600), now),
    ]).catch(() => {});
    await mail(env, env.OWNER_EMAIL, `New request ${id}: ${pkg.name}`, `${u.name} (${u.email}) sent a request (${pkg.label} ${pkg.small}${extras.length ? " + " + extras.map((a) => ADDONS[a].name).join(", ") : ""}, $${total} total).

${details}${wish ? "\n\nAnything else they want: " + wish : ""}

Accept it on the admin page: ${SITE}/admin.html (press Accept).`);
    return json({ ok: true, id });
  }
  // ---- billing: our own card form (card + billing address) on the Billing page ----
  // The card fields are Stripe's secure inputs styled as ours, so card numbers never touch this
  // server (that's required for taking cards). Amounts always come from the order here, never
  // from the browser, and a payment only counts after Stripe says it SUCCEEDED for the right
  // order and amount. Money goes to the Stripe balance, which pays out to the owner's debit card
  // or bank. Secrets: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY.
  if (path === "/api/billing" || path === "/api/pay/intent" || path === "/api/pay/confirm") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    const id = clip(body.id || new URL(req.url).searchParams.get("id"), 20);
    const o = await db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(id, u.id).first();
    if (!o) return json({ error: "We couldn't find that order." }, 404);
    const buyMsgs = (body.buy || new URL(req.url).searchParams.get("buy")) === "msgs";
    const bill = buyMsgs ? { due: "msgs", amount: MSG_PRICE, label: `${MSG_BLOCK} more messages`, paid: o.paid_total || 0, left: Math.max(0, (o.price || 0) - (o.paid_total || 0)) } : billFor(o);
    if (path === "/api/billing") {
      return json({ order: { id: o.id, kind: o.kind, package: o.package, status: o.status, price: o.price, promo: o.promo || "", price_before: o.price_before || 0 }, ...bill, stripe: env.STRIPE_PUBLISHABLE_KEY || "", pay_link: o.pay_link || "", email: u.email, name: u.name });
    }
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PUBLISHABLE_KEY) return json({ error: "Card payments aren't set up yet." }, 503);
    if (!bill.amount) return json({ error: "Nothing to pay right now." }, 400);
    if (!(await allow("pay:" + u.id, 30, 3600))) return json({ error: "Too many tries. Please wait a bit." }, 429);
    const stripe = (p, form) => fetch("https://api.stripe.com/v1/" + p, { method: form ? "POST" : "GET", headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body: form ? new URLSearchParams(form) : undefined }).then((x) => x.json()).catch(() => ({}));
    const cents = Math.round(bill.amount * 100);
    if (path === "/api/pay/intent") {
      const pi = await stripe("payment_intents", { amount: String(cents), currency: "usd", "automatic_payment_methods[enabled]": "true", description: `Nebulux Sites ${o.id}: ${bill.label}`, receipt_email: u.email, "metadata[order_id]": o.id, "metadata[due]": bill.due, "metadata[user_id]": u.id });
      if (!pi.client_secret) return json({ error: "Couldn't start the payment. Please try again." }, 502);
      return json({ secret: pi.client_secret });
    }
    // confirm: check with Stripe that it really went through
    const ppid = String(body.pi || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 60);
    if (!ppid.startsWith("pi_")) return json({ error: "Missing payment." }, 400);
    if (await db.prepare("SELECT 1 FROM payments WHERE ppid = ?").bind(ppid).first()) return json({ ok: true, already: true });
    const pi = await stripe("payment_intents/" + ppid);
    if (pi.status !== "succeeded" || pi.currency !== "usd" || pi.amount_received !== cents || !pi.metadata || pi.metadata.order_id !== o.id || pi.metadata.due !== bill.due) {
      return json({ error: pi.status === "processing" ? "Your payment is still processing. Check back in a minute." : "The payment didn't go through. Please try again." }, 400);
    }
    const paid = pi.amount_received / 100;
    const now = new Date().toISOString();
    if (bill.due === "msgs") {
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO payments (ppid, order_id, user_id, amount, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(ppid, o.id, u.id, paid, "msgs", now),
        db.prepare("UPDATE orders SET msg_credits = COALESCE(msg_credits, 0) + ? WHERE id = ?").bind(MSG_BLOCK, o.id),
      ]);
      return json({ ok: true, messages: MSG_BLOCK });
    }
    const total = (o.paid_total || 0) + paid;
    const left = Math.max(0, (o.price || 0) - total);
    const next = bill.due === "deposit" ? "building" : left > 0 ? "awaiting payment" : "complete";
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO payments (ppid, order_id, user_id, amount, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(ppid, o.id, u.id, paid, bill.due, now),
      db.prepare("UPDATE orders SET paid_total = ?, status = ?, claimed = '', updated_at = ? WHERE id = ?").bind(total, next, now, o.id),
    ]);
    if (env.AIDB) await env.AIDB.prepare("UPDATE site_orders SET status = ? WHERE id = ?").bind(next, o.id).run().catch(() => {});
    await mail(env, env.OWNER_EMAIL, `${o.id}: ${u.name} paid $${paid.toFixed(2)}`, `${u.name} (${u.email}) paid $${paid.toFixed(2)} (${bill.label}) for ${o.id} by card.\n\n${bill.due === "deposit" ? "It's now set to \"building\". Time to start making it!" : left > 0 ? `$${left.toFixed(2)} is still left to pay.` : "It's fully paid and now complete. Add the ZIP link on the admin page if you haven't."}\n\n${SITE}/admin.html`);
    if (next === "complete" && !o.github && !o.zip_url) await mail(env, env.OWNER_EMAIL, `${o.id} is paid but has no ZIP!`, `${u.name} (${u.email}) paid in full for ${o.id}, but there's no GitHub repo or ZIP link for it, so they can't download their website. Add it now on the admin page:\n\n${SITE}/admin.html`);
    await mail(env, u.email, `Payment received for ${o.id}`, `Hi ${u.name || "there"},\n\nWe got your payment of $${paid.toFixed(2)} (${bill.label}). Thank you!\n\n${bill.due === "deposit" ? "We're starting on your website now. You can watch the live preview on your account page." : left > 0 ? `$${left.toFixed(2)} is left to pay.` : "Your website is fully paid. Download it from your account page."}\n\n${SITE}/account.html\n\nNebulux Sites`);
    return json({ ok: true, status: next, left });
  }

  // ---- promo codes: a percentage off the website's price (like Nebulux AI's) ----
  // One code per order, used before the website is fully paid. The $5 starting fee stays $5;
  // the discount comes off the total, so the rest costs less.
  if (path === "/api/promo" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    if (!(await allow("promo:" + u.id, 10, 3600))) return json({ error: "Too many tries. Please wait a bit." }, 429);
    const o = await db.prepare("SELECT id, price, promo, paid_total, status FROM orders WHERE id = ? AND user_id = ?").bind(clip(body.id, 20), u.id).first();
    if (!o) return json({ error: "We couldn't find that order." }, 404);
    if (o.promo) return json({ error: "This order already has a promo code." }, 400);
    if (!["in review", "awaiting deposit", "building", "awaiting payment"].includes(o.status)) return json({ error: "Promo codes can't be used on this order now." }, 400);
    const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
    const p = code && (await db.prepare("SELECT * FROM promos WHERE code = ?").bind(code).first());
    if (!p || !p.active || (p.max_uses && p.uses >= p.max_uses) || (p.expires && p.expires < Date.now())) return json({ error: "That code isn't valid." }, 400);
    const price = Math.max(Math.ceil(o.paid_total || 0), Math.round((o.price || 0) * (100 - p.percent) / 100));
    const done = await db.prepare("UPDATE orders SET promo = ?, price_before = price, price = ?, updated_at = ? WHERE id = ? AND (promo IS NULL OR promo = '')").bind(code, price, new Date().toISOString(), o.id).run();
    if (!done.meta || !done.meta.changes) return json({ error: "This order already has a promo code." }, 400);
    await db.prepare("UPDATE promos SET uses = uses + 1 WHERE code = ?").bind(code).run();
    // Nothing left to pay (like a 100% code): skip the payment step.
    if (price <= (o.paid_total || 0) && ["awaiting deposit", "awaiting payment"].includes(o.status)) await db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(o.status === "awaiting deposit" ? "building" : "complete", o.id).run();
    return json({ ok: true, percent: p.percent, price });
  }

  if (path === "/api/paid" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    if (!(await allow("paid:" + u.id, 10, 3600))) return json({ error: "Please wait a bit." }, 429);
    const o = await db.prepare("SELECT id, status, price FROM orders WHERE id = ? AND user_id = ?").bind(clip(body.id, 20), u.id).first();
    if (!o || !["awaiting deposit", "awaiting payment"].includes(o.status)) return json({ error: "Nothing to pay right now." }, 400);
    await db.prepare("UPDATE orders SET claimed = ?, updated_at = ? WHERE id = ?").bind(o.status, new Date().toISOString(), o.id).run();
    const what = o.status === "awaiting deposit" ? "the $5 request fee" : "the rest of the price";
    await mail(env, env.OWNER_EMAIL, `${o.id}: ${u.name} paid ${what}`, `${u.name} (${u.email}) says they paid ${what} for ${o.id}.\n\nCheck your payments, then update the order: ${SITE}/admin.html\n${o.status === "awaiting deposit" ? '(Set it to "building" and start making it.)' : '(Set it to "complete".)'}`);
    return json({ ok: true });
  }
  // The live preview of a website being built (HTML the owner pasted on the admin page).
  // Only its customer can open it, and it runs sandboxed so it can't touch their account.
  if (path.startsWith("/api/preview/")) {
    // /api/preview/<order>/<key>/<file>
    const parts = path.slice(13).split("/"), oid = clip(parts[0], 20), key = parts[1] || "";
    if (!key || !(await sameText(key, await previewKey(env, oid)))) return new Response("This preview link isn't valid.", { status: 404 });
    const rest = oid + (parts.length > 2 ? "/" + parts.slice(2).join("/") : ""), slash = parts.length > 2 ? oid.length : -1;
    const o = await db.prepare("SELECT preview_html, github FROM orders WHERE id = ?").bind(oid).first();
    const safe = { "cache-control": "no-store", "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-modals", "x-robots-tag": "noindex" };
    if (o && o.github) {
      if (slash < 0) return new Response(null, { status: 302, headers: { location: "/api/preview/" + oid + "/" + key + "/" } });
      let file = decodeURIComponent(rest.slice(slash + 1)).replace(/^\/+/, "");
      if (file.split("/").includes("..")) return new Response("Not found", { status: 404 });
      if (!file || file.endsWith("/")) file += "index.html";
      let r = await ghFile(env, o.github, file);
      if (!r && !/\.[a-z0-9]+$/i.test(file)) { file += "/index.html"; r = await ghFile(env, o.github, file); }
      if (!r) return new Response("This page isn't built yet.", { status: 404, headers: safe });
      const ext = (file.match(/\.([a-z0-9]+)$/i) || [])[1] || "html";
      return new Response(r.body, { headers: { "content-type": TYPES[ext.toLowerCase()] || "application/octet-stream", ...safe } });
    }
    if (!o || !o.preview_html) return new Response("No preview yet.", { status: 404 });
    return new Response(o.preview_html, { headers: { "content-type": "text/html; charset=utf-8", ...safe } });
  }
  // The finished website as a ZIP, straight from its GitHub repo (only once it's complete).
  if (path.startsWith("/api/zip/")) {
    const u = await currentUser(env, req); if (!u) return new Response("Please log in.", { status: 401 });
    const o = await db.prepare("SELECT id, github, status, kind FROM orders WHERE id = ? AND user_id = ?").bind(clip(path.slice(9), 20), u.id).first();
    if (!o || !o.github || o.status !== "complete") return new Response("Your website isn't ready to download yet.", { status: 404 });
    const r = env.GITHUB_TOKEN
      ? await fetch(`https://api.github.com/repos/${o.github}/zipball`, { headers: { authorization: "Bearer " + env.GITHUB_TOKEN, "user-agent": "nebulux-sites" } })
      : await fetch(`https://codeload.github.com/${o.github}/zip/HEAD`, { headers: { "user-agent": "nebulux-sites" } });
    if (!r.ok) return new Response("Couldn't get your website right now. Try again in a minute.", { status: 502 });
    const name = (String(o.kind || "website").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "website") + "-" + o.id.toLowerCase() + ".zip";
    return new Response(r.body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
  }
  // Messages on an order: the customer and the owner talk about the website (changes, questions).
  if (path === "/api/messages") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    const id = clip(body.id || new URL(req.url).searchParams.get("id"), 20);
    const o = await db.prepare("SELECT id, kind, status, msg_credits FROM orders WHERE id = ? AND user_id = ?").bind(id, u.id).first();
    if (!o) return json({ error: "We couldn't find that order." }, 404);
    const sent = async () => (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE order_id = ? AND sender = 'customer'").bind(id).first()).n || 0;
    if (req.method === "POST") {
      const text = clip(String(body.text || "").trim(), 2000);
      if (!text) return json({ error: "Type a message." }, 400);
      if ((o.msg_credits ?? FREE_MSGS) <= 0) return json({ error: `You've used your messages. Get ${MSG_BLOCK} more for $${MSG_PRICE}.`, needMessages: true }, 402);
      if (!(await allow("msg:" + u.id, 20, 3600))) return json({ error: "You've sent a lot of messages. Please wait a bit." }, 429);
      await db.prepare("INSERT INTO messages (order_id, sender, text, at) VALUES (?, 'customer', ?, ?)").bind(id, text, new Date().toISOString()).run();
      await db.prepare("UPDATE orders SET msg_credits = MAX(0, COALESCE(msg_credits, ?) - 1) WHERE id = ?").bind(FREE_MSGS, id).run();
      await mail(env, env.OWNER_EMAIL, `New message on ${id} from ${u.name}`, `${u.name} (${u.email}) wrote about ${o.kind || id}:\n\n${text}\n\nReply on the admin page: ${SITE}/admin.html`);
    }
    const r = await db.prepare("SELECT sender, text, at FROM messages WHERE order_id = ? ORDER BY id LIMIT 300").bind(id).all();
    const left = (await db.prepare("SELECT msg_credits FROM orders WHERE id = ?").bind(id).first()).msg_credits ?? FREE_MSGS;
    return json({ messages: r.results || [], sent: await sent(), left, block: MSG_BLOCK, price: MSG_PRICE });
  }
  if (path === "/api/order/remove" && req.method === "POST") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    await db.prepare("DELETE FROM orders WHERE id = ? AND user_id = ? AND (status = 'cancelled' OR (status = 'complete' AND admin_hidden = 1))").bind(clip(body.id, 20), u.id).run();
    await db.prepare("UPDATE orders SET user_hidden = 1 WHERE id = ? AND user_id = ? AND status = 'complete'").bind(clip(body.id, 20), u.id).run();
    return json({ ok: true });
  }
  if (path === "/api/orders") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    const r = await db.prepare("SELECT id, package, price, kind, details, pages, deadline, status, claimed, paid_total, addons, wish, pay_link, note, progress, preview_url, (length(preview_html) > 0 OR length(github) > 0) AS has_preview, CASE WHEN status != 'complete' THEN '' WHEN zip_url != '' THEN zip_url WHEN github != '' THEN '/api/zip/' || id ELSE '' END AS zip_url, updates, created_at, updated_at FROM orders WHERE user_id = ? AND user_hidden = 0 ORDER BY created_at DESC").bind(u.id).all();
    const orders = r.results || [];
    const deal = await firstDeal(db, u.id), first = deal.ok;
    for (const o of orders) if (o.has_preview) o.preview_key = await previewKey(env, o.id);
    return json({ orders, first, firstEnds: deal.ends, firstOff: FIRST_OFF });
  }

  // ---- admin (the owner, with the ADMIN_KEY secret) ----
  if (path.startsWith("/api/admin/")) {
    if (!env.ADMIN_KEY) return json({ error: "Set the ADMIN_KEY secret on the Worker first." }, 503);
    if (!(await allow("admin:" + ip, 60, 600))) return json({ error: "Too many tries." }, 429);
    if (!(await sameText(req.headers.get("x-admin-key") || "", env.ADMIN_KEY))) return json({ error: "Wrong admin key." }, 403);
    if (path === "/api/admin/orders") { const r = await db.prepare("SELECT * FROM orders WHERE status != 'cancelled' AND admin_hidden = 0 ORDER BY created_at DESC LIMIT 500").all(); return json({ orders: r.results || [], statuses: STATUSES }); }
    // The Nebulux AI owner link checks its password against this same key.
    if (path === "/api/admin/check") return json({ ok: true });
    if (path === "/api/admin/reviews") {
      if (req.method === "POST" && body.action === "approve") await db.prepare("UPDATE reviews SET approved = 1 - approved WHERE order_id = ?").bind(clip(body.id, 20)).run();
      if (req.method === "POST" && body.action === "delete") await db.prepare("DELETE FROM reviews WHERE order_id = ?").bind(clip(body.id, 20)).run();
      const r = await db.prepare("SELECT * FROM reviews ORDER BY at DESC LIMIT 200").all();
      return json({ reviews: r.results || [] });
    }
    if (path === "/api/admin/give-messages" && req.method === "POST") {
      const give = [1, MSG_BLOCK].includes(+body.n) ? +body.n : MSG_BLOCK;
      await db.prepare("UPDATE orders SET msg_credits = COALESCE(msg_credits, 0) + ? WHERE id = ?").bind(give, clip(body.id, 20)).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/messages") {
      const id = clip(body.id || new URL(req.url).searchParams.get("id"), 20);
      if (req.method === "POST" && String(body.text || "").trim()) {
        const text = clip(String(body.text).trim(), 2000);
        await db.prepare("INSERT INTO messages (order_id, sender, text, at) VALUES (?, 'owner', ?, ?)").bind(id, text, new Date().toISOString()).run();
        // When the owner writes (like a question), the customer gets one free message to answer.
        await db.prepare("UPDATE orders SET msg_credits = COALESCE(msg_credits, 0) + 1 WHERE id = ?").bind(id).run();
        const o = await db.prepare("SELECT email, name, kind FROM orders WHERE id = ?").bind(id).first();
        if (o) await mail(env, o.email, `New message about your website`, `Hi ${o.name || "there"},\n\nWe sent you a message about ${o.kind || id}:\n\n${text}\n\nReply on your account page: ${SITE}/account.html`);
      }
      const r = await db.prepare("SELECT sender, text, at FROM messages WHERE order_id = ? ORDER BY id LIMIT 300").bind(id).all();
      return json({ messages: r.results || [] });
    }
    if (path === "/api/admin/archive" && req.method === "POST") {
      const id = clip(body.id, 20);
      const o = await db.prepare("SELECT status, user_hidden FROM orders WHERE id = ?").bind(id).first();
      if (!o || o.status !== "complete") return json({ error: "Only finished (complete) websites can be removed." }, 400);
      if (o.user_hidden) await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
      else await db.prepare("UPDATE orders SET admin_hidden = 1 WHERE id = ?").bind(id).run();
      if (env.AIDB) await env.AIDB.prepare("DELETE FROM site_orders WHERE id = ?").bind(id).run().catch(() => {});
      return json({ ok: true });
    }
    if (path === "/api/admin/waitlist") { const r = await db.prepare("SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 5000").all(); return json({ people: r.results || [] }); }
    if (path === "/api/admin/promos") {
      if (req.method === "POST" && body.action === "create") {
        const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
        const pct = Math.round(+body.percent);
        if (code.length < 3) return json({ error: "Codes need at least 3 letters or numbers." }, 400);
        if (!(pct >= 1 && pct <= 100)) return json({ error: "The discount has to be 1% to 100%." }, 400);
        const days = Math.max(0, Math.min(3650, Math.round(+body.days || 0)));
        await db.prepare("INSERT OR REPLACE INTO promos (code, percent, uses, max_uses, expires, active, created_at) VALUES (?, ?, 0, ?, ?, 1, ?)")
          .bind(code, pct, Math.max(0, Math.round(+body.max_uses || 0)), days ? Date.now() + days * 86400000 : 0, new Date().toISOString()).run();
      }
      if (req.method === "POST" && body.action === "toggle") await db.prepare("UPDATE promos SET active = 1 - active WHERE code = ?").bind(clip(body.code, 24)).run();
      if (req.method === "POST" && body.action === "delete") await db.prepare("DELETE FROM promos WHERE code = ?").bind(clip(body.code, 24)).run();
      const r = await db.prepare("SELECT * FROM promos ORDER BY created_at DESC LIMIT 200").all();
      return json({ promos: r.results || [] });
    }
    if (path === "/api/admin/order" && req.method === "POST") {
      const status = STATUSES.includes(body.status) ? body.status : null;
      if (status === "awaiting payment" || status === "complete") {
        const cur = await db.prepare("SELECT github, zip_url FROM orders WHERE id = ?").bind(clip(body.id, 20)).first();
        const hasZip = (cur && (cur.github || cur.zip_url)) || ghRepo(body.github || "") || /^https:\/\//.test(String(body.zip_url || "").trim());
        if (!hasZip) return json({ error: "Connect the website's GitHub repo (or add a ZIP link) first, so the customer can download it after paying." }, 400);
      }
      const link = String(body.pay_link || "").trim();
      if (link && !/^https:\/\//.test(link)) return json({ error: "A payment link has to start with https://" }, 400);
      const before = await db.prepare("SELECT github, zip_url, status, email, name FROM orders WHERE id = ?").bind(clip(body.id, 20)).first();
      if (typeof body.github === "string") {
        const repo = ghRepo(body.github);
        if (body.github.trim() && !repo) return json({ error: "Use the repo like owner/repo or its github.com link." }, 400);
        await db.prepare("UPDATE orders SET github = ? WHERE id = ?").bind(repo, clip(body.id, 20)).run();
      }
      const zip = String(body.zip_url || "").trim();
      if (zip && !/^https:\/\//.test(zip)) return json({ error: "The ZIP link has to start with https://" }, 400);
      if (zip) await db.prepare("UPDATE orders SET zip_url = ? WHERE id = ?").bind(clip(zip, 500), clip(body.id, 20)).run();
      // A paid-in-full order that was waiting for its ZIP: tell the customer it's ready now.
      if (before && before.status === "complete" && !before.github && !before.zip_url && (zip || ghRepo(body.github || ""))) await mail(env, before.email, "Your website is ready to download!", `Hi ${before.name || "there"},\n\nYour ZIP file is ready. Download your website from your account page:\n${SITE}/account.html\n\nNebulux Sites`);
      const prev = String(body.preview_url || "").trim();
      if (prev && !/^https:\/\//.test(prev)) return json({ error: "A preview link has to start with https://" }, 400);
      const old = await db.prepare("SELECT note, updates, status, email, name FROM orders WHERE id = ?").bind(clip(body.id, 20)).first();
      let ups = []; try { ups = JSON.parse(old?.updates || "[]"); } catch {}
      const note = clip(body.note, 1000);
      if (note && note !== old?.note) ups = [{ at: new Date().toISOString(), text: note }, ...ups].slice(0, 30);
      const pct = Math.max(0, Math.min(100, Math.round(+body.progress || 0)));
      await db.prepare("UPDATE orders SET status = COALESCE(?, status), pay_link = ?, note = ?, price = COALESCE(?, price), progress = ?, preview_url = ?, preview_html = COALESCE(?, preview_html), updates = ?, updated_at = ? WHERE id = ?")
        .bind(status, clip(link, 500), note, Number.isFinite(+body.price) && body.price !== "" ? Math.round(+body.price) : null, pct, clip(prev, 500), typeof body.preview_html === "string" ? clip(body.preview_html, 900000) : null, JSON.stringify(ups), new Date().toISOString(), clip(body.id, 20)).run();
      if (status && env.AIDB) await env.AIDB.prepare("UPDATE site_orders SET status = ? WHERE id = ?").bind(status, clip(body.id, 20)).run().catch(() => {});
      if (status && old && status !== old.status) {
        await db.prepare("UPDATE orders SET claimed = '' WHERE id = ?").bind(clip(body.id, 20)).run();
        const hi = `Hi ${old.name || "there"},

`, see = `

See your order: ${SITE}/account.html

Nebulux Sites`;
        if (status === "awaiting deposit") await mail(env, old.email, "Your website request was accepted!", hi + "Good news: we accepted your website request! To continue, pay your $5 starting fee on the Billing page (it comes off your price). Then we start building." + "\n\nPay here: " + SITE + "/billing.html?id=" + encodeURIComponent(clip(body.id, 20)) + see);
        if (status === "cancelled" && old.status === "in review") await mail(env, old.email, "About your website request", hi + "Thanks for your request. Sorry, we can't take this one on right now, so we declined it. You weren't charged anything. You're welcome to send a different request any time." + see);
        if (status === "cancelled" && env.AIDB) await env.AIDB.prepare("DELETE FROM site_orders WHERE id = ?").bind(clip(body.id, 20)).run().catch(() => {});
        if (status === "building") await mail(env, old.email, "We started building your website", hi + "We got your payment and started building your website. You can watch the progress and a live preview on your account page." + see);
        if (status === "awaiting payment") await mail(env, old.email, "Your website is finished!", hi + "Your website is finished! Take a look at the preview, then pay the rest on the Billing page to get it." + "\n\nPay here: " + SITE + "/billing.html?id=" + encodeURIComponent(clip(body.id, 20)) + see);
        if (status === "complete") await mail(env, old.email, "Thank you! Your website is all yours", hi + "We got your payment. Thank you! Your website is complete.\n\nDownload your website (a ZIP file) from your account page. Then upload it to your own hosting and connect your domain. The steps are in our instructions, and you can reply to this email if you get stuck." + see);
      }
      return json({ ok: true });
    }
  }
  return json({ error: "Not found" }, 404);
}

// ---- maintenance: the site is down for everyone except the owner ----
// Turned on by MAINTENANCE = "on" in wrangler.toml. The owner opens /owner, types the ADMIN_KEY once,
// and gets a cookie that lets them use the whole site for 30 days.
const ownerToken = (env) => sha("nebulux-sites-owner:" + (env.ADMIN_KEY || ""));
async function isOwner(env, req) { const c = cookie(req, "ns_owner"); return !!(c && env.ADMIN_KEY && (await sameText(c, await ownerToken(env)))); }
const page = (html, status = 200, headers = {}) => new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } });
const SHELL = (body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Nebulux Sites</title><link rel="icon" href="/logo.png"><style>
*{box-sizing:border-box;margin:0}body{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#2a1b5c,#05040f 65%);color:#f5f3ff;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
.c{max-width:520px}img{width:84px;height:84px;border-radius:22px;box-shadow:0 20px 60px -10px rgba(160,100,255,.7)}h1{font-size:clamp(30px,6vw,44px);letter-spacing:-.03em;margin:24px 0 12px}p{color:#a9a3cf;font-size:18px;line-height:1.6}
form{margin-top:24px;display:flex;gap:8px}input{flex:1;font:inherit;font-size:16px;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.35);color:#fff}button{border:0;border-radius:12px;padding:0 20px;font:inherit;font-weight:800;color:#fff;background:linear-gradient(100deg,#6b5bff,#d16cf5);cursor:pointer}.e{color:#ff8a80;margin-top:12px;font-size:15px}
</style></head><body><div class="c"><img src="/logo.png" alt="">${body}</div></body></html>`;
const DOWN = (msg = "", ok = false) => SHELL(`<h1>We'll be right back</h1><p>Sorry, Nebulux Sites is down for maintenance right now. We're making it even better. Please check back soon!</p>` +
  (ok ? `<p style="margin-top:24px;color:#86efac;font-weight:700">You're on the list! We'll email you when we're back.</p>`
      : `<p style="margin-top:26px;font-size:16px">Want to know when we're back? Leave your email.</p><form method="POST" action="/notify"><input type="email" name="email" placeholder="you@example.com" required maxlength="120"><button>Notify me</button></form>${msg ? '<p class="e">' + msg + "</p>" : ""}<p style="font-size:13px;margin-top:10px">We'll only use it to tell you when Nebulux Sites opens.</p>`));
const OWNER = (err) => SHELL(`<h1>Owner sign-in</h1><p>Type your admin key to use the site while it's down.</p><form method="POST" action="/owner"><input type="password" name="key" placeholder="Admin key" autofocus required><button>Enter</button></form>${err ? '<p class="e">' + err + "</p>" : ""}`);

// ---- safety on every response ----
// No other website can show these pages in a frame (click-jacking), browsers only use HTTPS,
// never guess file types, don't tell other sites which page someone came from, and pages
// can't use the camera, microphone or location. Requests that change things (POST) must come
// from this site itself, so another website can't act as a signed-in customer.
const SAFE = {
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "cross-origin-opener-policy": "same-origin-allow-popups",
};
function secure(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SAFE)) if (!r.headers.has(k)) r.headers.set(k, v);
  if (!r.headers.has("content-security-policy")) r.headers.set("content-security-policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  return r;
}
function sameSite(req, url) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const o = req.headers.get("origin");
  if (o) return o === url.origin;
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // The admin API is called with its key from scripts too (and Nebulux AI's owner check).
    if (!url.pathname.startsWith("/api/admin/") && !sameSite(req, url)) return secure(json({ error: "This request has to come from Nebulux Sites itself." }, 403));
    return secure(await handle(req, env, url));
  },
};

async function handle(req, env, url) {
  {
    if (env.MAINTENANCE === "on") {
      const p = url.pathname;
      if (p === "/notify" && req.method === "POST") {
        const ip = req.headers.get("cf-connecting-ip") || "unknown";
        if (!(await allow("notify:" + ip, 5, 3600))) return page(DOWN("Too many tries. Please try again later."), 429);
        const email = String((await req.formData().catch(() => null))?.get("email") || "").trim().toLowerCase().slice(0, 120);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return page(DOWN("That email doesn't look right."), 400);
        await ensure(env.DB);
        await env.DB.prepare("INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)").bind(email, new Date().toISOString()).run();
        return page(DOWN("", true));
      }
      if (p === "/owner") {
        if (req.method === "POST") {
          const ip = req.headers.get("cf-connecting-ip") || "unknown";
          if (!(await allow("owner:" + ip, 10, 900))) return page(OWNER("Too many tries. Wait 15 minutes."), 429);
          const key = (await req.formData().catch(() => null))?.get("key") || "";
          if (!env.ADMIN_KEY || !(await sameText(String(key), env.ADMIN_KEY))) return page(OWNER("That key isn't right."), 403);
          return new Response(null, { status: 302, headers: { location: "/", "set-cookie": setCookie("ns_owner", await ownerToken(env), 30) } });
        }
        return page(OWNER(""));
      }
      // the down page needs its logo; the admin API is still protected by its own key
      const open = p === "/logo.png" || p.startsWith("/api/admin/") || p.startsWith("/api/preview/"); // previews have their own private key
      if (!open && !(await isOwner(env, req))) {
        if (p.startsWith("/api/")) return json({ error: "Nebulux Sites is down for maintenance. Please check back soon." }, 503);
        return page(DOWN(), 503, { "retry-after": "3600" });
      }
    }
    if (url.pathname.startsWith("/api/")) {
      try { await ensure(env.DB); return await api(req, env, url.pathname); }
      catch (e) { return json({ error: e.status ? e.message : "Something went wrong. Please try again." }, e.status || 500); }
    }
    return env.ASSETS.fetch(req);
  }
}

