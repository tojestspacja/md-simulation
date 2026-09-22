// SLINGSHOT — get the probe to the flag. You get one push; the planets do the rest.
//
// Newtonian gravity with nothing added: a = sum of M/r^2 toward each body,
// velocity Verlet at 1/240 s. Chosen because a mechanic has to be VISIBLE,
// DETERMINISTIC and STEERABLE, and gravity is the only candidate that passes all
// three without compromise.
//
// Every level geometry was verified in a headless harness before it was drawn.
// Level 7 was proved impossible without the moon: capped below escape velocity,
// the furthest any launch can reach is r = 1006 — analytically and by brute force
// over every angle and power. The boundary ring sits at 1150.
//
// The engine and the levels live in src/ so that this game and test/solver.mjs
// run the same code rather than two copies that drift. Run the harness after
// touching either: node test/solver.mjs
//
// Two things the picture is doing that are not decoration:
//   * the trail is coloured by SPEED, so a gravity assist is something you watch
//     happen rather than something you are told about;
//   * with the maths layer on, the wedges swept out from the planet are drawn at
//     equal time intervals. They come out equal in AREA — Kepler's second law —
//     because r x v is conserved, which this engine does to 2e-12 %.
import { DT, bodyAt, integrate } from "./src/physics.js";
import { LEVELS } from "./src/levels.js";
import {
  loadProgress, saveProgress, resetProgress,
  recordAttemptResult, getBestTries, levelState,
} from "./src/progress.js";

