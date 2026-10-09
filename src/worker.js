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
const DEPOSIT = 5;
// The order flow: in review -> (you accept) awaiting deposit -> (they pay $5) building ->
// (you finish) awaiting payment -> complete. Customers get an email when you accept and when
// it's finished; you get an email for every new request and every "I've paid".
const STATUSES = ["in review", "awaiting deposit", "building", "awaiting payment", "complete", "cancelled"];
const SITE = "https://nebuluxsites.thebluedragonstriker.workers.dev";
async function mail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Nebulux Sites <sites@nebuluxai.com>", to: [to], subject, text }) }).catch(() => {});
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

let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT, pw_hash TEXT, pw_salt TEXT, verified INTEGER DEFAULT 0, created_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, code_hash TEXT, expires INTEGER, tries INTEGER DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS trusted (token_hash TEXT PRIMARY KEY, user_id TEXT, expires INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, name TEXT, package TEXT, price INTEGER, kind TEXT, details TEXT, pages TEXT, deadline TEXT, links TEXT, status TEXT, pay_link TEXT, note TEXT, created_at TEXT, updated_at TEXT)"),
  ]);
  for (const c of ["progress INTEGER DEFAULT 0", "claimed TEXT DEFAULT ''", "preview_html TEXT DEFAULT ''", "zip_url TEXT DEFAULT ''", "preview_url TEXT DEFAULT ''", "updates TEXT DEFAULT '[]'"]) await db.prepare("ALTER TABLE orders ADD COLUMN " + c).run().catch(() => {});
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
  if (path === "/api/packages") return json({ packages: PACKAGES });

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
    if (!user) { user = { id: randomHex(12) }; await db.prepare("INSERT INTO users (id, email, name, pw_hash, pw_salt, verified, created_at) VALUES (?, ?, ?, '', '', 1, ?)").bind(user.id, email, clip(info.name || email.split("@")[0], 60), new Date().toISOString()).run(); }
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
    else await db.prepare("INSERT INTO users (id, email, name, pw_hash, pw_salt, verified, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").bind(randomHex(12), email, name, hash, salt, new Date().toISOString()).run();
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
    const pkg = PACKAGES[body.package]; if (!pkg) return json({ error: "Pick a package." }, 400);
    const details = clip(body.details, 4000).trim();
    if (details.length < 20) return json({ error: "Tell us a bit more about the website you want (at least a sentence or two)." }, 400);
    const id = "NS-" + randomHex(4).toUpperCase(), now = new Date().toISOString();
    await db.prepare("INSERT INTO orders (id, user_id, email, name, package, price, kind, details, pages, deadline, links, status, pay_link, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)")
      .bind(id, u.id, u.email, u.name, body.package, pkg.price, clip(body.kind, 80), details, "", clip(body.deadline, 40), clip(body.links, 600), "in review", now, now).run();
    if (env.AIDB) await env.AIDB.prepare("ALTER TABLE site_orders ADD COLUMN status TEXT DEFAULT 'in review'").run().catch(() => {});
    if (env.AIDB) await env.AIDB.batch([
      env.AIDB.prepare("CREATE TABLE IF NOT EXISTS site_orders (id TEXT PRIMARY KEY, name TEXT, email TEXT, package TEXT, price INTEGER, kind TEXT, details TEXT, created_at TEXT, status TEXT DEFAULT 'in review')"),
      env.AIDB.prepare("INSERT OR IGNORE INTO site_orders (id, name, email, package, price, kind, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, u.name, u.email, pkg.name, pkg.price, clip(body.kind, 80), clip(details, 600), now),
    ]).catch(() => {});
    await mail(env, env.OWNER_EMAIL, `New request ${id}: ${pkg.name}`, `${u.name} (${u.email}) sent a request (${pkg.label} ${pkg.small}).

${details}

Accept it on the admin page: ${SITE}/admin.html (set it to "awaiting deposit" and add the $5 payment link).`);
    return json({ ok: true, id });
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
    const u = await currentUser(env, req); if (!u) return new Response("Please log in.", { status: 401 });
    const o = await db.prepare("SELECT preview_html FROM orders WHERE id = ? AND user_id = ?").bind(clip(path.slice(13), 20), u.id).first();
    if (!o || !o.preview_html) return new Response("No preview yet.", { status: 404 });
    return new Response(o.preview_html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-modals", "x-robots-tag": "noindex" } });
  }
  if (path === "/api/orders") {
    const u = await currentUser(env, req); if (!u) return json({ error: "Please log in first." }, 401);
    const r = await db.prepare("SELECT id, package, price, kind, details, pages, deadline, status, claimed, pay_link, note, progress, preview_url, (length(preview_html) > 0) AS has_preview, CASE WHEN status = 'complete' THEN zip_url ELSE '' END AS zip_url, updates, created_at, updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC").bind(u.id).all();
    return json({ orders: r.results || [] });
  }

  // ---- admin (the owner, with the ADMIN_KEY secret) ----
  if (path.startsWith("/api/admin/")) {
    if (!env.ADMIN_KEY) return json({ error: "Set the ADMIN_KEY secret on the Worker first." }, 503);
    if (!(await allow("admin:" + ip, 60, 600))) return json({ error: "Too many tries." }, 429);
    if (!(await sameText(req.headers.get("x-admin-key") || "", env.ADMIN_KEY))) return json({ error: "Wrong admin key." }, 403);
    if (path === "/api/admin/orders") { const r = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all(); return json({ orders: r.results || [], statuses: STATUSES }); }
    if (path === "/api/admin/order" && req.method === "POST") {
      const status = STATUSES.includes(body.status) ? body.status : null;
      const link = String(body.pay_link || "").trim();
      if (link && !/^https:\/\//.test(link)) return json({ error: "A payment link has to start with https://" }, 400);
      const zip = String(body.zip_url || "").trim();
      if (zip && !/^https:\/\//.test(zip)) return json({ error: "The ZIP link has to start with https://" }, 400);
      if (zip) await db.prepare("UPDATE orders SET zip_url = ? WHERE id = ?").bind(clip(zip, 500), clip(body.id, 20)).run();
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
        if (status === "awaiting deposit") await mail(env, old.email, "Your website request was accepted!", hi + "Good news: we accepted your website request. To continue, pay the $5 request fee (it comes off your final price). Then we start building." + see);
        if (status === "building") await mail(env, old.email, "We started building your website", hi + "We got your payment and started building your website. You can watch the progress and a live preview on your account page." + see);
        if (status === "awaiting payment") await mail(env, old.email, "Your website is finished!", hi + "Your website is finished! Take a look at the preview, then pay the rest of the price to get it." + see);
        if (status === "complete") await mail(env, old.email, "Thank you! Your website is all yours", hi + "We got your payment. Thank you! Your website is complete.\n\nDownload your website (a ZIP file) from your account page. Then upload it to your own hosting and connect your domain. The steps are in our instructions, and you can reply to this email if you get stuck." + see);
      }
      return json({ ok: true });
    }
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { await ensure(env.DB); return await api(req, env, url.pathname); }
      catch (e) { return json({ error: e.status ? e.message : "Something went wrong. Please try again." }, e.status || 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
