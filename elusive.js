(function () {
  const btn = document.getElementById("elusive-btn");
  let escaping = false;
  let btnX, btnY, btnW, btnH;
  let targetX, targetY;
  let vx = 0, vy = 0;
  let wanderAngle = Math.random() * Math.PI * 2;
  let wanderTimer = 0;
  let hasFledOnce = false;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function clampTarget() {
    const margin = 20;
    targetX = clamp(targetX, margin, window.innerWidth - btnW - margin);
    targetY = clamp(targetY, margin, window.innerHeight - btnH - margin);
  }

  function startEscaping() {
    if (escaping) return;
    escaping = true;

    const rect = btn.getBoundingClientRect();
    btnX = rect.left;
    btnY = rect.top;
    btnW = rect.width;
    btnH = rect.height;
    btn.classList.add("escaping");
    btn.style.left = btnX + "px";
    btn.style.top = btnY + "px";
    btn.style.transform = "none";

    targetX = btnX;
    targetY = btnY;

    btn.addEventListener("mouseover", flee);
    btn.addEventListener("touchstart", flee);
    document.addEventListener("mousemove", trackMouse);
    tick();
  }

  let mouseX = -1000, mouseY = -1000;

  function trackMouse(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!escaping || !hasFledOnce) return;

    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - mouseX;
    const dy = cy - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 150) {
      flee();
    }
  }

  function flee() {
    hasFledOnce = true;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = cx - mouseX;
    const dy = cy - mouseY;

    const fleeAngle = Math.atan2(dy, dx);
    const randomOffset = (Math.random() - 0.5) * 1.5;
    const angle = fleeAngle + randomOffset;

    const fleeDist = 120 + Math.random() * 200;
    targetX = btnX + Math.cos(angle) * fleeDist;
    targetY = btnY + Math.sin(angle) * fleeDist;
    clampTarget();
  }

  function tick() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 20;

    if (hasFledOnce) {
      wanderTimer--;
      if (wanderTimer <= 0) {
        wanderAngle += (Math.random() - 0.5) * 1.2;
        wanderTimer = 30 + Math.random() * 60;
        targetX += Math.cos(wanderAngle) * (40 + Math.random() * 60);
        targetY += Math.sin(wanderAngle) * (40 + Math.random() * 60);
        clampTarget();
      }
    }

    const dx = targetX - btnX;
    const dy = targetY - btnY;
    vx += dx * 0.04;
    vy += dy * 0.04;
    vx *= 0.85;
    vy *= 0.85;

    btnX += vx;
    btnY += vy;

    btnX = clamp(btnX, margin, w - btnW - margin);
    btnY = clamp(btnY, margin, h - btnH - margin);

    if (btnX <= margin || btnX >= w - btnW - margin) {
      vx *= -0.5;
      targetX = clamp(btnX + 50 * Math.sign(vx || 1), margin, w - btnW - margin);
    }
    if (btnY <= margin || btnY >= h - btnH - margin) {
      vy *= -0.5;
      targetY = clamp(btnY + 50 * Math.sign(vy || 1), margin, h - btnH - margin);
    }

    btn.style.left = btnX + "px";
    btn.style.top = btnY + "px";

    requestAnimationFrame(tick);
  }

  const observer = new MutationObserver(function () {
    if (document.getElementById("menu").classList.contains("visible")) {
      setTimeout(startEscaping, 100);
    }
  });
  observer.observe(document.getElementById("menu"), { attributes: true, attributeFilter: ["class"] });
})();