(() => {
  "use strict";

  const cv = document.getElementById("sky");
  const ctx = cv.getContext("2d");
  const CW = cv.width, CH = cv.height;
  const $ = (id) => document.getElementById(id);

  const TRAIL_KEEP = 5;
  const SWEEP_EVERY = 0.22;        // seconds between Kepler wedges

  // ---------- state ----------
  let li = 0, lv = null;
  let mode = "aim";
  let probe = null, t = 0;
  let path = [], sweep = [], ghosts = [];
  let closest = null, nextSweep = 0;
  let launchIC = null;
  let aimFrom = null, aimTo = null;
  let view = { cx: 480, cy: 270, w: 960 };
  let viewTarget = { ...view }, baseView = { ...view };
  let tries = 0, showMath = false;
  // The ids in campaign order, and the saved record keyed on them. Unlock
  // state is derived from this rather than stored — see src/progress.js.
  const ORDER = LEVELS.map((L) => L.id);
  let progress = loadProgress();
  let flash = null, flashT = 0, everLaunched = false;

  // A level can be named two ways: by where it currently sits, which is what
  // the game loop uses, or by its permanent id, which is what outlives
  // reordering. Everything funnels through here and then into loadLevel, so
  // there is still one way in. Bad references throw rather than quietly
  // loading level 1 — a typo that silently plays the wrong level is worse
  // than one that stops.
  function resolveLevelIndex(ref) {
    if (typeof ref === "number") {
      if (!Number.isInteger(ref) || ref < 0 || ref >= LEVELS.length)
        throw new RangeError("slingshot: no level at index " + ref);
      return ref;
    }
    if (typeof ref === "string") {
      const i = LEVELS.findIndex((L) => L.id === ref);
      if (i < 0) throw new RangeError("slingshot: no level with id " + JSON.stringify(ref));
      return i;
    }
    throw new TypeError("slingshot: level must be an index or an id, got " + typeof ref);
  }

  function loadLevel(i) {
    li = i; lv = LEVELS[i];
    mode = "aim"; probe = null; t = 0;
    path = []; sweep = []; ghosts = []; tries = 0;
    closest = null; aimFrom = null; aimTo = null;
    computeBase(); frameNow(true);
    $("h-num").textContent = (i + 1) + "/" + LEVELS.length;
    $("h-name").textContent = lv.name;
    $("hint").textContent = lv.hint;
    drawDots();
  }

  // ---------- camera: follow the probe, never so far the puzzle is unreadable ----------
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
  function levelPoints() {
    const pts = [[lv.start[0], lv.start[1]]];
    if (lv.flag) pts.push(lv.flag);
    for (const b of lv.bodies) {
      if (b.kind === "planet") pts.push([b.x - b.r, b.y - b.r], [b.x + b.r, b.y + b.r]);
      else pts.push([b.cx - b.R, b.cy - b.R], [b.cx + b.R, b.cy + b.R]);
    }
    return pts;
  }
  const computeBase = () => { baseView = boxOf(levelPoints()); };
  function frameNow(snap) {
    const pts = levelPoints();
    if (probe) pts.push([probe.x, probe.y]);
    const want = boxOf(pts);
    const cap = baseView.w * (lv.zoomOut || 1.5);
    const k = want.w > cap ? 0.55 : 1;
    viewTarget = { cx: baseView.cx + (want.cx - baseView.cx) * k,
                   cy: baseView.cy + (want.cy - baseView.cy) * k,
                   w: Math.min(want.w, cap) };
    if (snap) view = { ...viewTarget };
  }
  const scale = () => CW / view.w;
  const sx = (x) => (x - view.cx) * scale() + CW / 2;
  const sy = (y) => (y - view.cy) * scale() + CH / 2;
  const wx = (x) => (x - CW / 2) / scale() + view.cx;
  const wy = (y) => (y - CH / 2) / scale() + view.cy;

  // ---------- input ----------
  const canvasPoint = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * CW / r.width, (e.clientY - r.top) * CH / r.height];
  };
  cv.addEventListener("pointerdown", (e) => {
    if (mode !== "aim") return;
    cv.setPointerCapture(e.pointerId);
    aimFrom = canvasPoint(e); aimTo = aimFrom.slice();
  });
  cv.addEventListener("pointermove", (e) => {
    if (mode === "aim" && aimFrom) aimTo = canvasPoint(e);
  });
  cv.addEventListener("pointerup", () => {
    if (mode !== "aim" || !aimFrom) return;
    const v = aimVector(); aimFrom = null;
    if (v.power > 12) launch(v.angle, v.power);
  });
  // read the drag in WORLD units, so it means the same at any zoom
  function aimVector() {
    if (!aimFrom || !aimTo) return { angle: 0, power: 0 };
    const dx = wx(aimFrom[0]) - wx(aimTo[0]);
    const dy = wy(aimFrom[1]) - wy(aimTo[1]);
    return { angle: Math.atan2(dy, dx),
             power: Math.min(lv.maxP, Math.hypot(dx, dy) * 1.15) };
  }

  function launch(angle, power) {
    probe = { x: lv.start[0], y: lv.start[1],
              vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
    t = 0; path = [[probe.x, probe.y, power]]; sweep = [[probe.x, probe.y]];
    nextSweep = SWEEP_EVERY; closest = null;
    launchIC = { x: probe.x, y: probe.y, vx: probe.vx, vy: probe.vy };
    mode = "fly"; tries++; everLaunched = true;
  }

  function endFlight(msg) {
    if (path.length > 3) {
      ghosts.push({ pts: path, best: closest });
      if (ghosts.length > TRAIL_KEEP) ghosts.shift();
    }
    probe = null; path = []; sweep = []; mode = "aim";
    flash = msg; flashT = 2.0;
    frameNow(false);
  }

  // The same launch with the moon taken out: how far does it actually get?
  function withoutTheMoon() {
    if (!launchIC) return null;
    const only = lv.bodies.filter((b) => b.kind !== "moon");
    const s = { ...launchIC };
    let tt = 0, far = 0;
    while (tt < lv.maxT * 3) {
      integrate(s, only, tt, DT * 2);
      tt += DT * 2;
      const r = Math.hypot(s.x - lv.ringAt[0], s.y - lv.ringAt[1]);
      if (r > far) far = r;
      for (const b of only) if (Math.hypot(b.x - s.x, b.y - s.y) < b.r) return Math.round(far);
    }
    return Math.round(far);
  }

  function win() {
    mode = "done";
    const last = li + 1 >= LEVELS.length;
    const { improved } = recordAttemptResult(progress, lv.id, tries);
    saveProgress(progress);
    let body;
    if (last) {
      const alone = withoutTheMoon();
      body =
        "<p>Nothing helped you but ordinary gravity. You fell past a <b>moving</b> moon " +
        "and came away carrying speed that used to be the moon's. That is a " +
        "<b>gravity assist</b>, and it is how every probe we have sent to the outer " +
        "planets actually got there.</p>" +
        (alone !== null
          ? "<p>That exact push, with the moon deleted and nothing else changed, only " +
            "reaches <b>r = " + alone + "</b> before falling back. The boundary is at " +
            "<b>1150</b>. The moon was the whole difference.</p>"
          : "") +
        "<p class='sub'>Seven levels done. " + tries +
        (tries === 1 ? " attempt" : " attempts") + " on this one.</p>";
    } else {
      body = "<p>" + tries + (tries === 1 ? " attempt." : " attempts.") +
        (improved ? " <b>Better than last time.</b>" : "") + "</p>";
    }
    show(last ? "OUT" : "ARRIVED", body, last ? "again" : "next");
    drawDots();
  }

  // ---------- the flight ----------
  function stepWorld(dtReal) {
    if (flashT > 0) { flashT -= dtReal; if (flashT <= 0) flash = null; }
    const k = Math.min(1, dtReal * 3);
    view.cx += (viewTarget.cx - view.cx) * k;
    view.cy += (viewTarget.cy - view.cy) * k;
    view.w += (viewTarget.w - view.w) * k;
    if (mode !== "fly") return;

    let left = Math.min(dtReal, 0.05), guard = 0;
    while (left > 1e-9 && guard++ < 400) {
      const h = Math.min(left, DT);
      integrate(probe, lv.bodies, t, h);
      t += h; left -= h;

      for (const b of lv.bodies) {
        const [bx, by] = bodyAt(b, t);
        const d = Math.hypot(bx - probe.x, by - probe.y);
        if (d < b.r) return endFlight(b.kind === "moon" ? "into the moon" : "into the planet");
      }
      if (lv.flag) {
        const d = Math.hypot(lv.flag[0] - probe.x, lv.flag[1] - probe.y);
        if (!closest || d < closest.d) closest = { d, x: probe.x, y: probe.y };
        if (d < lv.flagR) { pushPoint(); ghosts.push({ pts: path, best: null }); return win(); }
      }
      if (lv.ring) {
        const d = Math.hypot(lv.ringAt[0] - probe.x, lv.ringAt[1] - probe.y);
        if (d > lv.ring) {
          pushPoint(); ghosts.push({ pts: path, best: null }); return win();
        }
      }
      if (t > nextSweep) { sweep.push([probe.x, probe.y]); nextSweep += SWEEP_EVERY; }

      const far = Math.hypot(probe.x - baseView.cx, probe.y - baseView.cy);
      if (far > baseView.w * (lv.zoomOut || 1.5) * 0.85)
        return endFlight(lv.ring ? "fell back" : "sailed past");
      if (t > lv.maxT) return endFlight(lv.ring ? "fell back" : "out of time");
    }
    pushPoint();
    frameNow(false);
  }
  function pushPoint() {
    const sp = Math.hypot(probe.vx, probe.vy);
    const last = path[path.length - 1];
    if (!last || Math.hypot(last[0] - probe.x, last[1] - probe.y) > 3)
      path.push([probe.x, probe.y, sp]);
  }

  // ---------- preview ----------
  function previewPath() {
    const v = aimVector();
    if (v.power < 12) return null;
    const s = { x: lv.start[0], y: lv.start[1],
                vx: Math.cos(v.angle) * v.power, vy: Math.sin(v.angle) * v.power };
    const span = lv.fullPreview ? lv.maxT : 0.6;
    const pts = [[s.x, s.y, v.power]];
    let tt = 0, guard = 0;
    while (tt < span && guard++ < 9000) {
      integrate(s, lv.bodies, tt, DT * 2);
      tt += DT * 2;
      for (const b of lv.bodies) {
        const [bx, by] = bodyAt(b, tt);
        if (Math.hypot(bx - s.x, by - s.y) < b.r) return pts;
      }
      if (lv.ring && Math.hypot(lv.ringAt[0] - s.x, lv.ringAt[1] - s.y) > lv.ring) {
        pts.push([s.x, s.y, Math.hypot(s.vx, s.vy)]); return pts;
      }
      const last = pts[pts.length - 1];
      if (Math.hypot(last[0] - s.x, last[1] - s.y) > 4)
        pts.push([s.x, s.y, Math.hypot(s.vx, s.vy)]);
    }
    return pts;
  }

  // ---------- drawing ----------
  // slow is deep blue, fast is white-hot. This is the whole reason a gravity
  // assist is something you SEE rather than something you are told.
  function speedColour(sp, a) {
    const f = Math.max(0, Math.min(1, sp / (lv.maxP * 1.25)));
    const stops = [[74, 111, 181], [127, 176, 255], [255, 210, 122], [255, 255, 255]];
    const g = f * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(g)), u = g - i;
    const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * u));
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function draw() {
    ctx.fillStyle = "#070812";
    ctx.fillRect(0, 0, CW, CH);
    stars();

    if (lv.ring) {
      ctx.strokeStyle = "rgba(127,176,255,0.30)";
      ctx.setLineDash([7, 9]); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(lv.ringAt[0]), sy(lv.ringAt[1]), lv.ring * scale(), 0, Math.PI * 2);
      ctx.stroke(); ctx.setLineDash([]);
    }
    for (const b of lv.bodies) {
      if (b.kind !== "moon") continue;
      ctx.strokeStyle = "rgba(150,160,200,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx(b.cx), sy(b.cy), b.R * scale(), 0, Math.PI * 2); ctx.stroke();
    }

    if (showMath && mode === "fly") drawSweep();

    let bestG = -1;
    ghosts.forEach((g, i) => {
      if (g.best && (bestG < 0 || g.best.d < ghosts[bestG].best.d)) bestG = i;
    });
    ghosts.forEach((g, i) => {
      const a = ghosts.length === 1 ? 0.40
              : 0.16 + 0.26 * (i / (ghosts.length - 1));
      drawTrail(g.pts, a, 1.1);
      if (g.best) drawClosest(g.best, a + 0.25, i === bestG);
    });
    if (mode === "fly") drawTrail(path, 0.95, 2);

    if (mode === "aim") {
      const p = previewPath();
      if (p) drawDashed(p, lv.fullPreview ? "rgba(255,210,122,0.5)" : "rgba(255,210,122,0.85)");
    }

    for (const b of lv.bodies) drawBody(b);
    if (lv.flag) drawFlag();
    drawProbe();
    if (mode === "aim") drawAim();
    if (showMath) drawMaths();
    if (flash) drawFlash();
    if (!everLaunched && mode === "aim" && !aimFrom) drawPrompt();
  }

  // a fixed scatter, hashed rather than stepped, or the stars line up diagonally
  const STARS = (() => {
    const out = [];
    let h = 1234567;
    const nx = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
    for (let i = 0; i < 150; i++)
      out.push([nx() * CW, nx() * CH, 0.7 + nx() * 1.1, 0.16 + nx() * 0.4]);
    return out;
  })();
  function stars() {
    for (const [x, y, r, a] of STARS) {
      ctx.fillStyle = "rgba(180,195,255," + a + ")";
      ctx.fillRect(x, y, r, r);
    }
  }

  function drawTrail(pts, alpha, w) {
    if (!pts || pts.length < 2) return;
    ctx.lineWidth = w;
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = speedColour(pts[i][2] || 0, alpha);
      ctx.beginPath();
      ctx.moveTo(sx(pts[i - 1][0]), sy(pts[i - 1][1]));
      ctx.lineTo(sx(pts[i][0]), sy(pts[i][1]));
      ctx.stroke();
    }
  }
  function drawDashed(pts, style) {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = style; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1])));
    ctx.stroke(); ctx.setLineDash([]);
  }
  // how near that attempt came: the funnel, made visible
  function drawClosest(b, a, isBest) {
    const X = sx(b.x), Y = sy(b.y);
    ctx.strokeStyle = "rgba(255,210,122," + (isBest ? Math.min(1, a + 0.3) : a) + ")";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X, Y, isBest ? 5.5 : 4, 0, Math.PI * 2); ctx.stroke();
    if (lv.flag && isBest) {
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(X, Y); ctx.lineTo(sx(lv.flag[0]), sy(lv.flag[1]));
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Equal time, equal area. Kepler's second law, drawn rather than claimed.
  function drawSweep() {
    const b = lv.bodies[0];
    if (!b || b.kind !== "planet" || sweep.length < 2) return;
    const PX = sx(b.x), PY = sy(b.y);
    for (let i = 1; i < sweep.length; i++) {
      ctx.fillStyle = i % 2 ? "rgba(127,176,255,0.13)" : "rgba(127,176,255,0.07)";
      ctx.beginPath();
      ctx.moveTo(PX, PY);
      ctx.lineTo(sx(sweep[i - 1][0]), sy(sweep[i - 1][1]));
      ctx.lineTo(sx(sweep[i][0]), sy(sweep[i][1]));
      ctx.closePath(); ctx.fill();
    }
  }

  function drawBody(b) {
    const [bx, by] = bodyAt(b, t);
    const X = sx(bx), Y = sy(by), R = Math.max(3, b.r * scale());
    const g = ctx.createRadialGradient(X, Y, R * 0.2, X, Y, R * 3.4);
    g.addColorStop(0, b.kind === "moon" ? "rgba(190,200,235,0.28)" : "rgba(130,165,255,0.24)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, R * 3.4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = b.kind === "moon" ? "#c3cbe6" : "#5878cf";
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    // a little surface so it reads as a world, turning slowly
    const spin = t * (b.kind === "moon" ? 0.25 : 0.12) + b.r;
    ctx.fillStyle = b.kind === "moon" ? "rgba(120,130,165,0.55)" : "rgba(40,62,120,0.5)";
    for (let i = 0; i < 4; i++) {
      const a = spin + i * 1.7, rr = R * (0.28 + 0.14 * ((i * 7) % 3));
      const cxp = X + Math.cos(a) * R * 0.45, cyp = Y + Math.sin(a * 1.3) * R * 0.4;
      if (Math.cos(a) < -0.25) continue;
      ctx.beginPath(); ctx.arc(cxp, cyp, rr * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = b.kind === "moon" ? "rgba(245,248,255,0.85)" : "rgba(140,172,245,0.85)";
    ctx.beginPath(); ctx.arc(X - R * 0.32, Y - R * 0.32, R * 0.42, 0, Math.PI * 2); ctx.fill();

    if (b.kind === "moon" && showMath) {          // the moon is MOVING: that is the point
      const [vx, vy] = [-Math.sin(b.phase + b.omega * t), Math.cos(b.phase + b.omega * t)];
      ctx.strokeStyle = "rgba(255,210,122,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X, Y); ctx.lineTo(X + vx * 34, Y + vy * 34);
      ctx.stroke();
    }
  }

  function drawFlag() {
    const X = sx(lv.flag[0]), Y = sy(lv.flag[1]), R = lv.flagR * scale();
    const p = 0.5 + 0.5 * Math.sin(performance.now() / 420);
    ctx.strokeStyle = "rgba(255,210,122," + (0.35 + p * 0.45) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,210,122,0.14)";
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd27a";
    ctx.beginPath(); ctx.arc(X, Y, Math.max(3, R * 0.22), 0, Math.PI * 2); ctx.fill();
  }

  function drawProbe() {
    const p = probe || { x: lv.start[0], y: lv.start[1] };
    const X = sx(p.x), Y = sy(p.y);
    if (!probe) {
      ctx.strokeStyle = "rgba(160,210,255,0.30)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X, Y, 15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "rgba(234,241,255,0.3)";
    ctx.beginPath(); ctx.arc(X, Y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#eaf1ff";
    ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2); ctx.fill();
  }

  // a slingshot you can see being pulled
  function drawAim() {
    if (!aimFrom || !aimTo) return;
    const v = aimVector();
    const X = sx(lv.start[0]), Y = sy(lv.start[1]);
    const back = (v.power / lv.maxP) * 70;
    const bx = X - Math.cos(v.angle) * back, by = Y - Math.sin(v.angle) * back;
    ctx.strokeStyle = "rgba(255,210,122,0.35)";
    ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,210,122,0.7)";
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();

    const len = 26 + (v.power / lv.maxP) * 60;
    ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X + Math.cos(v.angle) * len, Y + Math.sin(v.angle) * len);
    ctx.stroke();
    const hx = X + Math.cos(v.angle) * len, hy = Y + Math.sin(v.angle) * len;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(v.angle - 0.4) * 9, hy - Math.sin(v.angle - 0.4) * 9);
    ctx.lineTo(hx - Math.cos(v.angle + 0.4) * 9, hy - Math.sin(v.angle + 0.4) * 9);
    ctx.closePath(); ctx.fillStyle = "#ffd27a"; ctx.fill();

    ctx.strokeStyle = "rgba(255,210,122,0.25)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(X, Y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(X, Y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v.power / lv.maxP));
    ctx.stroke();
  }

  // The gesture is a pull AWAY from where you want to go, so the arrow always
  // points back and down; only the label gets nudged to stay on the canvas.
  function drawPrompt() {
    const X = sx(lv.start[0]), Y = sy(lv.start[1]);
    const p = 0.5 + 0.5 * Math.sin(performance.now() / 500);
    const ex = X - 62, ey = Y + 30;
    ctx.strokeStyle = "rgba(255,210,122," + (0.25 + p * 0.4) + ")";
    ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(X - 14, Y + 7); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,210,122,0.85)";
    ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = "12px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("pull back", Math.max(40, Math.min(CW - 40, ex)), ey + 20);
    ctx.textAlign = "left";
  }

  // the maths layer: what is conserved, and what is not
  function drawMaths() {
    ctx.font = "11px ui-monospace, Consolas, monospace";
    const rows = [];
    const b = lv.bodies[0];
    if (probe && b && b.kind === "planet") {
      const sp = Math.hypot(probe.vx, probe.vy);
      const rx = probe.x - b.x, ry = probe.y - b.y;
      const r = Math.hypot(rx, ry);
      const L = rx * probe.vy - ry * probe.vx;
      const E = 0.5 * sp * sp - b.M / r;
      rows.push(["r", r.toFixed(0) + " px"]);
      rows.push(["speed", sp.toFixed(0) + " px/s"]);
      rows.push(["L = r x v", L.toFixed(0) + "   <- pinned"]);
      rows.push(["E = v2/2 - M/r", E.toFixed(0) + (E > 0 ? "   free" : "   bound")]);
    } else if (probe) {
      rows.push(["speed", Math.hypot(probe.vx, probe.vy).toFixed(0) + " px/s"]);
    } else {
      const v = aimVector();
      rows.push(["push", v.power.toFixed(0) + " / " + lv.maxP + " px/s"]);
      rows.push(["a", "sum of M / r^2"]);
    }
    const w = 236, h = 16 + rows.length * 15;
    ctx.fillStyle = "rgba(7,8,18,0.8)";
    ctx.fillRect(12, CH - h - 12, w, h);
    ctx.strokeStyle = "rgba(127,176,255,0.35)";
    ctx.strokeRect(12, CH - h - 12, w, h);
    rows.forEach((r, i) => {
      ctx.fillStyle = "rgba(140,155,200,0.9)";
      ctx.fillText(r[0], 22, CH - h + 5 + i * 15);
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(r[1], 130, CH - h + 5 + i * 15);
    });
    if (mode === "fly" && lv.bodies[0] && lv.bodies[0].kind === "planet" && sweep.length > 2) {
      ctx.fillStyle = "rgba(140,155,200,0.75)";
      ctx.fillText("wedges are equal time — and equal area", 12, CH - h - 20);
    }
    // the speed ramp, so the trail colour means something
    const lx = CW - 168, ly = 52;
    ctx.fillStyle = "rgba(140,155,200,0.8)";
    ctx.fillText("slow", lx - 30, ly + 9);
    ctx.fillText("fast", lx + 106, ly + 9);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = speedColour(lv.maxP * 1.25 * i / 99, 1);
      ctx.fillRect(lx + i, ly, 1.2, 7);
    }
  }

  function drawFlash() {
    ctx.globalAlpha = Math.min(1, flashT * 1.4);
    ctx.font = "600 15px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "#8e9ac4";
    ctx.textAlign = "center";
    ctx.fillText(flash, CW / 2, 64);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // ---------- level dots ----------
  function drawDots() {
    const host = $("dots");
    if (!host) return;
    host.innerHTML = "";
    LEVELS.forEach((L, i) => {
      // Same three classes as before, still independent of each other: the
      // level you are on may also be one you have already finished.
      const state = levelState(progress, ORDER, L.id);   // locked | done | available
      const open = state !== "locked";
      const d = document.createElement("button");
      d.className = "dot" + (i === li ? " now" : "") +
        (state === "done" ? " done" : "") + (open ? "" : " locked");
      d.title = open ? (i + 1) + ". " + L.name : "not yet";
      // For the browser regression test: identity and state, not DOM position.
      d.dataset.levelId = L.id;
      d.dataset.state = state;
      if (i === li) d.dataset.current = "true";
      d.addEventListener("click", () => { if (open) { hide(); loadLevel(i); } });
      host.appendChild(d);
    });
  }

  // ---------- overlay ----------
  const ov = $("ov");
  function show(title, body, btn) {
    ov.querySelector("h1").textContent = title;
    ov.querySelector(".tag").textContent =
      title === "SLINGSHOT" ? "one push, and the planets do the rest" : "";
    $("ov-body").innerHTML = body;
    $("ov-go").textContent = btn;
    ov.classList.remove("hidden");
  }
  const hide = () => ov.classList.add("hidden");
  $("ov-go").addEventListener("click", () => {
    hide();
    if (mode === "done") loadLevel(li + 1 >= LEVELS.length ? 0 : li + 1);
  });
  $("b-retry").addEventListener("click", () => { if (mode !== "done") endFlight(null); });
  $("b-phys").addEventListener("click", () => {
    showMath = !showMath;
    $("b-phys").classList.toggle("on", showMath);
  });
  addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && mode !== "done") endFlight(null);
    if (e.code === "KeyM" || e.code === "KeyP") $("b-phys").click();
    if (e.code === "Enter" && !ov.classList.contains("hidden")) $("ov-go").click();
  });

  // ---------- go ----------
  loadLevel(0);
  show("SLINGSHOT",
    "<p><b>Pull back from the probe and let go.</b> That is the whole game — one push, " +
    "and gravity does everything after it.</p>" +
    "<p>Every path you fly stays on screen, and each one is marked where it came closest. " +
    "Missing is how you aim.</p>" +
    "<p class='sub'>The trail is coloured by speed. Seven levels — on the last one your " +
    "engine cannot get you out at all.</p>",
    "launch");

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (ov.classList.contains("hidden")) stepWorld(dt);
    draw();
    requestAnimationFrame(loop);
  })(last);

  // hooks for the verification scripts
  window.Slingshot = {
    state: () => ({ level: li, levelId: lv ? lv.id : null, mode, tries,
                    ghosts: ghosts.length,
                    probe: probe ? { x: probe.x, y: probe.y,
                                     v: Math.hypot(probe.vx, probe.vy) } : null }),
    goto: (ref) => { hide(); loadLevel(resolveLevelIndex(ref)); },
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
    levelIds: () => LEVELS.map((L) => L.id),
    // Read-only copy: the tests read progress, they never reach in and set it.
    progress: () => LEVELS.map((L) => ({
      id: L.id,
      state: levelState(progress, ORDER, L.id),
      bestTries: getBestTries(progress, L.id),
    })),
    // Explicit, because a test that wants a clean slate should say so rather
    // than clearing storage behind the game's back and leaving it stale.
    resetProgress: () => { progress = resetProgress(); drawDots(); },
  };
})();
