// The Help button on every page (always on the left side of the screen).
(() => {
  const QA = [
    ["What do I get?", "A ZIP file with your whole website (all its pages, pictures and code). It's yours to keep."],
    ["Do you buy the domain and hosting?", "No. You buy your own domain (like mybakery.com) and hosting. Then you upload the ZIP file there. We send you clear, step-by-step instructions for how to do it."],
    ["Can my website take payments?", "Yes, we can add checkout and payment buttons. You set up your own payment provider account (like Stripe, PayPal or Square) so the money goes to you, and we give you the steps to connect it."],
    ["What do I set up myself?", "Your domain, your hosting, and a payment provider account if your website takes payments. None of these are included in our price, but we show you exactly how."],
    ["How do I put my website online?", "Easiest (free): download your ZIP from your account, then on nebuluxai.com log in, open Website Designer, press New website, choose Upload ZIP and pick the file. It goes live right away, and you can connect your own domain. Or use Cloudflare Pages, Netlify or any other host: upload the ZIP there and connect your domain. We give you the steps."],
    ["How does paying work?", "Sending a request is free. When we accept it, you pay a $5 starting fee on the Billing page. When your website is finished, you pay the rest there (by card or Apple Pay), and you get your ZIP file."],
    ["How long does it take?", "One time ($199): about 1–2 weeks. $75/month: about 2–3 weeks. $49/month: about 1 month."],
    ["Can I see it while it's being built?", "Yes. Your account page shows a live preview of your website, the progress and our updates."],
  ];
  const css = document.createElement("style");
  css.textContent = `
#helpBtn{position:fixed;left:16px;bottom:18px;z-index:50;display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;font:inherit;font-weight:800;color:#fff;cursor:pointer;background:linear-gradient(100deg,#6b5bff,#d16cf5);box-shadow:0 10px 30px -8px rgba(193,90,240,.7)}
#helpBtn:hover{transform:translateY(-2px)}
#helpBox{position:fixed;left:16px;bottom:78px;z-index:50;width:min(380px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 110px));overflow:auto;display:none;background:rgba(20,16,48,.97);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:18px;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);backdrop-filter:blur(14px)}
#helpBox.open{display:block;animation:hin .2s ease-out}@keyframes hin{from{opacity:0;transform:translateY(10px)}}
#helpX{position:absolute;right:12px;top:12px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:14px}#helpX:hover{background:rgba(255,255,255,.16)}
#helpBox h3{font-size:19px;margin-bottom:4px}#helpBox>p{color:#a9a3cf;font-size:14px;margin-bottom:12px}
#helpBox details{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 14px;margin:0 0 8px;max-width:none}
#helpBox summary{font-weight:700;font-size:15px}#helpBox details p{color:#c9c3ef;font-size:14px;margin-top:6px}
#helpBox .ask{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1)}#helpBox .ask b{display:flex;align-items:center;gap:8px}#helpBox .ask b i{font-style:normal;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#6b5bff,#d16cf5);font-size:14px}
#nlog{display:flex;flex-direction:column;gap:6px;margin:10px 0;max-height:220px;overflow:auto}#nlog div{padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.5;max-width:90%;white-space:pre-wrap}#nlog .u{align-self:flex-end;background:linear-gradient(100deg,#6b5bff,#d16cf5);color:#fff}#nlog .a{align-self:flex-start;background:rgba(255,255,255,.08);color:#e9e5ff}#nlog .w{opacity:.7;font-style:italic}
#nform{display:flex;gap:6px}#nform input{flex:1;min-width:0;font:inherit;font-size:15px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;outline:none}#nform button{border:0;border-radius:12px;padding:0 14px;font-weight:800;color:#fff;cursor:pointer;background:linear-gradient(100deg,#6b5bff,#d16cf5)}
#helpBox .hl{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#helpBox .hl a{font-size:14px;color:#f0abfc}`;
  document.head.appendChild(css);
  const box = document.createElement("div"); box.id = "helpBox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Help");
  box.innerHTML = `<button id="helpX" title="Close">✕</button><h3>How can we help?</h3><p>Quick answers about Nebulux Sites:</p>` +
    QA.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("") +
    `<div class="ask"><b><i>✦</i> Ask Nebula, our AI agent</b><p style="color:#a9a3cf;font-size:13px;margin:4px 0 0">Got another question? Nebula answers anything about Nebulux Sites.</p><div id="nlog"></div><form id="nform"><input id="nin" maxlength="500" placeholder="Ask Nebula a question…" autocomplete="off"><button>Ask</button></form></div>` +
    `<div class="hl"><a href="/#faq">All questions</a><a href="/legal.html">Terms & Privacy</a><a href="/account.html">My account</a></div>`;
  const hist = [], log = box.querySelector("#nlog");
  const btn = document.createElement("button"); btn.id = "helpBtn"; btn.type = "button"; btn.innerHTML = "<span style='font-size:18px'>?</span> Help";
  // Closing Help ends the chat with Nebula (after asking), so it opens fresh next time.
  const close = () => {
    if (!box.classList.contains("open")) return;
    if (hist.length && !confirm("Close Help and delete this chat with Nebula?")) return;
    hist.length = 0; log.innerHTML = ""; box.classList.remove("open");
  };
  btn.onclick = () => (box.classList.contains("open") ? close() : box.classList.add("open"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.addEventListener("click", (e) => { if (!box.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); });
  document.body.append(box, btn);
  box.querySelector("#helpX").onclick = (e) => { e.stopPropagation(); close(); };
  const add = (cls, t) => { const d = document.createElement("div"); d.className = cls; d.textContent = t; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  box.querySelector("#nform").onsubmit = async (e) => {
    e.preventDefault();
    const inp = box.querySelector("#nin"), q = inp.value.trim(); if (!q) return;
    inp.value = ""; add("u", q); hist.push({ role: "user", content: q });
    const w = add("a w", "Nebula is thinking…");
    try {
      const r = await fetch("https://nebuluxai.com/v1/sites-help", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: hist.slice(-8) }) });
      const j = await r.json().catch(() => ({}));
      const t = j.content || j.error || "Sorry, something went wrong. Try again.";
      w.className = "a"; w.textContent = t; if (j.content) hist.push({ role: "assistant", content: t });
    } catch { w.className = "a"; w.textContent = "Couldn't reach Nebula. Check your internet and try again."; }
  };
})();
