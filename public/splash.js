// The Nebulux splash on the homepage: a star swells and explodes (flash, shock ring, sparks), the
// nebula (the logo) blooms huge and turning, shrinks into the logo, then flies into the logo in the
// header while the page fades in. Once per visit; tap to skip; none for "reduce motion".
(() => {
  try { if (sessionStorage.getItem("ns-splash")) return; sessionStorage.setItem("ns-splash", "1"); } catch { return; }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || /bot|crawl|spider|lighthouse/i.test(navigator.userAgent)) return;
  const css = `
#nsSplash{position:fixed;inset:0;z-index:1000;background:#03020a;display:grid;place-items:center;overflow:hidden;transition:background .6s ease,opacity .5s ease}
#nsSplash.fly{background:rgba(3,2,10,0)}
#nsSplash.gone{opacity:0;pointer-events:none}
#nsSplash .st{position:absolute;inset:-10%;animation:nsDrift 4s linear both}
#nsSplash .st i{position:absolute;width:1px;height:1px;background:#fff;border-radius:50%}
#nsSplash .core{position:relative;width:112px;height:112px}
#nsSplash .star{position:absolute;left:50%;top:50%;width:24px;height:24px;margin:-12px;border-radius:50%;background:#fff;box-shadow:0 0 30px 12px #fff,0 0 90px 34px rgba(216,180,254,.75);animation:nsStar .7s ease-in both}
#nsSplash .ring{position:absolute;left:50%;top:50%;width:96px;height:96px;border-radius:50%;border:8px solid rgba(233,213,255,.9);transform:translate(-50%,-50%) scale(.05);opacity:0;animation:nsRing 1.1s cubic-bezier(.2,.7,.3,1) .62s both}
#nsSplash .spark{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(233,213,255,.9);opacity:0;animation:nsSpark 1.1s cubic-bezier(.1,.7,.3,1) .62s both}
#nsSplash .flash{position:absolute;inset:0;background:#fff;opacity:0;animation:nsFlash .5s ease-out .6s both;pointer-events:none}
#nsSplash .halo{position:absolute;left:50%;top:50%;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,.45) 0%,rgba(147,51,234,.25) 45%,transparent 70%);transform:translate(-50%,-50%) scale(.3);opacity:0;animation:nsHalo 1.4s cubic-bezier(.2,.8,.2,1) 1.9s both}
#nsSplash .bloom{position:absolute;inset:0;animation:nsBloom 2.7s .62s both}
#nsSplash .bloom img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;user-select:none}
#nsSplash .soft{-webkit-mask-image:radial-gradient(circle,#000 42%,transparent 70%);mask-image:radial-gradient(circle,#000 42%,transparent 70%);animation:nsSoft 2.7s ease-in-out .62s both}
#nsSplash .crisp{border-radius:22%;box-shadow:0 0 50px 8px rgba(192,132,252,.45);opacity:0;animation:nsCrisp 2.7s ease-in .62s both}
#nsSplash .name{position:absolute;left:0;right:0;top:calc(50% + 86px);text-align:center;font:800 clamp(40px,8vw,72px) Sora,Inter,system-ui,sans-serif;letter-spacing:-.025em;background:linear-gradient(90deg,#fff,#ddd6fe,#f0abfc);-webkit-background-clip:text;background-clip:text;color:transparent;opacity:0;animation:nsUp .8s cubic-bezier(.2,.8,.2,1) 2.35s both}
#nsSplash.fly .name,#nsSplash.fly .halo,#nsSplash.fly .st,#nsSplash.fly .ns-skip{opacity:0!important;transition:opacity .35s}
#nsSplash .ns-skip{position:absolute;bottom:22px;left:0;right:0;text-align:center;color:rgba(255,255,255,.35);font:500 13px Inter,system-ui,sans-serif}
@keyframes nsDrift{to{transform:scale(1.12) rotate(4deg)}}
@keyframes nsStar{0%{transform:scale(.2);opacity:0}30%{opacity:1}80%{transform:scale(1.1);opacity:1}100%{transform:scale(3);opacity:0}}
@keyframes nsFlash{0%{opacity:0}35%{opacity:.85}100%{opacity:0}}
@keyframes nsRing{0%{transform:translate(-50%,-50%) scale(.05);opacity:1;border-width:8px}100%{transform:translate(-50%,-50%) scale(7);opacity:0;border-width:1px}}
@keyframes nsSpark{0%{transform:rotate(var(--a)) translateX(0) scale(1);opacity:1}100%{transform:rotate(var(--a)) translateX(var(--d)) scale(.2);opacity:0}}
@keyframes nsBloom{0%{transform:scale(.12) rotate(-160deg);animation-timing-function:cubic-bezier(.15,.75,.35,1)}24%{transform:scale(6.2) rotate(-95deg);animation-timing-function:cubic-bezier(.55,0,.25,1)}100%{transform:scale(1) rotate(0deg)}}
@keyframes nsSoft{0%{opacity:0;filter:blur(10px) brightness(2.4) saturate(1.6)}10%{opacity:1;filter:blur(3px) brightness(1.9) saturate(1.6)}70%{opacity:1;filter:blur(0) brightness(1.5) saturate(1.45)}100%{opacity:0;filter:none}}
@keyframes nsCrisp{0%,62%{opacity:0}100%{opacity:1}}
@keyframes nsHalo{to{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes nsUp{from{transform:translateY(22px);opacity:0;filter:blur(8px)}to{transform:none;opacity:1;filter:none}}
`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement("div"); el.id = "nsSplash"; el.setAttribute("aria-hidden", "true");
  let stars = ""; for (let i = 0; i < 70; i++) stars += `<i style="left:${(i * 37) % 100}%;top:${(i * 61) % 100}%;opacity:${0.2 + (i % 4) * 0.15};${i % 6 ? "" : "width:2px;height:2px"}"></i>`;
  let sparks = ""; for (let i = 0; i < 24; i++) sparks += `<span class="spark" style="--a:${(i * 360) / 24 + (i % 2 ? 6 : -4)}deg;--d:${160 + (i % 5) * 45}px;width:${3 + (i % 3) * 2}px;height:${3 + (i % 3) * 2}px"></span>`;
  el.innerHTML = `<div class="st">${stars}</div><div class="halo"></div><div class="core"><div class="bloom"><img class="soft" src="/logo-big.jpg" alt=""><img class="crisp" src="/logo-big.jpg" alt=""></div>${sparks}<div class="ring"></div><div class="star"></div></div><div class="name">Nebulux Sites</div><div class="flash"></div><div class="ns-skip">Tap to skip</div>`;
  const add = () => document.body.prepend(el);
  document.body ? add() : document.addEventListener("DOMContentLoaded", add);
  document.documentElement.style.overflow = "hidden";
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    const target = document.querySelector("header .logo img");
    const core = el.querySelector(".core");
    el.classList.add("fly");
    if (target) {
      // fly the logo into the header logo's spot
      const a = core.getBoundingClientRect(), b = target.getBoundingClientRect();
      const s = b.width / a.width, dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      core.style.transition = "transform .7s cubic-bezier(.65,0,.35,1)";
      core.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
      target.style.opacity = "0";
      setTimeout(() => { target.style.transition = "opacity .25s"; target.style.opacity = "1"; el.classList.add("gone"); }, 680);
    } else el.classList.add("gone");
    setTimeout(() => { el.remove(); st.remove(); document.documentElement.style.overflow = ""; }, 1300);
  };
  el.addEventListener("click", finish);
  setTimeout(finish, 3500);
})();
