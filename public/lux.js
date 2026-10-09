// The starfield and glow behind every inner page (matches the homepage).
(() => {
  const c = document.createElement("canvas"); c.id = "stars";
  const a = document.createElement("div"); a.className = "aurora";
  document.body.prepend(a); document.body.prepend(c);
  const x = c.getContext("2d"); let S = [], W, H;
  const size = () => { W = c.width = innerWidth * devicePixelRatio; H = c.height = innerHeight * devicePixelRatio; S = Array.from({ length: Math.min(200, (innerWidth * innerHeight) / 6000) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 * devicePixelRatio + .2, t: Math.random() * 6 })); };
  size(); addEventListener("resize", size);
  (function draw(now) { x.clearRect(0, 0, W, H); for (const p of S) { x.fillStyle = `rgba(220,210,255,${.3 + Math.sin(now / 1000 + p.t) * .25})`; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); } requestAnimationFrame(draw); })(0);
  document.querySelectorAll("main > *").forEach((el, i) => { el.classList.add("fade-in"); el.style.animationDelay = i * 0.06 + "s"; });
})();
