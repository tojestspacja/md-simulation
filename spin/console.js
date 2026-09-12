// console.js — SHIM: get a 500 MHz magnet to spec before the time runs out.
//
// The loop is Lunar Lander's: continuous control of a physical quantity, a
// budget that runs down, an unforgiving target, and failure you can read off
// the screen. Here the quantity is the field over the sample volume and the
// target is a lineshape spec.
//
// The physics is not decoration. The line you see IS the histogram of B0 over
// the sample, convolved with the natural Lorentzian — so a mis-set Z1 gives a
// flat-topped line, a mis-set Z2 a narrow peak on a wide asymmetric base, and
// a mis-set Z3 a symmetric pair of shoulders. Those are the real signatures an
// operator reads to decide which shim to touch, and they come out of the sum
// below rather than being drawn by hand.
(() => {
  "use strict";

  const cv = document.getElementById("view");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const $ = (id) => document.getElementById(id);

  // The lineshape sample is an ordinary undoped one — long T2, so the natural
  // width is well under the spec and everything you see is the shim.
  Bloch.cfg.T1 = 3.0;
  Bloch.cfg.T2 = 2.0;                      // natural FWHM = 1/(pi*T2) = 0.16 Hz

  // ---------- the field the shims actually make ----------
  // Legendre-like axial profiles. Z1 is a linear gradient, Z2 a curvature, and
  // so on; each shim coil adds its own shape to B0 along the tube.
  const SHIMS = ["Z1", "Z2", "Z3", "Z4"];
  const PROFILE = {
    Z1: (z) => z,
    Z2: (z) => z * z - 1 / 3,
    Z3: (z) => z * z * z - 0.6 * z,
    Z4: (z) => z * z * z * z - (6 / 7) * z * z + 3 / 35,
  };
  // Hz of spread per unit of mis-set, chosen so one unit of any shim does a
  // comparable amount of damage.
  const HZ_PER_UNIT = { Z1: 1.0, Z2: 2.2, Z3: 4.0, Z4: 6.0 };

  const SLICES = 160;
  const zAt = (i) => -1 + 2 * (i + 0.5) / SLICES;
  // The coil only sees the middle of the tube, so slices are weighted by its
  // sensitivity — which is why sample depth matters on a real instrument.
  const WEIGHT = [];
  for (let i = 0; i < SLICES; i++) {
    const z = zAt(i);
    WEIGHT.push(Math.exp(-Math.pow(z / 0.82, 8)));   // flat-topped coil profile
  }

  function fieldAt(z, err) {
    let v = 0;
    for (const s of SHIMS) v += err[s] * HZ_PER_UNIT[s] * PROFILE[s](z);
    return v;
  }
  // err = what is left over: the magnet's own aberration minus what you dialled
  function errorOf(level, shims) {
    const e = {};
    for (const s of SHIMS) e[s] = (level.aberr[s] || 0) - shims[s];
    return e;
  }

  // ---------- the line: field histogram convolved with the natural Lorentzian ----------
  const GRID = 1000, SPAN = 50;            // Hz, plotted -SPAN..+SPAN
  const hzOfBin = (b) => -SPAN + (b + 0.5) * (2 * SPAN) / GRID;
  const HWHM = 1 / (2 * Math.PI * Bloch.cfg.T2);

  function lineshape(err) {
    const y = new Float64Array(GRID);
    const g2 = HWHM * HWHM;
    for (let i = 0; i < SLICES; i++) {
      const o = fieldAt(zAt(i), err);
      const w = WEIGHT[i];
      if (w < 0.002) continue;
      for (let b = 0; b < GRID; b++) {
        const d = hzOfBin(b) - o;
        y[b] += w * g2 / (d * d + g2);
      }
    }
    return y;
  }

  // Width at a given fraction of the peak, interpolated between bins, measured
  // outermost-crossing to outermost-crossing the way a hump test is.
  function widthAt(y, frac) {
    let peak = 0;
    for (let b = 0; b < GRID; b++) if (y[b] > peak) peak = y[b];
    if (peak <= 0) return Infinity;
    const thr = peak * frac;
    let lo = -1, hi = -1;
    for (let b = 0; b < GRID; b++) if (y[b] >= thr) { if (lo < 0) lo = b; hi = b; }
    if (lo < 0) return Infinity;
    if (lo === 0 || hi === GRID - 1) return Infinity;   // wider than the window
    const interp = (a, b2) => {
      const ya = y[a], yb = y[b2];
      if (yb === ya) return hzOfBin(a);
      return hzOfBin(a) + (thr - ya) / (yb - ya) * (hzOfBin(b2) - hzOfBin(a));
    };
    return interp(hi, hi + 1) - interp(lo, lo - 1);
  }

  function measure(y) {
    let peak = 0;
    for (let b = 0; b < GRID; b++) if (y[b] > peak) peak = y[b];
    return {
      peak,
      fwhm: widthAt(y, 0.5),
      h055: widthAt(y, 0.0055),
      h011: widthAt(y, 0.0011),
    };
  }

  // Perfect-shim peak height, for normalising the lock level to 100%.
  const PERFECT_PEAK = measure(lineshape({ Z1: 0, Z2: 0, Z3: 0, Z4: 0 })).peak;

  // ---------- samples to get to spec ----------
  const LEVELS = [
    {
      name: "sample 1 · routine tube",
      brief: "Only the linear gradient is out. A pure Z1 error makes the line <b>flat-topped and wide</b> — the field runs evenly from one end of the sample to the other, so every frequency in that range is equally represented.",
      aberr: { Z1: 9, Z2: 0, Z3: 0, Z4: 0 },
      spec: { fwhm: 2.5, h055: 9, h011: 18 },
      budget: 170, showTruth: true, shims: ["Z1"],
    },
    {
      name: "sample 2 · after a probe change",
      brief: "Z1 and Z2 are both out. A Z2 error is the sneaky one: it barely widens the peak at half height but leaves a <b>broad one-sided base</b>. Watch the 0.55% row rather than the FWHM.",
      aberr: { Z1: -6, Z2: 7, Z3: 0, Z4: 0 },
      spec: { fwhm: 1.2, h055: 10, h011: 16 },
      budget: 190, showTruth: true, shims: ["Z1", "Z2"],
    },
    {
      name: "sample 3 · someone left it badly shimmed",
      brief: "Three shims out, and from here <b>the field profile is hidden</b> — you get what a real console gives you: a lock level that moves while you turn, and a lineshape only when you pay for a shot. A Z3 error shows as <b>symmetric shoulders</b> either side of the peak.",
      aberr: { Z1: 7, Z2: -5, Z3: 4, Z4: 0 },
      spec: { fwhm: 1.0, h055: 9, h011: 14 },
      budget: 220, showTruth: false, shims: ["Z1", "Z2", "Z3"],
    },
    {
      name: "sample 4 · publication lineshape",
      brief: "All four, a tight spec, and no view of the field. This is the one that decides whether the spectrum is worth running.",
      aberr: { Z1: -5, Z2: 6, Z3: -4, Z4: 5 },
      spec: { fwhm: 1.0, h055: 8, h011: 15 },
      budget: 260, showTruth: false, shims: ["Z1", "Z2", "Z3", "Z4"],
    },
  ];

  // ---------- state ----------
  let li = 0, level = null;
  let shims = {}, selected = "Z1";
  let phase = "intro";         // intro | brief | playing | won | lost
  let timeLeft = 0, running = false, finished = false;
  let live = null;             // current truth: {y, m} recomputed as you turn
  let shot = null;             // the last measured lineshape — what the spec is judged on
  let lockTrace = [];
  let totalUsed = 0;
  let shots = 0;

  function resetLevel(idx) {
    li = idx;
    level = LEVELS[idx];
    shims = { Z1: 0, Z2: 0, Z3: 0, Z4: 0 };
    selected = level.shims[0];
    timeLeft = level.budget;
    running = false;           // the brief runs first; play starts when it is dismissed
    finished = false;
    shot = null;
    shots = 0;
    lockTrace = [];
    buildShimControls();
    recompute();
    syncBar();
  }

  function recompute() {
    const err = errorOf(level, shims);
    const y = lineshape(err);
    live = { y, m: measure(y), err };
    const lock = Math.max(0, Math.min(1, live.m.peak / PERFECT_PEAK));
    lockTrace.push(lock);
    if (lockTrace.length > 460) lockTrace.shift();
    syncReadout();
  }

  const pass = (m) => m &&
    m.fwhm <= level.spec.fwhm && m.h055 <= level.spec.h055 && m.h011 <= level.spec.h011;

  // ---------- controls ----------
  function buildShimControls() {
    const host = $("shims");
    host.innerHTML = "";
    for (const s of SHIMS) {
      const on = level.shims.includes(s);
      const row = document.createElement("div");
      row.className = "shim" + (s === selected ? " sel" : "");
      row.dataset.shim = s;
      row.innerHTML =
        '<div class="shim-top"><span class="shim-name">' + s + "</span>" +
        '<span class="shim-val" id="v-' + s + '">0.0</span></div>' +
        '<input type="range" id="i-' + s + '" min="-20" max="20" step="0.1" value="0"' +
        (on ? "" : " disabled") + " />";
      host.appendChild(row);
      const input = row.querySelector("input");
      input.addEventListener("input", () => {
        shims[s] = +input.value;
        select(s);
        recompute();
      });
      row.querySelector(".shim-name").addEventListener("click", () => { if (on) select(s); });
    }
    syncShimLabels();
  }

  function select(s) {
    selected = s;
    document.querySelectorAll(".shim").forEach(el =>
      el.classList.toggle("sel", el.dataset.shim === s));
  }

  function syncShimLabels() {
    for (const s of SHIMS) {
      const el = $("v-" + s);
      if (el) el.textContent = shims[s].toFixed(1);
      const inp = $("i-" + s);
      if (inp) inp.value = shims[s];
    }
  }

  window.addEventListener("keydown", (e) => {
    if (!running) return;
    const step = e.shiftKey ? 2 : 0.2;
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      if (!level.shims.includes(selected)) return;
      shims[selected] = Math.max(-20, Math.min(20,
        shims[selected] + (e.code === "ArrowRight" ? step : -step)));
      syncShimLabels();
      recompute();
      e.preventDefault();
    }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") {
      const i = level.shims.indexOf(selected);
      if (i >= 0) {
        const n = (i + (e.code === "ArrowDown" ? 1 : -1) + level.shims.length) % level.shims.length;
        select(level.shims[n]);
      }
      e.preventDefault();
    }
    if (e.code === "Space") { takeShot(); e.preventDefault(); }
  });

  function spend(sec) {
    timeLeft -= sec;
    totalUsed += sec;
    if (timeLeft <= 0) { timeLeft = 0; fail(); }
  }

  function takeShot() {
    if (!running) return;
    spend(8);
    if (!running) return;
    shots += 1;
    shot = { y: live.y.slice(0), m: live.m };
    syncReadout();
    if (pass(shot.m)) win();
  }

  function autoshim() {
    if (!running) return;
    spend(45);
    if (!running) return;
    // A real topshim gets most of the way and leaves the rest to you.
    for (const s of level.shims) {
      const target = level.aberr[s] || 0;
      shims[s] = +(target * (0.62 + Math.random() * 0.16)).toFixed(1);
    }
    syncShimLabels();
    recompute();
  }

  $("btn-shot").addEventListener("click", takeShot);
  $("btn-auto").addEventListener("click", autoshim);
  $("btn-next").addEventListener("click", () => { if (phase === "won") nextSample(); });

  // ---------- outcome ----------
  function win() {
    running = false;
    phase = "won";
    const m = shot.m;
    const last = li + 1 >= LEVELS.length;
    showOverlay(last ? "TO SPEC — ALL FOUR" : "TO SPEC",
      "<p>" + level.name + " is in spec.</p>" +
      specTable(m) +
      "<p class='note'>" + Math.round(level.budget - timeLeft) + " s of instrument time used, " +
      shots + (shots === 1 ? " shot" : " shots") + " taken. " +
      (last ? "That is the whole set — total " + Math.round(totalUsed) + " s." : "") +
      "</p>",
      last ? "run it again" : "next sample");
    $("btn-next").disabled = false;
    if (last) finished = true;
  }

  function fail() {
    running = false;
    phase = "lost";
    showOverlay("OUT OF TIME",
      "<p>The instrument time is gone and " + level.name + " never reached spec.</p>" +
      (shot ? specTable(shot.m) : "<p class='note'>You never took a shot — the spec is judged on a " +
        "measurement, not on the lock level.</p>") +
      "<p class='note'>The lock level tells you when you are getting warmer. A shot tells you " +
      "which shim is still wrong, by the shape of what is left.</p>",
      "try this sample again");
  }

  function specTable(m) {
    const row = (lab, v, lim) =>
      "<tr><td>" + lab + "</td><td class='" + (v <= lim ? "ok" : "bad") + "'>" +
      (isFinite(v) ? v.toFixed(2) : "—") + " Hz &nbsp; <span class='note'>spec " +
      lim + "</span></td></tr>";
    return "<table>" + row("width at half height", m.fwhm, level.spec.fwhm) +
      row("width at 0.55%", m.h055, level.spec.h055) +
      row("width at 0.11%", m.h011, level.spec.h011) + "</table>";
  }

  // ---------- overlay ----------
  const ov = $("overlay");
  function showOverlay(title, bodyHtml, btn) {
    $("ov-title").textContent = title;
    $("ov-body").innerHTML = bodyHtml;
    $("ov-btn").textContent = btn;
    ov.classList.remove("hidden");
  }
  function hideOverlay() { ov.classList.add("hidden"); }

  function nextSample() {
    if (li + 1 < LEVELS.length) resetLevel(li + 1);
    else { totalUsed = 0; resetLevel(0); }
    brief();
  }

  $("ov-btn").addEventListener("click", () => {
    if (phase === "intro") { resetLevel(0); brief(); return; }
    if (phase === "brief") { hideOverlay(); phase = "playing"; running = true; return; }
    if (phase === "won") { nextSample(); return; }
    if (phase === "lost") { resetLevel(li); brief(); return; }
  });

  function brief() {
    phase = "brief";
    showOverlay(level.name.toUpperCase().split(" · ")[0],
      "<p>" + level.brief + "</p>" +
      "<p class='note'>Turn the shims until the lock level peaks, then spend 8 s on a shot to see the " +
      "lineshape. The spec is judged on the shot, never on the lock.</p>" + specTarget(),
      "start");
  }
  function specTarget() {
    return "<table><tr><td>width at half height</td><td>&le; " + level.spec.fwhm + " Hz</td></tr>" +
      "<tr><td>width at 0.55%</td><td>&le; " + level.spec.h055 + " Hz</td></tr>" +
      "<tr><td>width at 0.11%</td><td>&le; " + level.spec.h011 + " Hz</td></tr>" +
      "<tr><td>instrument time</td><td>" + level.budget + " s</td></tr></table>";
  }

  // ---------- status bar / readout ----------
  function syncBar() {
    $("task").textContent = level.name;
    $("spec").textContent = "FWHM " + level.spec.fwhm + " · 0.55% " + level.spec.h055 +
      " · 0.11% " + level.spec.h011 + " Hz";
  }
  function syncClock() {
    const t = Math.max(0, timeLeft);
    $("clock").textContent = Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
    $("clock").classList.toggle("low", t < 30);
  }
  function syncReadout() {
    const m = shot ? shot.m : null;
    const cell = (id, sid, v, lim) => {
      $(id).textContent = m ? (isFinite(v) ? v.toFixed(2) + " Hz" : "off scale") : "—";
      $(sid).textContent = m ? (v <= lim ? "OK" : "FAIL") : "";
      $(sid).className = m ? (v <= lim ? "ok" : "bad") : "";
    };
    cell("r-fwhm", "s-fwhm", m ? m.fwhm : 0, level.spec.fwhm);
    cell("r-h055", "s-h055", m ? m.h055 : 0, level.spec.h055);
    cell("r-h011", "s-h011", m ? m.h011 : 0, level.spec.h011);
    $("r-lock").textContent = (100 * Math.min(1, live.m.peak / PERFECT_PEAK)).toFixed(1) + "%";
  }

  // ---------- drawing ----------
  function frame(dt) {
    if (running) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; fail(); } }
    syncClock();
    draw();
  }

  function draw() {
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, W, H);
    drawMagnet(14, 12, 310, 406);
    drawLine(348, 12, 598, 300);
    drawLock(348, 322, 598, 96);
  }

  // The physical half: a bore, a tube, the shim stack, and the field along it.
  function drawMagnet(x, y, w, h) {
    ctx.strokeStyle = "#2a3a5c";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#0c1322";
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#6f83aa";
    ctx.fillText("MAGNET · 11.74 T · 500 MHz", x + 10, y + 16);

    const cx = x + w * 0.42;
    const boreW = 96;
    const top = y + 44, bot = y + h - 26;

    // cryostat walls
    ctx.fillStyle = "#121b2e";
    ctx.fillRect(x + 12, top - 8, w - 24, bot - top + 16);
    ctx.strokeStyle = "#24314e";
    ctx.strokeRect(x + 12, top - 8, w - 24, bot - top + 16);
    ctx.fillStyle = "#4d5f83";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText("LHe", x + 18, top + 4);
    ctx.fillText("LN2", x + 18, top + 16);

    // shim stack either side of the bore, the live one lit
    for (let i = 0; i < SHIMS.length; i++) {
      const s = SHIMS[i];
      const on = level.shims.includes(s);
      const lit = s === selected && on;
      const off = 10 + i * 9;
      ctx.strokeStyle = lit ? "#ffc447" : (on ? "#3d5580" : "#22304c");
      ctx.lineWidth = lit ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx - boreW / 2 - off, top + 6); ctx.lineTo(cx - boreW / 2 - off, bot - 6);
      ctx.moveTo(cx + boreW / 2 + off, top + 6); ctx.lineTo(cx + boreW / 2 + off, bot - 6);
      ctx.stroke();
      if (lit) {
        ctx.fillStyle = "#ffc447";
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillText(s, cx - boreW / 2 - off - 16, top + 2);
      }
    }
    ctx.lineWidth = 1;

    // the tube
    ctx.fillStyle = "#0a1120";
    ctx.fillRect(cx - 20, top, 40, bot - top);
    ctx.strokeStyle = "#44598a";
    ctx.strokeRect(cx - 20, top, 40, bot - top);

    // active volume the coil sees
    const aTop = top + (bot - top) * 0.10, aBot = top + (bot - top) * 0.90;
    ctx.fillStyle = "rgba(111,168,255,0.10)";
    ctx.fillRect(cx - 19, aTop, 38, aBot - aTop);

    // RF coil turns
    ctx.strokeStyle = "#7d6a3a";
    for (let i = 0; i < 5; i++) {
      const yy = aTop + (aBot - aTop) * (0.15 + i * 0.175);
      ctx.beginPath();
      ctx.ellipse(cx, yy, 26, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // the field across the sample
    const SCALE = 22;                       // px per Hz of deviation
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.moveTo(cx, aTop); ctx.lineTo(cx, aBot); ctx.stroke();
    ctx.setLineDash([]);

    if (level.showTruth) {
      ctx.strokeStyle = "#58e08b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < SLICES; i++) {
        const z = zAt(i);
        const yy = aTop + (aBot - aTop) * (i + 0.5) / SLICES;
        const dx = Math.max(-52, Math.min(52, fieldAt(z, live.err) * SCALE / 10));
        if (i === 0) ctx.moveTo(cx + dx, yy); else ctx.lineTo(cx + dx, yy);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = "#58e08b";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("ΔB₀ along the sample", x + 12, bot + 16);
      ctx.fillStyle = "#6f83aa";
      ctx.fillText("flat = shimmed", x + 12, bot + 27);
    } else {
      ctx.fillStyle = "#6f83aa";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("field profile not observable", x + 12, bot + 16);
      ctx.fillText("— shim on the lock, like the real thing", x + 12, bot + 27);
    }
  }

  // The line, drawn twice: once full scale and once with the base blown up,
  // because the hump widths live down at half a percent of the height.
  function drawLine(x, y, w, h) {
    ctx.fillStyle = "#0c1322";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2a3a5c";
    ctx.strokeRect(x, y, w, h);

    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#6f83aa";
    ctx.fillText("LINESHAPE" + (shot ? "" : " — take a shot to measure"), x + 10, y + 16);

    const base = y + h - 24;
    const plotH = h - 52;
    const xOf = (hz) => x + 12 + (hz + SPAN) / (2 * SPAN) * (w - 24);

    // axis
    ctx.strokeStyle = "#22304c";
    ctx.beginPath(); ctx.moveTo(x + 12, base); ctx.lineTo(x + w - 12, base); ctx.stroke();
    ctx.fillStyle = "#4d5f83";
    for (let hz = -40; hz <= 40; hz += 20) {
      ctx.textAlign = "center";
      ctx.fillText(hz + (hz === 40 ? " Hz" : ""), xOf(hz), base + 14);
      ctx.strokeStyle = "#18223a";
      ctx.beginPath(); ctx.moveTo(xOf(hz), y + 24); ctx.lineTo(xOf(hz), base); ctx.stroke();
    }
    ctx.textAlign = "left";

    const src = shot || live;
    if (!src) return;
    const peak = src.m.peak || 1;
    const trace = (scale, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let b = 0; b < GRID; b++) {
        const px = xOf(hzOfBin(b));
        const v = Math.min(1, src.y[b] / peak * scale);
        const py = base - v * plotH;
        if (b === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    if (!shot) ctx.globalAlpha = 0.25;       // live preview is dim until measured
    trace(120, "rgba(111,168,255,0.55)", 1);  // blown-up base
    trace(1, "#6fa8ff", 1.6);                 // the line itself
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(111,168,255,0.7)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText("×120 (the hump)", x + w - 104, y + 30);

    if (!shot) return;
    // where the spec is read
    const marks = [[0.5, "50%", src.m.fwhm, level.spec.fwhm],
                   [0.0055 * 120, "0.55% ×120", src.m.h055, level.spec.h055],
                   [0.0011 * 120, "0.11% ×120", src.m.h011, level.spec.h011]];
    for (const [f, lab, v, lim] of marks) {
      const py = base - f * plotH;
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = v <= lim ? "rgba(88,224,139,0.5)" : "rgba(255,122,110,0.5)";
      ctx.beginPath(); ctx.moveTo(x + 12, py); ctx.lineTo(x + w - 12, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = v <= lim ? "#58e08b" : "#ff7a6e";
      ctx.fillText(lab + "  " + (isFinite(v) ? v.toFixed(2) + " Hz" : "off scale"), x + 14, py - 3);
    }
  }

  // The free feedback: a lock level you watch while you turn the shims.
  function drawLock(x, y, w, h) {
    ctx.fillStyle = "#0c1322";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2a3a5c";
    ctx.strokeRect(x, y, w, h);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#6f83aa";
    ctx.fillText("LOCK LEVEL — free, and it moves as you turn  (log scale, as a lock meter is)",
      x + 10, y + 15);

    const b = y + h - 10, top = y + 24;
    // The peak height runs over three decades between a wrecked shim and a good
    // one, so a linear meter would look flat everywhere except the very top.
    const disp = (v) => Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1e-3)) + 3) / 3));
    ctx.strokeStyle = "#18223a";
    ctx.fillStyle = "#33415f";
    ctx.font = "8px ui-monospace, monospace";
    for (const dec of [0.01, 0.1, 1]) {
      const yy = b - disp(dec) * (b - top);
      ctx.beginPath(); ctx.moveTo(x + 10, yy); ctx.lineTo(x + w - 56, yy); ctx.stroke();
      ctx.fillText((dec * 100) + "%", x + w - 52, yy + 3);
    }
    if (lockTrace.length > 1) {
      ctx.strokeStyle = "#58e08b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < lockTrace.length; i++) {
        const px = x + 10 + (i / Math.max(1, lockTrace.length - 1)) * (w - 66);
        const py = b - disp(lockTrace[i]) * (b - top);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    const now = lockTrace.length ? lockTrace[lockTrace.length - 1] : 0;
    ctx.fillStyle = "#58e08b";
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText((now * 100).toFixed(1) + "%", x + w - 10, y + h / 2 + 10);
    ctx.textAlign = "left";
  }

  // ---------- go ----------
  resetLevel(0);
  phase = "intro";
  showOverlay("SHIM",
    "<p>A 500 MHz magnet is never quite uniform, and a spectrum is only as good as the field over " +
    "the few centimetres of sample the coil can see. Your job is to flatten it.</p>" +
    "<p>The line you are shown is the <b>histogram of B₀ across the sample</b>, so its shape tells " +
    "you which shim is wrong: a linear gradient makes it flat-topped, a curvature leaves a wide " +
    "one-sided base, a cubic term puts shoulders on both sides. Learn to read that and you are " +
    "doing the real thing.</p>" +
    "<p class='note'>Four samples, each with its own spec and its own budget of instrument time. " +
    "Arrow keys nudge the selected shim, shift-arrow moves it fast, space takes a shot.</p>",
    "start");

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  })(last);

  // read-only hooks, so the physics can be checked from a script
  window.Shim = {
    state: () => ({
      level: li, name: level.name, timeLeft, running,
      shims: Object.assign({}, shims),
      aberr: Object.assign({}, level.aberr),
      live: live ? { fwhm: live.m.fwhm, h055: live.m.h055, h011: live.m.h011,
                     lock: live.m.peak / PERFECT_PEAK } : null,
      shot: shot ? { fwhm: shot.m.fwhm, h055: shot.m.h055, h011: shot.m.h011 } : null,
      inSpec: shot ? pass(shot.m) : false,
    }),
    set: (s, v) => { shims[s] = v; syncShimLabels(); recompute(); },
    shoot: takeShot,
    goto: (i) => { resetLevel(i); hideOverlay(); phase = "playing"; running = true; },
    lineshapeFor: (err) => { const y = lineshape(err); return measure(y); },
  };
})();
