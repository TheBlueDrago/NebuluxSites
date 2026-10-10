// The starfield and glow behind every inner page (matches the homepage).
(() => {
  const c = document.createElement("canvas"); c.id = "stars";
  const a = document.createElement("div"); a.className = "aurora";
  document.body.prepend(a); document.body.prepend(c);
  const x = c.getContext("2d"); let S = [], W, H, lw = 0, last = 0; const dpr = Math.min(devicePixelRatio || 1, 2);
  // only when the width changes (phones resize as the address bar slides)
  const size = () => { if (innerWidth === lw && S.length) return; lw = innerWidth; W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; S = Array.from({ length: Math.min(200, (innerWidth * innerHeight) / 6000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 * dpr + .2, t: Math.random() * 6 })); };
  size(); addEventListener("resize", size);
  (function draw(now) { if (now - last < 32) return requestAnimationFrame(draw); last = now; x.clearRect(0, 0, W, H); for (const p of S) { x.fillStyle = `rgba(220,210,255,${.3 + Math.sin(now / 1000 + p.t) * .25})`; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); } requestAnimationFrame(draw); })(0);
  document.querySelectorAll("main > *").forEach((el, i) => { el.classList.add("fade-in"); el.style.animationDelay = i * 0.06 + "s"; });
})();
