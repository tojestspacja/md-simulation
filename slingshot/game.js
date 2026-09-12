// SLINGSHOT — get the probe to the flag. You get one push; the planets do the rest.
//
// One gesture: drag back from the probe, let go. Everything after that is
// Newtonian gravity with nothing added — a = sum of M/r^2 toward each body,
// integrated with velocity Verlet.
//
// Why this physics and not something more exotic: it is VISIBLE (you watch the
// path bend), DETERMINISTIC (the same launch gives the same flight, so you can
// learn), and STEERABLE (angle and power are pure skill). A miss tells you which
// way to go, which is the whole teaching mechanism — that and the ghost trails
// of everything you already tried.
//
// Every level geometry here was verified in a headless harness before it was
// drawn: solvable, with a miss-distance landscape you can walk down. Level 7 was
// additionally PROVED impossible without the moon — capped below escape velocity,
// the furthest any launch can reach is r = 1006, analytically and by brute force
// over every angle and power. The boundary sits at 1150.
(() => {
  "use strict";

  const cv = document.getElementById("sky");
  const ctx = cv.getContext("2d");
  const CW = cv.width, CH = cv.height;
  const $ = (id) => document.getElementById(id);

  const DT = 1 / 240;              // physics step; several per frame
  const TRAIL_KEEP = 5;            // how many past attempts stay on screen

  // ---------- bodies ----------
  const planet = (x, y, M, r) => ({ kind: "planet", x, y, M, r });
  const moon = (cx, cy, R, M, r, omega, phase) =>
    ({ kind: "moon", cx, cy, R, M, r, omega, phase });

  function bodyAt(b, t) {
    if (b.kind === "planet") return [b.x, b.y];
    const a = b.phase + b.omega * t;
    return [b.cx + Math.cos(a) * b.R, b.cy + Math.sin(a) * b.R];
  }

  function accel(x, y, bodies, t) {
    let ax = 0, ay = 0;
    for (const b of bodies) {
      const [bx, by] = bodyAt(b, t);
      const dx = bx - x, dy = by - y;
      const r2 = Math.max(dx * dx + dy * dy, 1);
      const r = Math.sqrt(r2);
      ax += b.M * dx / (r2 * r);
      ay += b.M * dy / (r2 * r);
    }
    return [ax, ay];
  }

  // velocity Verlet: holds an orbit to 0.2 px over 20 laps at this step size
  function integrate(s, bodies, t, dt) {
    const [ax, ay] = accel(s.x, s.y, bodies, t);
    s.x += s.vx * dt + 0.5 * ax * dt * dt;
    s.y += s.vy * dt + 0.5 * ay * dt * dt;
    const [a2, b2] = accel(s.x, s.y, bodies, t + dt);
    s.vx += 0.5 * (ax + a2) * dt;
    s.vy += 0.5 * (ay + b2) * dt;
  }

  // ---------- the seven ----------
  const MOON_OM = Math.sqrt(6e6 / 460) / 460;     // the moon at its own circular speed

  const LEVELS = [
    { name: "the push", hint: "drag back from the probe, then let go",
      start: [120, 400], flag: [830, 400], flagR: 30, bodies: [], maxP: 300, maxT: 6 },

    { name: "it bends", hint: "something out there is pulling",
      start: [110, 450], flag: [860, 450], flagR: 46,
      bodies: [planet(470, 250, 9e5, 40)], maxP: 300, maxT: 8 },

    { name: "aim away", hint: "straight at it will not work",
      start: [100, 270], flag: [770, 270], flagR: 34,
      bodies: [planet(430, 270, 7e5, 34)], maxP: 300, maxT: 9 },

    { name: "the circle", hint: "too slow and you fall in, too fast and you sail past",
      start: [480, 70], flag: [480, 470], flagR: 30,
      bodies: [planet(480, 270, 1.6e6, 38)], maxP: 200, maxT: 15 },

    { name: "round the back", hint: "go the long way",
      start: [110, 460], flag: [600, 120], flagR: 32,
      bodies: [planet(470, 300, 1.5e6, 44)], maxP: 280, maxT: 11 },

    { name: "two of them", hint: "small changes matter a lot now",
      start: [90, 270], flag: [880, 270], flagR: 32,
      bodies: [planet(360, 160, 9e5, 34), planet(620, 390, 9e5, 34)],
      maxP: 300, maxT: 10 },

    { name: "the way out", hint: "your engine is not strong enough. the moon is",
      start: [170, 250], ring: 1150, ringAt: [430, 250], flagR: 0,
      bodies: [planet(430, 250, 6e6, 46), moon(430, 250, 460, 2.5e6, 34, MOON_OM, 3.14)],
      maxP: 185, maxT: 30, fullPreview: true, zoomOut: 2.6 },
  ];

  // ---------- state ----------
  let li = 0, lv = null;
  let mode = "aim";                // aim | fly | done
  let probe = null, t = 0;
  let path = [], ghosts = [];
  let aimFrom = null, aimTo = null;
  let view = { cx: 480, cy: 270, w: 960 };
  let viewTarget = { cx: 480, cy: 270, w: 960 };
  let baseView = { cx: 480, cy: 270, w: 960 };    // the level, without the probe
  let tries = 0, showPhys = false, flash = null, flashT = 0;

  function loadLevel(i) {
    li = i; lv = LEVELS[i];
    mode = "aim"; probe = null; t = 0;
    path = []; ghosts = []; tries = 0;
    aimFrom = null; aimTo = null;
    computeBase();
    frameNow(true);
    $("h-num").textContent = (i + 1) + "/" + LEVELS.length;
    $("h-name").textContent = lv.name;
    $("hint").textContent = lv.hint;
  }

  // ---------- camera: fit everything that matters, and follow the probe out ----------
  function boxOf(pts) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const pad = 90;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
             w: Math.max(x1 - x0, (y1 - y0) * (CW / CH), 700) };
  }
  // The level on its own: this is the framing the player has to be able to read.
  function levelPoints() {
    const pts = [[lv.start[0], lv.start[1]]];
    if (lv.flag) pts.push(lv.flag);
    for (const b of lv.bodies) {
      if (b.kind === "planet") pts.push([b.x - b.r, b.y - b.r], [b.x + b.r, b.y + b.r]);
      else pts.push([b.cx - b.R, b.cy - b.R], [b.cx + b.R, b.cy + b.R]);
    }
    return pts;
  }
  function computeBase() { baseView = boxOf(levelPoints()); }

  // Follow the probe, but never so far that the puzzle becomes unreadable.
  function frameNow(snap) {
    const pts = levelPoints();
    if (probe) pts.push([probe.x, probe.y]);
    const want = boxOf(pts);
    const cap = baseView.w * (lv.zoomOut || 1.5);
    const w = Math.min(want.w, cap);
    // as the view stops growing, let it drift toward the probe rather than clip it
    const k = want.w > cap ? 0.55 : 1;
    viewTarget = {
      cx: baseView.cx + (want.cx - baseView.cx) * k,
      cy: baseView.cy + (want.cy - baseView.cy) * k,
      w,
    };
    if (snap) view = { ...viewTarget };
  }
  const scale = () => CW / view.w;
  const sx = (x) => (x - view.cx) * scale() + CW / 2;
  const sy = (y) => (y - view.cy) * scale() + CH / 2;
  // screen back to world, for the drag
  const wx = (x) => (x - CW / 2) / scale() + view.cx;
  const wy = (y) => (y - CH / 2) / scale() + view.cy;

  // ---------- input: drag back, let go ----------
  function canvasPoint(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * CW / r.width, (e.clientY - r.top) * CH / r.height];
  }
  cv.addEventListener("pointerdown", (e) => {
    if (mode !== "aim") return;
    cv.setPointerCapture(e.pointerId);
    aimFrom = canvasPoint(e);
    aimTo = aimFrom.slice();
  });
  cv.addEventListener("pointermove", (e) => {
    if (mode !== "aim" || !aimFrom) return;
    aimTo = canvasPoint(e);
  });
  cv.addEventListener("pointerup", () => {
    if (mode !== "aim" || !aimFrom) return;
    const v = aimVector();
    aimFrom = null;
    if (v.power > 12) launch(v.angle, v.power);
  });

  // The drag is read in WORLD units so it means the same thing at any zoom.
  function aimVector() {
    if (!aimFrom || !aimTo) return { angle: 0, power: 0 };
    const dx = wx(aimFrom[0]) - wx(aimTo[0]);
    const dy = wy(aimFrom[1]) - wy(aimTo[1]);
    const d = Math.hypot(dx, dy);
    const power = Math.min(lv.maxP, d * 1.15);
    return { angle: Math.atan2(dy, dx), power };
  }

  function launch(angle, power) {
    probe = { x: lv.start[0], y: lv.start[1],
              vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
    t = 0; path = [[probe.x, probe.y]];
    mode = "fly"; tries++;
  }

  function endFlight(msg) {
    if (path.length > 3) {
      ghosts.push(path);
      if (ghosts.length > TRAIL_KEEP) ghosts.shift();
    }
    probe = null; path = []; mode = "aim";
    flash = msg; flashT = 1.6;
    frameNow(false);
  }

  function win() {
    mode = "done";
    const last = li + 1 >= LEVELS.length;
    show(last ? "OUT" : "ARRIVED",
      last
        ? "<p>You left the system on a push that could never have got you there.</p>" +
          "<p>Everything you did was ordinary gravity. The moon was moving, you fell past it " +
          "on the right side, and you came away with speed that used to be the moon's. " +
          "<b>That is a gravity assist</b>, and it is how every probe we have sent to the outer " +
          "planets actually got there.</p>" +
          "<p class='sub'>Seven levels, " + tries + " attempts on the last one.</p>"
        : "<p>" + tries + (tries === 1 ? " attempt." : " attempts.") + "</p>",
      last ? "again" : "next");
  }

  // ---------- the flight ----------
  function stepWorld(dtReal) {
    if (flashT > 0) { flashT -= dtReal; if (flashT <= 0) flash = null; }
    // ease the camera
    view.cx += (viewTarget.cx - view.cx) * Math.min(1, dtReal * 3);
    view.cy += (viewTarget.cy - view.cy) * Math.min(1, dtReal * 3);
    view.w += (viewTarget.w - view.w) * Math.min(1, dtReal * 3);
    if (mode !== "fly") return;

    let left = Math.min(dtReal, 0.05) * 1.0;
    let guard = 0;
    while (left > 1e-9 && guard++ < 400) {
      const h = Math.min(left, DT);
      integrate(probe, lv.bodies, t, h);
      t += h; left -= h;

      for (const b of lv.bodies) {                       // hit a body
        const [bx, by] = bodyAt(b, t);
        if (Math.hypot(bx - probe.x, by - probe.y) < b.r) return endFlight("crashed");
      }
      if (lv.flag) {
        const d = Math.hypot(lv.flag[0] - probe.x, lv.flag[1] - probe.y);
        if (d < lv.flagR) { path.push([probe.x, probe.y]); ghosts.push(path); return win(); }
      }
      if (lv.ring) {
        const d = Math.hypot(lv.ringAt[0] - probe.x, lv.ringAt[1] - probe.y);
        if (d > lv.ring) { path.push([probe.x, probe.y]); ghosts.push(path); return win(); }
      }
      const far = Math.hypot(probe.x - baseView.cx, probe.y - baseView.cy);
      if (far > baseView.w * (lv.zoomOut || 1.5) * 0.85) return endFlight("gone");
      if (t > lv.maxT) return endFlight("lost");
    }
    const lastP = path[path.length - 1];
    if (!lastP || Math.hypot(lastP[0] - probe.x, lastP[1] - probe.y) > 3)
      path.push([probe.x, probe.y]);
    frameNow(false);
  }

  // ---------- preview ----------
  // Short on most levels: enough to aim, not enough to solve it for you.
  // Level 7 gets the whole path, because there it is the difference between
  // aiming and guessing.
  function previewPath() {
    const v = aimVector();
    if (v.power < 12) return null;
    const s = { x: lv.start[0], y: lv.start[1],
                vx: Math.cos(v.angle) * v.power, vy: Math.sin(v.angle) * v.power };
    const span = lv.fullPreview ? lv.maxT : 0.55;
    const pts = [[s.x, s.y]];
    let tt = 0, guard = 0;
    while (tt < span && guard++ < 12000) {
      integrate(s, lv.bodies, tt, DT * 2);
      tt += DT * 2;
      for (const b of lv.bodies) {
        const [bx, by] = bodyAt(b, tt);
        if (Math.hypot(bx - s.x, by - s.y) < b.r) return pts;
      }
      if (lv.ring && Math.hypot(lv.ringAt[0] - s.x, lv.ringAt[1] - s.y) > lv.ring) {
        pts.push([s.x, s.y]); return pts;
      }
      if (pts.length === 0 || Math.hypot(pts[pts.length - 1][0] - s.x,
                                         pts[pts.length - 1][1] - s.y) > 4) pts.push([s.x, s.y]);
    }
    return pts;
  }

  // ---------- drawing ----------
  function draw() {
    ctx.fillStyle = "#070812";
    ctx.fillRect(0, 0, CW, CH);
    stars();

    if (lv.ring) {                                   // the boundary you must cross
      ctx.strokeStyle = "rgba(127,176,255,0.30)";
      ctx.setLineDash([7, 9]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(lv.ringAt[0]), sy(lv.ringAt[1]), lv.ring * scale(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const b of lv.bodies) {                     // moon paths
      if (b.kind !== "moon") continue;
      ctx.strokeStyle = "rgba(150,160,200,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx(b.cx), sy(b.cy), b.R * scale(), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const g of ghosts) drawPath(g, "rgba(127,176,255,0.30)", 1.1);
    if (mode === "fly") drawPath(path, "rgba(160,210,255,0.95)", 1.8);

    if (mode === "aim") {
      const p = previewPath();
      if (p) drawPath(p, lv.fullPreview ? "rgba(255,210,122,0.55)" : "rgba(255,210,122,0.8)",
                      1.4, true);
    }

    for (const b of lv.bodies) drawBody(b);
    if (lv.flag) drawFlag();
    drawProbe();
    if (mode === "aim") drawAim();
    if (showPhys) drawNumbers();
    if (flash) drawFlash();
  }

  function stars() {
    ctx.fillStyle = "rgba(180,195,255,0.42)";
    for (let i = 0; i < 70; i++) {
      const x = (i * 149.3) % CW, y = (i * 83.7) % CH;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  function drawPath(pts, style, w, dashed) {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    if (dashed) ctx.setLineDash([5, 6]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const X = sx(pts[i][0]), Y = sy(pts[i][1]);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  }

  function drawBody(b) {
    const [bx, by] = bodyAt(b, t);
    const X = sx(bx), Y = sy(by), R = b.r * scale();
    const g = ctx.createRadialGradient(X, Y, R * 0.2, X, Y, R * 3.4);
    g.addColorStop(0, b.kind === "moon" ? "rgba(190,200,235,0.30)" : "rgba(130,165,255,0.26)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, R * 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.kind === "moon" ? "#c8cfe8" : "#5f7fd8";
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.kind === "moon" ? "#eef1ff" : "#8aa6ee";
    ctx.beginPath(); ctx.arc(X - R * 0.3, Y - R * 0.3, R * 0.45, 0, Math.PI * 2); ctx.fill();
  }

  function drawFlag() {
    const X = sx(lv.flag[0]), Y = sy(lv.flag[1]), R = lv.flagR * scale();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
    ctx.strokeStyle = "rgba(255,210,122," + (0.35 + pulse * 0.45) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,210,122,0.16)";
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath(); ctx.arc(X, Y, Math.max(3, R * 0.22), 0, Math.PI * 2); ctx.fill();
  }

  function drawProbe() {
    const p = probe || { x: lv.start[0], y: lv.start[1] };
    const X = sx(p.x), Y = sy(p.y);
    if (!probe) {                                   // the launcher, waiting
      ctx.strokeStyle = "rgba(160,210,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X, Y, 15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#eaf1ff";
    ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(234,241,255,0.35)";
    ctx.beginPath(); ctx.arc(X, Y, 10, 0, Math.PI * 2); ctx.fill();
  }

  function drawAim() {
    if (!aimFrom || !aimTo) return;
    const v = aimVector();
    const X = sx(lv.start[0]), Y = sy(lv.start[1]);
    const len = (v.power / lv.maxP) * 78;
    ctx.strokeStyle = "rgba(255,210,122,0.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + Math.cos(v.angle) * len, Y + Math.sin(v.angle) * len);
    ctx.stroke();
    // a small power arc, so "how hard" is visible without a number
    ctx.strokeStyle = "rgba(255,210,122,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X, Y, 24, v.angle - 0.5, v.angle + 0.5);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(X, Y, 24, v.angle - 0.5, v.angle - 0.5 + (v.power / lv.maxP));
    ctx.stroke();
  }

  function drawNumbers() {
    ctx.font = "11px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "rgba(190,205,255,0.85)";
    const rows = [];
    if (probe) {
      const sp = Math.hypot(probe.vx, probe.vy);
      rows.push("speed  " + sp.toFixed(0) + " px/s");
      const b = lv.bodies[0];
      if (b) {
        const [bx, by] = bodyAt(b, t);
        const r = Math.hypot(bx - probe.x, by - probe.y);
        rows.push("range  " + r.toFixed(0) + " px");
        rows.push("energy " + (0.5 * sp * sp - b.M / r).toFixed(0) +
          (0.5 * sp * sp - b.M / r > 0 ? "  (free)" : "  (bound)"));
      }
      rows.push("t      " + t.toFixed(1) + " s");
    } else {
      const v = aimVector();
      rows.push("push   " + v.power.toFixed(0) + " / " + lv.maxP + " px/s");
      rows.push("a = sum of  M / r^2");
    }
    rows.forEach((s, i) => ctx.fillText(s, 16, CH - 20 - (rows.length - 1 - i) * 15));
  }

  function drawFlash() {
    ctx.globalAlpha = Math.min(1, flashT * 1.6);
    ctx.font = "600 15px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "#8e9ac4";
    ctx.textAlign = "center";
    ctx.fillText(flash, CW / 2, 64);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // ---------- overlay ----------
  const ov = $("ov");
  function show(title, body, btn) {
    ov.querySelector("h1").textContent = title;
    ov.querySelector(".tag").textContent = title === "SLINGSHOT"
      ? "one push, and the planets do the rest" : "";
    $("ov-body").innerHTML = body;
    $("ov-go").textContent = btn;
    ov.classList.remove("hidden");
  }
  $("ov-go").addEventListener("click", () => {
    ov.classList.add("hidden");
    if (mode === "done") loadLevel(li + 1 >= LEVELS.length ? 0 : li + 1);
  });
  $("b-retry").addEventListener("click", () => { if (mode !== "done") endFlight(null); });
  $("b-phys").addEventListener("click", () => {
    showPhys = !showPhys;
    $("b-phys").classList.toggle("on", showPhys);
  });
  addEventListener("keydown", (e) => {
    if (e.code === "KeyR") { if (mode !== "done") endFlight(null); }
    if (e.code === "KeyP") $("b-phys").click();
    if (e.code === "Enter" && !ov.classList.contains("hidden")) $("ov-go").click();
  });

  // ---------- go ----------
  loadLevel(0);
  show("SLINGSHOT",
    "<p><b>Drag back from the probe and let go.</b> That is the whole game — you only " +
    "get the one push, and gravity does everything after it.</p>" +
    "<p>Every path you fly stays on screen. Missing is how you aim: if you came up short, " +
    "pull back harder; if you curled the wrong way, start from the other side.</p>" +
    "<p class='sub'>Seven of them. The last one cannot be done with your engine at all.</p>",
    "launch");

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (ov.classList.contains("hidden")) stepWorld(dt);
    draw();
    requestAnimationFrame(loop);
  })(last);

  // read-only hooks so the levels can be checked from a script
  window.Slingshot = {
    state: () => ({ level: li, mode, tries, ghosts: ghosts.length,
                    probe: probe ? { x: probe.x, y: probe.y,
                                     v: Math.hypot(probe.vx, probe.vy) } : null }),
    goto: (i) => { ov.classList.add("hidden"); loadLevel(i); },
    // fire a shot directly, and report how close it came
    tryShot: (angDeg, power) => {
      const a = angDeg * Math.PI / 180;
      const s = { x: lv.start[0], y: lv.start[1],
                  vx: Math.cos(a) * power, vy: Math.sin(a) * power };
      let tt = 0, best = Infinity;
      while (tt < lv.maxT) {
        integrate(s, lv.bodies, tt, DT); tt += DT;
        for (const b of lv.bodies) {
          const [bx, by] = bodyAt(b, tt);
          if (Math.hypot(bx - s.x, by - s.y) < b.r) return { out: "crash", best };
        }
        if (lv.flag) {
          const d = Math.hypot(lv.flag[0] - s.x, lv.flag[1] - s.y);
          if (d < best) best = d;
          if (d < lv.flagR) return { out: "hit", best: d, t: tt };
        }
        if (lv.ring && Math.hypot(lv.ringAt[0] - s.x, lv.ringAt[1] - s.y) > lv.ring)
          return { out: "hit", best: 0, t: tt };
      }
      return { out: "miss", best };
    },
    maxPower: () => lv.maxP,
    levels: LEVELS.length,
  };
})();
