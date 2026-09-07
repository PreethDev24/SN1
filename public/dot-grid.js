(function () {
  const host = document.getElementById("who-we-are-image-box");
  if (!host) return;

  const config = {
    dotSize: 4,
    gap: 18,
    baseColor: "#2b2b2b",
    activeColor: "#c9a227",
    proximity: 150,
    speedTrigger: 600,
    shockRadius: 220,
    shockStrength: 16,
    maxSpeed: 5000,
    resistance: 0.86,
  };

  const section = document.createElement("section");
  section.className = "dot-grid";
  const wrap = document.createElement("div");
  wrap.className = "dot-grid__wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "dot-grid__canvas";
  wrap.appendChild(canvas);
  section.appendChild(wrap);
  host.appendChild(section);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let dots = [];
  let width = 0;
  let height = 0;
  let raf = 0;

  const pointer = {
    x: -1000,
    y: -1000,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  };

  function hexToRgb(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
    };
  }

  const baseRgb = hexToRgb(config.baseColor);
  const activeRgb = hexToRgb(config.activeColor);

  function buildGrid() {
    const rect = wrap.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cell = config.dotSize + config.gap;
    const cols = Math.max(1, Math.floor((width + config.gap) / cell));
    const rows = Math.max(1, Math.floor((height + config.gap) / cell));
    const gridW = cell * cols - config.gap;
    const gridH = cell * rows - config.gap;
    const startX = (width - gridW) / 2 + config.dotSize / 2;
    const startY = (height - gridH) / 2 + config.dotSize / 2;

    dots = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        dots.push({
          cx: startX + x * cell,
          cy: startY + y * cell,
          xOffset: 0,
          yOffset: 0,
          vx: 0,
          vy: 0,
        });
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const proxSq = config.proximity * config.proximity;
    const radius = config.dotSize / 2;

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      dot.vx *= config.resistance;
      dot.vy *= config.resistance;
      dot.xOffset += dot.vx;
      dot.yOffset += dot.vy;
      dot.xOffset *= 0.93;
      dot.yOffset *= 0.93;

      const ox = dot.cx + dot.xOffset;
      const oy = dot.cy + dot.yOffset;
      const dx = dot.cx - pointer.x;
      const dy = dot.cy - pointer.y;
      const dsq = dx * dx + dy * dy;

      let color = config.baseColor;
      if (dsq <= proxSq) {
        const dist = Math.sqrt(dsq);
        const t = 1 - dist / config.proximity;
        const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
        const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
        const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
        color = "rgb(" + r + "," + g + "," + b + ")";
      }

      ctx.beginPath();
      ctx.arc(ox, oy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  }

  function onMove(e) {
    const now = performance.now();
    const dt = pointer.lastTime ? now - pointer.lastTime : 16;
    const dx = e.clientX - pointer.lastX;
    const dy = e.clientY - pointer.lastY;

    let vx = (dx / dt) * 1000;
    let vy = (dy / dt) * 1000;
    let speed = Math.hypot(vx, vy);
    if (speed > config.maxSpeed) {
      const scale = config.maxSpeed / speed;
      vx *= scale;
      vy *= scale;
      speed = config.maxSpeed;
    }

    pointer.lastTime = now;
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
    pointer.vx = vx;
    pointer.vy = vy;
    pointer.speed = speed;

    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    if (pointer.x < 0 || pointer.y < 0 || pointer.x > rect.width || pointer.y > rect.height) return;
    if (speed < config.speedTrigger) return;

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dist = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
      if (dist < config.proximity) {
        const influence = 1 - dist / config.proximity;
        dot.vx += ((dot.cx - pointer.x) + vx * 0.005) * 0.02 * influence;
        dot.vy += ((dot.cy - pointer.y) + vy * 0.005) * 0.02 * influence;
      }
    }
  }

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return;

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
      if (dist < config.shockRadius) {
        const falloff = Math.max(0, 1 - dist / config.shockRadius);
        dot.vx += (dot.cx - cx) * 0.03 * config.shockStrength * falloff;
        dot.vy += (dot.cy - cy) * 0.03 * config.shockStrength * falloff;
      }
    }
  }

  let moveTicking = false;
  function onMoveThrottled(e) {
    if (moveTicking) return;
    moveTicking = true;
    requestAnimationFrame(function () {
      onMove(e);
      moveTicking = false;
    });
  }

  buildGrid();
  draw();

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(buildGrid) : null;
  if (ro) ro.observe(wrap);
  else window.addEventListener("resize", buildGrid);

  window.addEventListener("mousemove", onMoveThrottled, { passive: true });
  window.addEventListener("click", onClick);
  window.addEventListener("beforeunload", function () {
    cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    else window.removeEventListener("resize", buildGrid);
    window.removeEventListener("mousemove", onMoveThrottled);
    window.removeEventListener("click", onClick);
  });
})();
