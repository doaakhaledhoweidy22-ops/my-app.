// Lightweight night sky: twinkling stars + an occasional shooting star.
// ≤140 stars, 30fps cap, DPR cap, pauses when the tab is hidden, static when reduced-motion is on.
export function startStars(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0, h = 0, stars = [], shoot = null, raf = 0, last = 0;

  function resize() {
    w = innerWidth; h = innerHeight;
    canvas.width = w * DPR; canvas.height = h * DPR;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(140, (w * h) / 13000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.15 + 0.25,
      p: Math.random() * 6.28, v: Math.random() * 0.025 + 0.006, gold: Math.random() < 0.2,
    }));
    draw(0);
  }

  function draw(step) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.p += s.v * step;
      const a = 0.3 + 0.7 * (Math.sin(s.p) * 0.5 + 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.gold ? "#e4c9a0" : "#dfe6ff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (shoot) {
      const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9);
      g.addColorStop(0, `rgba(255,244,222,${shoot.life})`); g.addColorStop(1, "rgba(255,244,222,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 9, shoot.y - shoot.vy * 9); ctx.stroke();
      shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= 0.018;
      if (shoot.life <= 0 || shoot.x > w + 50 || shoot.y > h + 50) shoot = null;
    } else if (Math.random() < 0.0028) {
      shoot = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.35, vx: 9 + Math.random() * 4, vy: 4 + Math.random() * 3, life: 1 };
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t; draw(1);
  }
  const run = () => { cancelAnimationFrame(raf); if (!reduce && !document.hidden) raf = requestAnimationFrame(frame); };

  addEventListener("resize", () => { resize(); run(); });
  document.addEventListener("visibilitychange", run);
  resize(); run();
}
