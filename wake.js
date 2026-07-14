(function () {
  const canvas = document.getElementById("wake");
  const ctx = canvas.getContext("2d");
  let width, height;
  let mouseX = -1000, mouseY = -1000;
  let prevMouseX = -1000, prevMouseY = -1000;
  let menuVisible = false;
  let overButton = false;

  const trails = [];
  const MAX_TRAIL = 60;
  const ripples = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function isOverButton(x, y) {
    const items = document.querySelectorAll(".menu-item");
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return true;
      }
    }
    return false;
  }

  function spawnRippleFromButton(btn) {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const edges = [
      { x: r.left, y: cy, dx: -1, dy: 0 },
      { x: r.right, y: cy, dx: 1, dy: 0 },
      { x: cx, y: r.top, dx: 0, dy: -1 },
      { x: cx, y: r.bottom, dx: 0, dy: 1 },
      { x: r.left, y: r.top, dx: -0.7, dy: -0.7 },
      { x: r.right, y: r.top, dx: 0.7, dy: -0.7 },
      { x: r.left, y: r.bottom, dx: -0.7, dy: 0.7 },
      { x: r.right, y: r.bottom, dx: 0.7, dy: 0.7 },
    ];

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const maxDist = Math.sqrt(width * width + height * height);
      const speed = 3 + Math.random() * 2;
      const life = Math.ceil(maxDist / speed) + 20;
      ripples.push({
        x: e.x,
        y: e.y,
        vx: e.dx * speed,
        vy: e.dy * speed,
        life: life,
        maxLife: life,
      });
    }
  }

  let rippleCooldown = 0;

  document.addEventListener("mousemove", function (e) {
    prevMouseX = mouseX;
    prevMouseY = mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!menuVisible) return;

    const wasOverButton = overButton;
    overButton = isOverButton(mouseX, mouseY);

    if (!overButton) {
      const dx = mouseX - prevMouseX;
      const dy = mouseY - prevMouseY;
      const speed = Math.sqrt(dx * dx + dy * dy);

      if (speed > 1) {
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle + Math.PI / 2;
        const spread = 3 + speed * 0.3;

        trails.push({
          x: mouseX,
          y: mouseY,
          angle: perpAngle,
          spread: spread,
          life: 1.0,
          decay: 0.015 + 0.005 * Math.min(speed, 10),
        });

        if (Math.random() < 0.5) {
          trails.push({
            x: mouseX,
            y: mouseY,
            angle: perpAngle + Math.PI,
            spread: spread,
            life: 1.0,
            decay: 0.015 + 0.005 * Math.min(speed, 10),
          });
        }

        while (trails.length > MAX_TRAIL) {
          trails.shift();
        }
      }

      if (!wasOverButton && rippleCooldown <= 0) {
        const items = document.querySelectorAll(".menu-item");
        for (let i = 0; i < items.length; i++) {
          spawnRippleFromButton(items[i]);
        }
        rippleCooldown = 8;
      }
    }
  });

  function animate() {
    ctx.clearRect(0, 0, width, height);

    if (!menuVisible) {
      requestAnimationFrame(animate);
      return;
    }

    if (rippleCooldown > 0) rippleCooldown--;

    for (let i = trails.length - 1; i >= 0; i--) {
      const t = trails[i];
      t.life -= t.decay;
      if (t.life <= 0) {
        trails.splice(i, 1);
        continue;
      }

      const len = t.spread * t.life;
      const alpha = t.life * 0.4;

      ctx.beginPath();
      ctx.moveTo(
        t.x - Math.cos(t.angle) * len,
        t.y - Math.sin(t.angle) * len
      );
      ctx.lineTo(
        t.x + Math.cos(t.angle) * len,
        t.y + Math.sin(t.angle) * len
      );
      ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
      ctx.lineWidth = 1.2 * t.life;
      ctx.stroke();
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.x += r.vx;
      r.y += r.vy;
      r.life -= 1;

      if (r.life <= 0 || r.x < -50 || r.x > width + 50 || r.y < -50 || r.y > height + 50) {
        ripples.splice(i, 1);
        continue;
      }

      const progress = 1 - r.life / r.maxLife;
      const alpha = (1 - progress * progress) * 0.6;
      const size = progress * 12 + 2;

      ctx.beginPath();
      ctx.arc(r.x, r.y, size, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    requestAnimationFrame(animate);
  }

  const observer = new MutationObserver(function () {
    if (document.getElementById("menu").classList.contains("visible")) {
      menuVisible = true;
    }
  });
  observer.observe(document.getElementById("menu"), { attributes: true, attributeFilter: ["class"] });

  resize();
  animate();
  window.addEventListener("resize", resize);
})();
