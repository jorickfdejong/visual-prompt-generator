/* The party after the tutorial: confetti from both bottom corners and a cheering puppet. Nothing blocks the app, and it cleans itself up. */
const COLORS = ['#f0a04b', '#4ba3f0', '#78c88c', '#e86a6a', '#f2d45c', '#b58cf0'];
const LIFE = 1870;

export function celebrate() {
  document.querySelector('#tutParty')?.remove();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.id = 'tutParty';
  el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="partyBox" role="status">
    <svg viewBox="0 0 100 110" aria-hidden="true"><g class="partyDoll"><circle cx="50" cy="26" r="8"/><path d="M50 50v24"/><path class="partyArmL" d="M50 52L24 38"/><path class="partyArmR" d="M50 52l26-14"/><path d="M50 73L38 100M50 73l12 27"/></g></svg>
    <b>Tutorial finished!</b><span>Have fun building your scene.</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), LIFE);
  if (!calm) confetti(el, el.querySelector('canvas'));
}

function confetti(el, canvas) {
  const W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight, g = canvas.getContext('2d');
  const k = Math.sqrt(H / 700);   // the same arc on every window height
  const bits = [];
  for (let i = 0; i < 180; i++) {
    const left = i % 2 === 0, angle = (50 + Math.random() * 35) * Math.PI / 180, v = (620 + Math.random() * 620) * k;
    bits.push({
      x: left ? -5 : W + 5, y: H * .92, vx: Math.cos(angle) * v * (left ? 1 : -1), vy: -Math.sin(angle) * v,
      wait: Math.floor(i / 60) * .35 + Math.random() * .1, size: 6 + Math.random() * 6, color: COLORS[Math.floor(Math.random() * COLORS.length)], round: i % 5 === 0,
      turn: Math.random() * 6.3, spin: (Math.random() - .5) * 12, flip: Math.random() * 6.3, flipSpeed: 5 + Math.random() * 8,
    });
  }
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    if (!el.isConnected) return;
    const t = (now - start) / 1000, dt = Math.min(.05, (now - last) / 1000);
    last = now;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, Math.min(1, (LIFE / 1000 - t) / .7));
    for (const b of bits) {
      if (t < b.wait) continue;
      b.vy += 900 * k * dt;
      b.vx *= 1 - .9 * dt;
      b.vy *= 1 - .9 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.turn += b.spin * dt; b.flip += b.flipSpeed * dt;
      g.save();
      g.translate(b.x, b.y); g.rotate(b.turn); g.scale(1, Math.cos(b.flip));
      g.fillStyle = b.color;
      if (b.round) { g.beginPath(); g.arc(0, 0, b.size / 2, 0, 6.3); g.fill(); } else g.fillRect(-b.size / 2, -b.size / 3, b.size, b.size / 1.5);
      g.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
