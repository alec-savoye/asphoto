(function () {
  const canvas = document.getElementById("ripple");
  const ctx = canvas.getContext("2d");

  let img = new Image();
  img.src = "assets/DULUTHSUP_025_preview.jpeg";

  let width, height;
  let ripple1, ripple2;
  let texture;
  let activeBuffer = 0;

  const DAMPING = 0.97;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    ripple1 = new Float32Array(width * height);
    ripple2 = new Float32Array(width * height);
    buildTexture();
  }

  function buildTexture() {
    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const octx = offscreen.getContext("2d");

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canAspect = width / height;
    let dw, dh, dx, dy;

    if (canAspect > imgAspect) {
      dw = width;
      dh = width / imgAspect;
      dx = 0;
      dy = (height - dh) / 2;
    } else {
      dh = height;
      dw = height * imgAspect;
      dx = (width - dw) / 2;
      dy = 0;
    }

    octx.drawImage(img, dx, dy, dw, dh);
    const imgData = octx.getImageData(0, 0, width, height);
    texture = new Uint32Array(imgData.data.buffer).slice();
  }

  function dropRipple(x, y, radius, strength) {
    const r = Math.max(1, radius);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const dist = Math.sqrt(i * i + j * j);
        if (dist < r) {
          const px = Math.round(x) + i;
          const py = Math.round(y) + j;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = py * width + px;
            const current = activeBuffer === 0 ? ripple1 : ripple2;
            current[idx] += strength * (1 - dist / r);
          }
        }
      }
    }
  }

  function processRipple() {
    const curr = activeBuffer === 0 ? ripple1 : ripple2;
    const prev = activeBuffer === 0 ? ripple2 : ripple1;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        curr[idx] =
          ((prev[idx - 1] + prev[idx + 1] + prev[idx - width] + prev[idx + width]) / 2 - curr[idx]) * DAMPING;
      }
    }

    activeBuffer = 1 - activeBuffer;
  }

  function render() {
    const prev = activeBuffer === 0 ? ripple2 : ripple1;
    const imageData = ctx.createImageData(width, height);
    const pixels = new Uint32Array(imageData.data.buffer);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        const xOffset = Math.round(prev[idx - 1] - prev[idx + 1]);
        const yOffset = Math.round(prev[idx - width] - prev[idx + width]);

        let sx = x + xOffset;
        let sy = y + yOffset;

        if (sx < 0) sx = 0;
        if (sx >= width) sx = width - 1;
        if (sy < 0) sy = 0;
        if (sy >= height) sy = height - 1;

        pixels[idx] = texture[sy * width + sx];
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function animate() {
    processRipple();
    render();
    requestAnimationFrame(animate);
  }

  let lastX = 0, lastY = 0;

  canvas.addEventListener("mousemove", function (e) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(3 + speed * 0.15, 12);
    const strength = Math.min(50 + speed * 2, 200);
    dropRipple(e.clientX, e.clientY, radius, strength);
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(3 + speed * 0.15, 12);
    const strength = Math.min(50 + speed * 2, 200);
    dropRipple(touch.clientX, touch.clientY, radius, strength);
    lastX = touch.clientX;
    lastY = touch.clientY;
  }, { passive: false });

  canvas.addEventListener("click", function (e) {
    dropRipple(e.clientX, e.clientY, 20, 400);
  });

  img.onload = function () {
    resize();
    animate();

    setTimeout(function () {
      document.getElementById("coming-soon").classList.add("fade-out");
    }, 3000);

    setTimeout(function () {
      document.getElementById("fade-overlay").classList.add("active");
      setTimeout(function () {
        document.getElementById("fade-overlay").classList.add("menu-bg");
        document.getElementById("menu").classList.add("visible");
      }, 3000);
    }, 6000);
  };

  window.addEventListener("resize", resize);
})();
