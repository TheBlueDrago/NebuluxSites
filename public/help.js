// The Help button on every page (always on the left side of the screen).
(() => {
  const QA = [
    ["What do I get?", "A ZIP file with your whole website (all its pages, pictures and code). It's yours to keep."],
    ["Do you buy the domain and hosting?", "No. You buy your own domain (like mybakery.com) and hosting. Then you upload the ZIP file there. We send you clear, step-by-step instructions for how to do it."],
    ["How do I put my website online?", "1) Buy a domain and hosting (for example from Cloudflare, Netlify, GoDaddy or Hostinger). 2) Download your ZIP file from your account. 3) Upload it to your hosting and connect your domain. We give you the exact steps for the host you pick."],
    ["How does paying work?", "Sending a request is free. When we accept it, you pay $5 to start. When your website is finished, you pay the rest, and you get your ZIP file."],
    ["How long does it take?", "One time ($199): about 1–2 weeks. $75/month: about 2–3 weeks. $49/month: about 1 month."],
    ["Can I see it while it's being built?", "Yes. Your account page shows a live preview of your website, the progress and our updates."],
  ];
  const css = document.createElement("style");
  css.textContent = `
#helpBtn{position:fixed;left:16px;bottom:18px;z-index:50;display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;font:inherit;font-weight:800;color:#fff;cursor:pointer;background:linear-gradient(100deg,#6b5bff,#d16cf5);box-shadow:0 10px 30px -8px rgba(193,90,240,.7)}
#helpBtn:hover{transform:translateY(-2px)}
#helpBox{position:fixed;left:16px;bottom:78px;z-index:50;width:min(380px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 110px));overflow:auto;display:none;background:rgba(20,16,48,.97);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:18px;box-shadow:0 30px 80px -20px rgba(0,0,0,.8);backdrop-filter:blur(14px)}
#helpBox.open{display:block;animation:hin .2s ease-out}@keyframes hin{from{opacity:0;transform:translateY(10px)}}
#helpBox h3{font-size:19px;margin-bottom:4px}#helpBox>p{color:#a9a3cf;font-size:14px;margin-bottom:12px}
#helpBox details{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 14px;margin:0 0 8px;max-width:none}
#helpBox summary{font-weight:700;font-size:15px}#helpBox details p{color:#c9c3ef;font-size:14px;margin-top:6px}
#helpBox .hl{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#helpBox .hl a{font-size:14px;color:#f0abfc}`;
  document.head.appendChild(css);
  const box = document.createElement("div"); box.id = "helpBox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Help");
  box.innerHTML = `<h3>How can we help?</h3><p>Quick answers about Nebulux Sites.</p>` +
    QA.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("") +
    `<div class="hl"><a href="/#faq">All questions</a><a href="/legal.html">Terms & Privacy</a><a href="/account.html">My account</a></div>`;
  const btn = document.createElement("button"); btn.id = "helpBtn"; btn.type = "button"; btn.innerHTML = "<span style='font-size:18px'>?</span> Help";
  btn.onclick = () => box.classList.toggle("open");
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") box.classList.remove("open"); });
  document.addEventListener("click", (e) => { if (!box.contains(e.target) && e.target !== btn && !btn.contains(e.target)) box.classList.remove("open"); });
  document.body.append(box, btn);
})();
