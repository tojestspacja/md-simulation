// sandbox.js - free play on the same Bloch engine the game uses.
// No goals, no scoring: pulses, a sample you can change while it runs, and the
// three pictures that matter (the packet fan, the FID, the spectrum).
(() => {
  "use strict";

  const cv = document.getElementById("view");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;

  const $ = (id) => document.getElementById(id);

  let scale = 1 / 25;        // spin-seconds per second of wall clock
  let running = true;
  let t = 0;                 // spin time, seconds
  let shim = 9, offset = 0;  // Hz
  let seq = [];              // pulses in the current scan
  let scheduled = [];        // pulses a preset still has to fire
  let fidBuf = [], scanIdx = 0, nScans = 0, sampleAcc = 0;

  function newFid() {
    fidBuf = [];
    for (let i = 0; i < Bloch.cfg.acq; i++) fidBuf.push([0, 0]);
    scanIdx = Bloch.cfg.acq;
    nScans = 0;
  }
  newFid();

  function seed() { Bloch.seedOffsets(offset, shim); }

  function fire(deg) {
    if (deg === 90) { Bloch.seedOffsets(offset, shim); scanIdx = 0; nScans += 1; seq = []; }
    else if (!seq.length) { seed(); seq = []; }
    Bloch.pulse(deg, 1);
    if (seq.length < 12) seq.push({ deg, t });
  }

  function resetAll() {
    Bloch.reset();
    seq = []; scheduled = []; t = 0;
    newFid();
  }

  // ---------- presets: the experiments by name ----------
  // Times are in spin-seconds from now.
  function runPreset(kind) {
    Bloch.reset();
    seq = []; t = 0; newFid();
    const tau = 0.030;
    if (kind === "fid") scheduled = [{ deg: 90, at: 0.004 }];
    if (kind === "echo") scheduled = [{ deg: 90, at: 0.004 }, { deg: 180, at: 0.004 + 0.045 }];   // long enough that the signal really dies first
    if (kind === "cpmg") {
      scheduled = [{ deg: 90, at: 0.004 }];
      for (let i = 0; i < 4; i++) scheduled.push({ deg: 180, at: 0.004 + tau * (2 * i + 1) });
    }
    if (kind === "ir") {
      // 180 first, then a 90 read pulse after T1*ln2, where the signal nulls
      const tNull = Bloch.cfg.T1 * Math.LN2;
      scheduled = [{ deg: 180, at: 0.004 }, { deg: 90, at: 0.004 + tNull }];
    }
    presetName = { fid: "single-pulse acquire", echo: "Hahn echo", cpmg: "CPMG", ir: "inversion recovery" }[kind];
  }
  let presetName = null;

  // ---------- stepping ----------
  function advance(dtSpin) {
    let left = dtSpin, guard = 0;
    while (left > 1e-9 && guard++ < 4096) {
      const step = Math.min(left, Bloch.cfg.dwell);
      // fire anything the preset has queued for this instant
      while (scheduled.length && scheduled[0].at <= t) {
        fire(scheduled.shift().deg);
      }
      Bloch.evolve(step);
      t += step;
      left -= step;
      if (scanIdx < Bloch.cfg.acq) {
        sampleAcc += step;
        if (sampleAcc >= Bloch.cfg.dwell - 1e-9) {
          const v = Bloch.netMxyComplex();
          fidBuf[scanIdx][0] += v[0];
          fidBuf[scanIdx][1] += v[1];
          scanIdx += 1;
          sampleAcc = 0;
        }
      }
    }
  }

  // ---------- drawing ----------
  function panel(x, y, w, h, accent, title) {
    ctx.fillStyle = "rgba(10,14,30,0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    if (title) {
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = accent;
      ctx.fillText(title, x + 8, y + 15);
    }
  }
  function caption(text, x, y) {
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(190,205,240,0.8)";
    ctx.fillText(text, x, y);
  }

  // The packet fan: every spoke is one isochromat, the bright arrow is the sum.
  function drawDial(x, y, R) {
    const packs = Bloch.packets();
    ctx.strokeStyle = "rgba(160,190,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R, y); ctx.lineTo(x + R, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - R); ctx.lineTo(x, y + R); ctx.stroke();

    const per = Bloch.cfg.M0 / packs.length;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < packs.length; i += 2) {
      const p = packs[i];
      const m = Math.hypot(p.mx, p.my) / per;
      if (m < 0.02) continue;
      const a = Math.atan2(p.my, p.mx);
      ctx.strokeStyle = "rgba(130,195,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * R * m, y + Math.sin(a) * R * m);
      ctx.stroke();
    }
    const v = Bloch.netMxyComplex();
    const net = Math.hypot(v[0], v[1]);
    if (net > 0.005) {
      const a = Math.atan2(v[1], v[0]);
      ctx.strokeStyle = "#ffd93d";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * R * net, y + Math.sin(a) * R * net);
      ctx.stroke();
    }
  }

  function bar(x, y, w, h, frac, col, signed) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col;
    if (signed) {
      const mid = x + w / 2;
      ctx.fillRect(frac >= 0 ? mid : mid + frac * (w / 2), y, Math.abs(frac) * (w / 2), h);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.moveTo(mid, y); ctx.lineTo(mid, y + h); ctx.stroke();
    } else {
      ctx.fillRect(x, y, Math.max(0, frac) * w, h);
    }
  }

  function draw() {
    ctx.fillStyle = "#0b1022";
    ctx.fillRect(0, 0, W, H);

    // ---- packet fan ----
    panel(12, 12, 330, 250, "rgba(120,170,255,0.55)", "THE MAGNETIZATION, PACKET BY PACKET");
    drawDial(177, 140, 92);
    caption("each spoke is one spin packet; the bright arrow is their sum,", 20, 248);
    caption("and the sum is the whole of what a coil can detect", 20, 260);

    const mz = Bloch.netMz(), mxy = Bloch.netMxy();
    panel(12, 272, 330, 76, "rgba(120,170,255,0.4)", null);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText("Mz", 22, 297);
    bar(52, 287, 200, 13, mz / Bloch.cfg.M0, mz >= 0 ? "#6fd3ff" : "#ff8a8a", true);
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText(mz.toFixed(3), 262, 297);
    ctx.fillText("|Mxy|", 22, 322);
    bar(52, 312, 200, 13, mxy / Bloch.cfg.M0, "#ffd93d", false);
    ctx.fillStyle = "#ffd93d";
    ctx.fillText(mxy.toFixed(3), 262, 322);
    caption("spin clock " + (t * 1000).toFixed(1) + " ms" + (presetName ? "   ·   " + presetName : ""), 22, 341);

    // ---- FID ----
    panel(352, 12, 476, 150, "rgba(124,240,168,0.5)", "FID — WHAT THE COIL RECORDS");
    const fx = 362, fy = 34, fw = 456, fh = 112;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    if (nScans > 0) {
      let peak = 1e-9;
      for (let i = 0; i < Bloch.cfg.acq; i++) peak = Math.max(peak, Math.hypot(fidBuf[i][0], fidBuf[i][1]));
      // magnitude envelope first: on resonance the real part alone is flat
      ctx.strokeStyle = "rgba(124,240,168,0.35)";
      ctx.lineWidth = 1;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i < Bloch.cfg.acq; i++) {
          const m = Math.hypot(fidBuf[i][0], fidBuf[i][1]);
          const px = fx + (i / (Bloch.cfg.acq - 1)) * fw;
          const py = fy + fh / 2 - sgn * (m / peak) * (fh / 2 - 4);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "#7cf0a8";
      ctx.beginPath();
      for (let i = 0; i < Bloch.cfg.acq; i++) {
        const px = fx + (i / (Bloch.cfg.acq - 1)) * fw;
        const py = fy + fh / 2 - (fidBuf[i][0] / peak) * (fh / 2 - 4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (scanIdx < Bloch.cfg.acq) {
        ctx.strokeStyle = "rgba(255,217,61,0.9)";
        const px = fx + (scanIdx / (Bloch.cfg.acq - 1)) * fw;
        ctx.beginPath(); ctx.moveTo(px, fy); ctx.lineTo(px, fy + fh); ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(190,205,240,0.5)";
      ctx.font = "11px monospace";
      ctx.fillText("fire a 90° pulse to start recording", fx + 130, fy + fh / 2 - 6);
    }
    caption("faint outline = magnitude, bright = real part   ·   " + nScans + (nScans === 1 ? " scan" : " scans") + "   ·   " +
            (Bloch.cfg.acq * Bloch.cfg.dwell * 1000).toFixed(0) + " ms of acquisition", 362, 156);

    // ---- spectrum ----
    panel(352, 172, 476, 176, "rgba(120,170,255,0.55)", "SPECTRUM — THE FID, FOURIER TRANSFORMED");
    const sx = 362, sy = 196, sw = 456, sh = 122;
    const spec = Bloch.spectrum(fidBuf, 1);   // hzPerPpm = 1 so the axis is in Hz
    let max = 1e-12;
    for (let k = 0; k < spec.mag.length; k++) max = Math.max(max, spec.mag[k]);
    const HZ = 420;                            // show +/- 420 Hz
    const xOf = (hz) => sx + ((hz + HZ) / (2 * HZ)) * sw;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.moveTo(sx, sy + sh); ctx.lineTo(sx + sw, sy + sh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xOf(0), sy); ctx.lineTo(xOf(0), sy + sh); ctx.stroke();
    if (nScans > 0 && max > 1e-9) {
      ctx.strokeStyle = "#8fb6ff";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < spec.mag.length; k++) {
        const hz = (k - spec.mag.length / 2) * spec.hzPerBin;
        if (hz < -HZ || hz > HZ) continue;
        const px = xOf(hz);
        const py = sy + sh - (spec.mag[k] / max) * (sh - 6);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // linewidth of the tallest line
      let kMax = 0;
      for (let k = 0; k < spec.mag.length; k++) if (spec.mag[k] > spec.mag[kMax]) kMax = k;
      let lo = kMax, hi = kMax;
      while (lo > 0 && spec.mag[lo] > max / 2) lo--;
      while (hi < spec.mag.length - 1 && spec.mag[hi] > max / 2) hi++;
      ctx.fillStyle = "#ffd93d";
      ctx.font = "11px monospace";
      ctx.fillText("linewidth ~" + ((hi - lo) * spec.hzPerBin).toFixed(1) + " Hz", sx + sw - 150, sy + 14);
    }
    ctx.fillStyle = "rgba(190,205,240,0.8)";
    ctx.font = "10px monospace";
    for (let hz = -400; hz <= 400; hz += 200) {
      ctx.textAlign = "center";
      ctx.fillText(hz + (hz === 400 ? " Hz" : ""), xOf(hz), sy + sh + 13);
    }
    ctx.textAlign = "left";
    caption("a broad line means the packets disagreed; the peak sits at your offset", 362, 342);

    // ---- sequence strip ----
    panel(12, 358, 816, 60, "rgba(255,217,61,0.5)", null);
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "#ffd93d";
    const nm = seqName();
    ctx.fillText("SEQUENCE: " + nm[0], 22, 375);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText(nm[1], 200, 375);
    if (seq.length) {
      const t0 = seq[0].t, now = t - t0;
      const due = echoDue();
      const span = Math.max(0.04, now * 1.12, (due ? (due - t0) * 1.12 : 0));
      const ax = 26, aw = 780, ay = 400;
      ctx.strokeStyle = "rgba(200,215,255,0.4)";
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + aw, ay); ctx.stroke();
      const px = (tt) => ax + (tt / span) * aw;
      if (due !== null) {
        ctx.strokeStyle = "rgba(255,217,61,0.85)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px(due - t0), ay - 11); ctx.lineTo(px(due - t0), ay + 4); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffd93d";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText("echo", px(due - t0), ay - 13);
        ctx.textAlign = "left";
      }
      for (const p of seq) {
        ctx.fillStyle = p.deg === 90 ? "#ffcc33" : "#66d4ff";
        ctx.fillRect(px(p.t - t0) - 2, ay - 9, 4, 9);
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.deg === 90 ? "90x" : "180x", px(p.t - t0), ay + 11);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(px(now) - 1, ay - 6, 2, 7);
    }
  }

  function seqName() {
    if (!seq.length) return ["nothing yet", "fire a pulse, or run one of the named experiments"];
    const n180 = seq.filter(p => p.deg === 180).length;
    if (seq[0].deg === 180) {
      return seq.some(p => p.deg === 90)
        ? ["inversion recovery", "180x – τ – 90x – acquire"]
        : ["inversion", "180x — Mz is negative, nothing to detect yet"];
    }
    if (n180 === 0) return ["single-pulse acquire", "90x – acquire"];
    if (n180 === 1) return ["Hahn echo", "90x – τ – 180x – τ – echo"];
    return ["CPMG", "90x – (τ – 180x – τ) × " + n180];
  }

  function echoDue() {
    if (!seq.length || seq[0].deg !== 90) return null;
    let d = 0, lastT = seq[0].t, any = false;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i].deg !== 180) continue;
      d = -(d + (seq[i].t - lastT));
      lastT = seq[i].t;
      any = true;
    }
    if (!any || d >= 0) return null;
    return lastT - d;
  }

  // ---------- controls ----------
  const sT1 = $("sT1"), sT2 = $("sT2"), sShim = $("sShim"), sOff = $("sOff"), sScale = $("sScale");
  function syncLabels() {
    $("vT1").textContent = Bloch.cfg.T1 * 1000 + " ms";
    $("vT2").textContent = Bloch.cfg.T2 * 1000 + " ms";
    $("vShim").textContent = "±" + shim + " Hz";
    $("vOff").textContent = offset + " Hz";
    $("vScale").textContent = "1:" + Math.round(1 / scale);
  }
  function applySample() {
    Bloch.cfg.T1 = +sT1.value / 1000;
    Bloch.cfg.T2 = Math.min(+sT2.value, +sT1.value) / 1000;   // T2 can never exceed T1
    if (+sT2.value > +sT1.value) sT2.value = sT1.value;
    syncLabels();
  }
  sT1.addEventListener("input", applySample);
  sT2.addEventListener("input", applySample);
  sShim.addEventListener("input", () => { shim = +sShim.value; seed(); syncLabels(); });
  sOff.addEventListener("input", () => { offset = +sOff.value; seed(); syncLabels(); });
  sScale.addEventListener("input", () => { scale = 1 / +sScale.value; syncLabels(); });

  $("b90").addEventListener("click", () => { presetName = null; fire(90); });
  $("b180").addEventListener("click", () => { presetName = null; fire(180); });
  $("breset").addEventListener("click", () => { presetName = null; resetAll(); });
  $("pFid").addEventListener("click", () => runPreset("fid"));
  $("pEcho").addEventListener("click", () => runPreset("echo"));
  $("pCpmg").addEventListener("click", () => runPreset("cpmg"));
  $("pIr").addEventListener("click", () => runPreset("ir"));
  $("bpause").addEventListener("click", (e) => {
    running = !running;
    e.target.textContent = running ? "pause" : "run";
  });

  applySample();
  seed();
  syncLabels();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (running) advance(dt * scale);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // for checking the physics from a script, same as the game exposes
  window.Sandbox = {
    state: () => ({ t, mz: Bloch.netMz(), mxy: Bloch.netMxy(), nScans, scanIdx,
                    seq: seq.map(p => ({ deg: p.deg, ms: +(p.t * 1000).toFixed(2) })),
                    echoDue: echoDue(), shim, offset, T1: Bloch.cfg.T1, T2: Bloch.cfg.T2 }),
    fire, runPreset, advance, reset: resetAll,
    setShim: (v) => { shim = v; seed(); },
    setOffset: (v) => { offset = v; seed(); },
  };
})();
