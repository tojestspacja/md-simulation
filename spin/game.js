// Spin Runner - a spectroscopy platformer.
//
// You are the sample. Stages 1-3 you are the 1H magnetization inside an NMR
// magnet; stages 4-5 you are a vibrating molecule on the IR/Raman bench;
// stage 6 you are the beam in a UV-Vis spectrometer.
//
// The spin physics is simulated, not scripted: the magnetization is carried by
// 24 independent spin packets (isochromats), each a real 3-vector stepped
// through the Bloch equations. Dephasing, the Hahn echo and the Fourier
// transform at the end all fall out of that simulation rather than being
// animated by hand, so the spectrum you get is a genuine record of how you
// played.
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VW = canvas.width;    // 800 logical px
  const VH = canvas.height;   // 450

  // ---------- platformer constants (carried over from Pixel Plumber) ----------
  const GRAVITY = 2200, MOVE_ACCEL = 1400, MOVE_MAX = 230, FRICTION = 1600;
  const JUMP_VELOCITY = -680, CUT_VELOCITY = -420;
  const GROUND_Y = 400, WORLD_H = VH;

  // ---------- spectroscopy constants ----------
  const GAMMA_1H = 42.577;          // MHz/T, 1H gyromagnetic ratio over 2*pi
  const B0 = 11.7434;               // T
  const NU0 = GAMMA_1H * B0;        // 500.0 MHz -> 1 ppm = 500 Hz
  const HZ_PER_PPM = NU0;
  const TIME_SCALE = 0.04;          // spin-seconds per second of play (1:25 slow motion)
  const T1 = 0.20;                  // s, Gd-doped water: short on purpose so it is playable
  const T2 = 0.16;                  // s, T2 <= T1 as it must be
  const N_PACK = 64;                // spin packets simulated (enough that a broad line looks smooth)
  const N_DRAW = 9;                 // packets drawn on the phase dial
  const TUNE_MIN = -400, TUNE_MAX = 1600;  // Hz, transmitter offset range
  const TUNE_RATE = 620;            // Hz per second of holding a tune button
  const ON_RES = 60, OFF_RES = 170; // Hz: full excitation / none
  const DWELL = 0.00025;            // s between FID samples -> spectral width 4 kHz
  const ACQ = 512;                  // points acquired per scan (128 ms)
  const NFFT = 2048;                // transform length: zero-filled x4, as on a real spectrometer

  // Chemical environments along the bore. inhom = half-spread of the packet
  // offsets in Hz, i.e. how badly that patch is shimmed.
  const SITES = [
    { x1: -1e9, x2: 1900, ppm: 0.00, name: 'Si(CH3)4', inhom: 1.5 },
    { x1: 1900, x2: 3100, ppm: 2.10, name: 'CH3', inhom: 9.0 },
  ];
  const siteAt = (x) => SITES.find(s => x >= s.x1 && x < s.x2) || SITES[SITES.length - 1];
  const shiftHz = (site) => site.ppm * HZ_PER_PPM;

  // Which instrument the player is standing in.
  const INSTRUMENTS = [
    { x1: -1e9, x2: 3100, key: 'nmr',   name: 'NMR 500 MHz' },
    { x1: 3100, x2: 3950, key: 'ir',    name: 'FT-IR bench' },
    { x1: 3950, x2: 4700, key: 'raman', name: 'Raman bench' },
    { x1: 4700, x2: 1e9,  key: 'uvvis', name: 'UV-Vis' },
  ];
  const instrumentAt = (x) => INSTRUMENTS.find(i => x >= i.x1 && x < i.x2) || INSTRUMENTS[0];

  // ---------- level geometry ----------
  const solids = [];
  const ground = (x1, x2) => solids.push({ x: x1, y: GROUND_Y, w: x2 - x1, h: WORLD_H - GROUND_Y, type: 'ground' });
  const plat = (x, y, w, h = 24) => solids.push({ x, y, w, h, type: 'plat' });

  ground(0, 1600);          // stage 1-2
  ground(1680, 2450);       // 80 px pit at 1600-1680
  ground(2530, 4620);       // 80 px pit at 2450-2530
  ground(4690, 5500);       // 70 px pit at 4620-4690

  plat(520, GROUND_Y - 96, 90);
  plat(1240, GROUND_Y - 104, 90);
  plat(2150, GROUND_Y - 108, 110);
  plat(2880, GROUND_Y - 100, 90);

  const worldWidth = 5500;

  // ---------- stage 4: the vibrational ladder ----------
  // Morse-like levels G(v) = w(v+1/2) - w*xe*(v+1/2)^2, so the rungs close up
  // as you climb. Scaled so one jump clears exactly one rung and never two.
  const WNUM = 3000, XE = 0.02;                       // cm^-1, anharmonicity constant
  const G = (v) => WNUM * (v + 0.5) - WNUM * XE * (v + 0.5) * (v + 0.5);
  const PX_PER_CM = 300 / (G(4) - G(0));
  const rungs = [];
  for (let v = 1; v <= 4; v++) {
    const y = GROUND_Y - (G(v) - G(0)) * PX_PER_CM;
    const x = 3250 + (v - 1) * 118;
    rungs.push({ v, x, y, w: 96 });
    plat(x, y, 96);
  }

  // Selection-rule doors at the end of the IR hall: the symmetric stretch does
  // not change the dipole moment, so it never absorbs and never opens.
  const irDoors = [
    { x: 3745, y: GROUND_Y - 200, h: 200, active: false, label: 'symmetric stretch', sub: 'no dipole change - IR inactive' },
    { x: 3745, y: GROUND_Y - 300, h: 100, active: true, label: 'asymmetric stretch', sub: 'dipole changes - IR active' },
  ];

  // ---------- stage 6: Beer-Lambert lanes ----------
  // Three ways through the sample compartment, three absorbances A = eps*c*l.
  // Three lanes 84 px apart - one jump each, and each one walled in so the
  // only way past is through its cuvette. The clearest sample is the highest
  // climb, which is the whole trade.
  const LANE_Y = [GROUND_Y, GROUND_Y - 84, GROUND_Y - 168];
  plat(4800, LANE_Y[1], 500);
  plat(4900, LANE_Y[2], 400);
  plat(4900, LANE_Y[2] - 84, 400);           // ceiling, so the top lane cannot be jumped over
  const cuvettes = [
    { x: 5060, yTop: LANE_Y[0] - 58, h: 58, eps: 1800, c: 6.7e-4, l: 1.0 },   // A = 1.21
    { x: 5060, yTop: LANE_Y[1] - 58, h: 58, eps: 1800, c: 3.3e-4, l: 1.0 },   // A = 0.59
    { x: 5060, yTop: LANE_Y[2] - 58, h: 58, eps: 1800, c: 8.3e-5, l: 1.0 },   // A = 0.15
  ];
  cuvettes.forEach(cv => { cv.A = cv.eps * cv.c * cv.l; cv.T = Math.pow(10, -cv.A); cv.used = false; });

  const detector = { x: 5390, yTop: GROUND_Y - 200, h: 200 };

  // ---------- stage objects ----------
  // Resonance gates: only open while the transmitter sits on the local Larmor
  // frequency, so a new chemical environment means retuning.
  const gates = [
    { x: 760, ppm: 0.00 },
    { x: 1960, ppm: 2.10 },
  ];

  // Pulse pads. A 90 tips Mz into the plane; a 180 mirrors the fan and inverts Mz.
  const padsInit = [
    { x: 1010, deg: 90 },
    { x: 1330, deg: 90 },   // pulsing again here is the T1 lesson: Mz is not back yet
    { x: 2060, deg: 90 },
    { x: 2270, deg: 180 },
    { x: 2430, deg: 180 },
    { x: 2960, deg: 180 },
  ];

  // Acquisition coils: running through one records whatever transverse signal
  // you have at that instant.
  const coilsInit = [
    { x: 1160 }, { x: 1450 },
    { x: 2620 }, { x: 2750 }, { x: 2880 }, { x: 3010 },
  ];

  // Paramagnetic ions: touching one wrecks your phase coherence (relaxation
  // enhancement), which costs signal but not a life.
  const relaxersInit = [
    { x: 1500, min: 1380, max: 1580 },
    { x: 2200, min: 2120, max: 2400 },
    { x: 2700, min: 2600, max: 2860 },
  ];

  const CHECKPOINTS = [0, 940, 1910, 3110, 3960, 4710];

  const STAGES = [
    { x: 30, title: "STAGE 1 — RESONANCE",
      text: "You are 1H magnetization in B0 = 11.74 T, so the Larmor frequency is ν = γB0 = 500.00 MHz. Tune the transmitter (Q / E, or the TUNE buttons) until the offset reads zero — the gate only opens on resonance." },
    { x: 940, title: "STAGE 2 — PULSE AND T1",
      text: "A 90° pulse tips Mz into the xy-plane, and that transverse magnetization is your signal. Mz then crawls back as M0(1 − e^(−t/T1)), so pulsing again too soon leaves you almost nothing to detect." },
    { x: 1910, title: "STAGE 3 — T2* AND THE ECHO",
      text: "This patch is badly shimmed: the packets spread out, the signal dies at T2* instead of T2, and the dial fans open. A 180° pulse mirrors the fan so it winds back together — the echo arrives at 2τ." },
    { x: 3110, title: "STAGE 4 — INFRARED",
      text: "Now you are a vibrating bond. Rungs sit at E(v) = ω(v+½) − ωx(v+½)², so they close up as you climb. Your jump clears exactly one rung and never two: that is the Δv = ±1 selection rule, enforced by gravity." },
    { x: 3960, title: "STAGE 5 — RAMAN",
      text: "Photons scatter off you. From v = 0 only the Stokes route is open (the photon gives up a vibrational quantum). Arrive still vibrating and you scatter anti-Stokes instead — worth far more, because at 300 K hardly anything is vibrationally excited." },
    { x: 4710, title: "STAGE 6 — UV-VIS",
      text: "Beer–Lambert: A = εcl and T = 10^(−A). Three cuvettes, three absorbances. Pick the clear path and your beam still reaches the detector bright." },
  ];

  // ---------- game state ----------
  let player, camX, score, lives, state, stageIdx;
  let packs;                 // spin packets: {dnu, mx, my, mz}
  let nuRF;                  // transmitter offset, Hz
  let spinTime;              // seconds of simulated spin time
  let fidBuf;                // co-added FID: scans sum, exactly like signal averaging
  let scanIdx, nScans;       // where we are in the current scan, and how many scans
  let nextSample;            // spin time of the next FID sample
  let pads, coils, relaxers, photons, photonTimer;
  let vib;                   // vibrational quantum number, stages 4-5
  let beam;                  // UV-Vis transmitted intensity, 0..1
  let toastTitle, toastText, toastTimer;
  let flashTimer, flashText;
  let hudOn = true;
  let stokes, antiStokes, bestSignal;
  let furthestX;

  const M0 = 1;

  function resetFid() {
    fidBuf = new Array(ACQ);
    for (let i = 0; i < ACQ; i++) fidBuf[i] = [0, 0];
    scanIdx = ACQ;           // ACQ means "not acquiring"
    nScans = 0;
  }

  function resetPlayer(x, y) {
    player = { x, y, w: 26, h: 40, vx: 0, vy: 0, onGround: false, facing: 1, walkT: 0 };
  }

  // Deterministic, roughly Gaussian spread of packet offsets in units of the
  // local inhomogeneity, so the fan-out looks like a real field distribution
  // rather than an evenly spaced comb (which would re-phase periodically).
  const SPREAD = [];
  for (let i = 0; i < N_PACK; i++) {
    const u = (i + 0.5) / N_PACK;
    const t = Math.sqrt(-2 * Math.log(Math.min(u, 1 - u) + 1e-6));
    const z = (u < 0.5 ? -1 : 1) * (t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t));
    SPREAD.push(z * 0.62);
  }

  function resetSpins() {
    packs = [];
    for (let i = 0; i < N_PACK; i++) packs.push({ dnu: 0, mx: 0, my: 0, mz: M0 / N_PACK });
  }

  // The observable signal is the vector sum over packets - exactly what a coil
  // sees, which is why dephasing costs you signal without destroying anything.
  function netMxyComplex() {
    let sx = 0, sy = 0;
    for (const p of packs) { sx += p.mx; sy += p.my; }
    return [sx, sy];
  }
  function netMxy() {
    const [sx, sy] = netMxyComplex();
    return Math.hypot(sx, sy);
  }
  function netMz() {
    let s = 0;
    for (const p of packs) s += p.mz;
    return s;
  }

  // Rotation of every packet about the x axis by theta.
  function pulse(deg, efficiency) {
    const th = (deg * Math.PI / 180) * efficiency;
    const c = Math.cos(th), s = Math.sin(th);
    for (const p of packs) {
      const my = p.my * c + p.mz * s;
      const mz = -p.my * s + p.mz * c;
      p.my = my; p.mz = mz;
    }
  }

  // Give every packet the offset of the environment it sits in, so a packet
  // keeps its chemical shift for the whole acquisition.
  function reseedOffsets(x) {
    const site = siteAt(x);
    const base = shiftHz(site);
    for (let i = 0; i < N_PACK; i++) packs[i].dnu = base + SPREAD[i] * site.inhom;
  }

  // Free precession plus relaxation, for dtSpin seconds of spin time.
  function evolve(dtSpin) {
    const e2 = Math.exp(-dtSpin / T2);
    const e1 = Math.exp(-dtSpin / T1);
    const eq = M0 / N_PACK;
    for (const p of packs) {
      const ang = 2 * Math.PI * p.dnu * dtSpin;
      const c = Math.cos(ang), s = Math.sin(ang);
      const mx = p.mx * c - p.my * s;
      const my = p.mx * s + p.my * c;
      p.mx = mx * e2;
      p.my = my * e2;
      p.mz = eq + (p.mz - eq) * e1;
    }
  }

  // ---------- in-place radix-2 FFT ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // Magnitude spectrum of the recorded FID, fftshifted and mapped to ppm.
  function spectrumFromFid() {
    const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
    for (let i = 0; i < ACQ; i++) {
      const apod = Math.exp(-2 * i / ACQ);        // exponential apodization, ~5 Hz of broadening
      re[i] = fidBuf[i][0] * apod;
      im[i] = fidBuf[i][1] * apod;
    }                                             // the remaining points stay zero: zero-filling
    fft(re, im);
    const mag = new Float64Array(NFFT);
    for (let k = 0; k < NFFT; k++) {
      const ks = (k + NFFT / 2) % NFFT;           // fftshift
      mag[k] = Math.hypot(re[ks], im[ks]);
    }
    const hzPerBin = 1 / (DWELL * NFFT);
    const ppmOf = (k) => ((k - NFFT / 2) * hzPerBin) / HZ_PER_PPM;
    return { mag, ppmOf, hzPerBin };
  }

  // ---------- lifecycle ----------
  const hudScore = document.getElementById("hud-score");
  const hudMid = document.getElementById("hud-mid");
  const hudLives = document.getElementById("hud-lives");
  function updateHud() {
    hudScore.textContent = "SCORE " + Math.round(score);
    hudMid.textContent = instrumentAt(player ? player.x : 0).name;
    hudLives.textContent = "LIVES x" + Math.max(0, lives);
  }

  function showToast(title, text, secs) {
    toastTitle = title; toastText = text; toastTimer = secs === undefined ? 6 : secs;
  }
  function flash(text) { flashText = text; flashTimer = 1.4; }

  let sampleAcc = 0;

  function newGame() {
    resetPlayer(150, GROUND_Y - 40);
    resetSpins();
    camX = 0; score = 0; lives = 3; stageIdx = -1;
    nuRF = 1350;                    // deliberately off resonance to start
    spinTime = 0; resetFid(); sampleAcc = 0;
    pads = padsInit.map(p => ({ ...p, cool: 0, flash: 0 }));
    coils = coilsInit.map(c => ({ ...c, got: 0, flash: 0 }));
    relaxers = relaxersInit.map(r => ({ ...r, dir: 1, hit: 0 }));
    photons = []; photonTimer = 0;
    vib = 0; beam = 1;
    cuvettes.forEach(cv => { cv.used = false; });
    stokes = 0; antiStokes = 0; bestSignal = 0;
    furthestX = 0;
    toastTitle = null; toastText = null; toastTimer = 0;
    flashTimer = 0; flashText = null;
    state = "playing";
    updateHud();
  }

  function respawn() {
    let cp = 0;
    for (const c of CHECKPOINTS) if (c <= furthestX) cp = c;
    resetPlayer(cp + 40, GROUND_Y - 60);
    resetSpins();
    camX = Math.max(0, cp - VW / 2);
    vib = 0;
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    if (lives <= 0) { state = "gameover"; showOverlay("Sample lost", "Score " + Math.round(score), "Try again"); }
    else { flash("life lost"); respawn(); }
  }

  // ---------- input ----------
  const keys = { left: false, right: false, down: false, up: false };
  let jumpHeld = false, jumpBuffered = false;

  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "KeyA"].includes(e.code)) keys.left = true;
    if (["ArrowRight", "KeyD"].includes(e.code)) keys.right = true;
    if (["KeyQ"].includes(e.code)) keys.down = true;
    if (["KeyE"].includes(e.code)) keys.up = true;
    if (["ArrowUp", "KeyW", "Space"].includes(e.code)) {
      if (!jumpHeld) jumpBuffered = true;
      jumpHeld = true;
      e.preventDefault();
    }
    if (e.code === "Enter") { if (state !== "playing") startOrRestart(); }
    if (e.code === "KeyP") toggleHud();
  });
  window.addEventListener("keyup", (e) => {
    if (["ArrowLeft", "KeyA"].includes(e.code)) keys.left = false;
    if (["ArrowRight", "KeyD"].includes(e.code)) keys.right = false;
    if (["KeyQ"].includes(e.code)) keys.down = false;
    if (["KeyE"].includes(e.code)) keys.up = false;
    if (["ArrowUp", "KeyW", "Space"].includes(e.code)) jumpHeld = false;
  });

  function bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); el.classList.add("pressed"); onDown(); };
    const up = (e) => { e.preventDefault(); el.classList.remove("pressed"); onUp(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  bindHold(document.getElementById("btn-left"), () => (keys.left = true), () => (keys.left = false));
  bindHold(document.getElementById("btn-right"), () => (keys.right = true), () => (keys.right = false));
  bindHold(document.getElementById("btn-tune-down"), () => (keys.down = true), () => (keys.down = false));
  bindHold(document.getElementById("btn-tune-up"), () => (keys.up = true), () => (keys.up = false));
  bindHold(document.getElementById("btn-jump"),
    () => { if (!jumpHeld) jumpBuffered = true; jumpHeld = true; },
    () => { jumpHeld = false; });

  const physicsBtn = document.getElementById("btn-physics");
  function toggleHud() { hudOn = !hudOn; physicsBtn.classList.toggle("on", hudOn); }
  physicsBtn.addEventListener("click", toggleHud);
  physicsBtn.classList.add("on");

  // Tapping the canvas dismisses the results screen.
  canvas.addEventListener("pointerdown", () => { if (state === "results") startOrRestart(); });

  // ---------- overlay ----------
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMsg = document.getElementById("overlay-msg");
  const overlayBtn = document.getElementById("overlay-btn");
  function showOverlay(title, msg, btn) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btn;
    overlay.classList.remove("hidden");
  }
  function startOrRestart() { overlay.classList.add("hidden"); document.body.classList.remove("results"); newGame(); }
  overlayBtn.addEventListener("click", startOrRestart);

  // ---------- collision ----------
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function blockers() {
    const list = solids.slice();
    for (const g of gates) if (!gateOpen(g)) list.push({ x: g.x, y: GROUND_Y - 130, w: 12, h: 130, type: "gate" });
    for (const d of irDoors) if (!d.active) list.push({ x: d.x, y: d.y, w: 12, h: d.h, type: "door" });
    return list;
  }

  function gateOpen(g) {
    return Math.abs(g.ppm * HZ_PER_PPM - nuRF) < OFF_RES;
  }

  function moveAndCollide(entity, dx, dy, list) {
    entity.x += dx;
    for (const s of list) {
      if (!overlaps(entity, s)) continue;
      if (dx > 0) entity.x = s.x - entity.w;
      else if (dx < 0) entity.x = s.x + s.w;
    }
    entity.y += dy;
    entity.onGround = false;
    for (const s of list) {
      if (!overlaps(entity, s)) continue;
      if (dy > 0) { entity.y = s.y - entity.h; entity.vy = 0; entity.onGround = true; entity.standing = s; }
      else if (dy < 0) { entity.y = s.y + s.h; entity.vy = 0; }
    }
  }

  // Advance the spin simulation in sub-steps no longer than one dwell, so the
  // recorded FID really is sampled at 1/DWELL and its frequencies are honest.
  function advanceSpins(dtSpin, recording) {
    let left = dtSpin;
    let guard = 0;
    while (left > 1e-9 && guard++ < 8192) {
      const step = Math.min(left, DWELL);
      evolve(step);
      spinTime += step;
      left -= step;
      if (recording && scanIdx < ACQ) {
        sampleAcc += step;
        if (sampleAcc >= DWELL - 1e-9) {
          const [sx, sy] = netMxyComplex();
          fidBuf[scanIdx][0] += sx;
          fidBuf[scanIdx][1] += sy;
          scanIdx += 1;
          sampleAcc = 0;
        }
      }
    }
  }

  // ---------- update ----------
  let vibTimer = 3;
  let lastInstKey = null;
  let results = null;
  const BEAM_Y = GROUND_Y - 100;

  function finish() {
    toastTitle = null; toastText = null; toastTimer = 0;
    document.body.classList.add("results");
    const bonus = Math.round(1500 * beam);
    score += bonus;
    results = { bonus, spec: spectrumFromFid(), beam, stokes, antiStokes, best: bestSignal };
    state = "results";
    updateHud();
  }

  function update(dt) {
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) { toastTitle = null; toastText = null; } }
    if (flashTimer > 0) flashTimer -= dt;
    if (state !== "playing") return;

    // --- tuning the transmitter ---
    if (keys.up && !keys.down) nuRF = Math.min(TUNE_MAX, nuRF + TUNE_RATE * dt);
    if (keys.down && !keys.up) nuRF = Math.max(TUNE_MIN, nuRF - TUNE_RATE * dt);

    const inst = instrumentAt(player.x);
    if (inst.key !== lastInstKey) { lastInstKey = inst.key; updateHud(); }
    const site = siteAt(player.x);
    const offset = shiftHz(site) - nuRF;
    const eff = Math.max(0, Math.min(1, (OFF_RES - Math.abs(offset)) / (OFF_RES - ON_RES)));

    // --- platformer motion ---
    if (keys.left && !keys.right) { player.vx -= MOVE_ACCEL * dt; player.facing = -1; }
    else if (keys.right && !keys.left) { player.vx += MOVE_ACCEL * dt; player.facing = 1; }
    else {
      const f = FRICTION * dt;
      if (player.vx > 0) player.vx = Math.max(0, player.vx - f);
      else if (player.vx < 0) player.vx = Math.min(0, player.vx + f);
    }
    player.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, player.vx));

    if (jumpBuffered) {
      if (player.onGround) { player.vy = JUMP_VELOCITY; player.onGround = false; }
      jumpBuffered = false;
    }
    if (!jumpHeld && player.vy < CUT_VELOCITY) player.vy = CUT_VELOCITY;
    player.vy = Math.min(player.vy + GRAVITY * dt, 1400);

    const list = blockers();
    moveAndCollide(player, player.vx * dt, 0, list);
    moveAndCollide(player, 0, player.vy * dt, list);
    player.walkT += Math.abs(player.vx) * dt * 0.02;
    if (player.x < 0) player.x = 0;
    furthestX = Math.max(furthestX, player.x);

    // --- the spin simulation, recorded only while inside the magnet ---
    advanceSpins(dt * TIME_SCALE, inst.key === "nmr");

    // --- stage banners ---
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (player.x >= STAGES[i].x && i > stageIdx) { stageIdx = i; showToast(STAGES[i].title, STAGES[i].text, 7); break; }
    }

    // --- pulse pads ---
    for (const pad of pads) {
      if (pad.cool > 0) pad.cool -= dt;
      if (pad.flash > 0) pad.flash -= dt;
      if (pad.cool > 0) continue;
      if (!overlaps(player, { x: pad.x - 20, y: GROUND_Y - 44, w: 40, h: 44 })) continue;
      if (eff > 0.05) {
        if (pad.deg === 90) reseedOffsets(player.x);   // packets take on the local shift
        pulse(pad.deg, eff);
        if (pad.deg === 90) { scanIdx = 0; nScans += 1; }   // acquisition starts here
        pad.cool = 2.2; pad.flash = 0.7;
        flash(pad.deg + "° pulse" + (eff > 0.95 ? "" : "  (only " + Math.round(eff * 100) + "% effective, you are off resonance)"));
      } else {
        pad.cool = 1.0;
        flash("off resonance by " + Math.round(Math.abs(offset)) + " Hz - the pulse does nothing");
      }
    }

    // --- acquisition coils ---
    for (const c of coils) {
      if (c.flash > 0) c.flash -= dt;
      if (c.got) continue;
      if (!overlaps(player, { x: c.x - 16, y: GROUND_Y - 96, w: 32, h: 96 })) continue;
      const sig = netMxy();
      if (sig < 0.02) continue;        // nothing to detect yet - leave the coil for later
      c.got = sig;
      c.flash = 1.4;
      bestSignal = Math.max(bestSignal, sig);
      const pts = Math.round(sig * 1200);
      score += pts;
      flash("coil: " + (sig * 100).toFixed(0) + "% of M0 detected  (+" + pts + ")");
      updateHud();
    }

    // --- paramagnetic ions ---
    for (const r of relaxers) {
      r.x += r.dir * 62 * dt;
      if (r.x < r.min) { r.x = r.min; r.dir = 1; }
      if (r.x > r.max) { r.x = r.max; r.dir = -1; }
      if (r.hit > 0) r.hit -= dt;
      if (r.hit <= 0 && overlaps(player, { x: r.x, y: GROUND_Y - 26, w: 26, h: 26 })) {
        for (const p of packs) { p.mx *= 0.25; p.my *= 0.25; }
        r.hit = 1.6;
        flash("paramagnetic ion: relaxation enhanced, coherence gone");
      }
    }

    // --- stage 4: which rung are you on ---
    if (inst.key === "ir" && player.onGround) {
      const s = player.standing;
      const rg = s ? rungs.find(r => Math.abs(r.x - s.x) < 1 && Math.abs(r.y - s.y) < 1) : null;
      const nv = rg ? rg.v : 0;
      if (nv !== vib) {
        vib = nv;
        if (rg && !rg.scored) {
          rg.scored = true;
          score += 80;
          updateHud();
          flash("v = " + nv + "   E = " + Math.round(G(nv)) + " cm⁻¹   (+80)");
        }
      }
    }

    // --- vibrational relaxation once you leave the IR beam ---
    if (inst.key !== "ir") {
      if (vib <= 0) vibTimer = 3;
      else {
        vibTimer -= dt;
        if (vibTimer <= 0) { vibTimer = 3; vib -= 1; flash("vibrational relaxation: v -> " + vib); }
      }
    }

    // --- stage 5: Raman photons ---
    if (inst.key === "raman") {
      photonTimer -= dt;
      if (photonTimer <= 0) { photonTimer = 1.1; photons.push({ x: 4690, y: BEAM_Y, kind: null, life: 0 }); }
    }
    for (const ph of photons) {
      if (ph.kind) { ph.life += dt; ph.x += (ph.kind === "anti" ? 200 : -90) * dt; continue; }
      ph.x -= 250 * dt;
      if (!overlaps(player, { x: ph.x - 9, y: ph.y - 9, w: 18, h: 18 })) continue;
      if (vib > 0) {
        vib -= 1; antiStokes += 1; score += 250; ph.kind = "anti";
        flash("anti-Stokes! you gave the photon a quantum, it leaves bluer  (+250)");
      } else {
        vib = Math.min(4, vib + 1); stokes += 1; score += 40; ph.kind = "stokes";
        flash("Stokes: the photon left a quantum behind, it leaves redder  (+40)");
      }
      updateHud();
    }
    photons = photons.filter(ph => ph.x > 3880 && ph.life < 1.6);

    // --- stage 6: Beer-Lambert cuvettes ---
    for (const cv of cuvettes) {
      if (cv.used) continue;
      if (!overlaps(player, { x: cv.x, y: cv.yTop, w: 120, h: cv.h })) continue;
      cv.used = true;
      beam *= cv.T;
      flash("A = " + cv.A.toFixed(2) + "  ->  T = 10^(-A) = " + (cv.T * 100).toFixed(1) + "%   beam now " + (beam * 100).toFixed(0) + "%");
    }

    // --- the detector ends the run ---
    if (player.x + player.w > detector.x) { finish(); return; }

    // --- falling into a pit ---
    if (player.y > WORLD_H + 100) { loseLife(); return; }

    camX = Math.max(0, Math.min(player.x - VW / 2, worldWidth - VW));
  }

  // ---------- drawing: the world ----------
  const BG = {
    nmr:   ["#0b1022", "#1b2547"],
    ir:    ["#1d0f0a", "#3a1b12"],
    raman: ["#06140f", "#0e2c22"],
    uvvis: ["#160a24", "#2d1450"],
  };

  function drawBackground(inst) {
    const c = BG[inst.key] || BG.nmr;
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, c[0]);
    g.addColorStop(1, c[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    if (inst.key === "nmr") {
      // B0 field lines running down the bore
      ctx.strokeStyle = "rgba(120,170,255,0.16)";
      ctx.lineWidth = 1;
      for (let y = 40; y < GROUND_Y; y += 34) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(120,170,255,0.35)";
      ctx.font = "11px monospace";
      ctx.fillText("B0 = 11.74 T", 8, 36);
    }
  }

  function drawSolids() {
    for (const s of solids) {
      if (s.x + s.w < camX || s.x > camX + VW) continue;
      if (s.type === "ground") {
        ctx.fillStyle = "#2a3350";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = "#495b8c";
        ctx.fillRect(s.x, s.y, s.w, 5);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        for (let bx = s.x; bx < s.x + s.w; bx += 40) {
          ctx.beginPath(); ctx.moveTo(bx, s.y + 6); ctx.lineTo(bx, s.y + s.h); ctx.stroke();
        }
      } else {
        ctx.fillStyle = "#3d4c78";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(s.x, s.y, s.w, 3);
      }
    }
  }

  function drawGates() {
    ctx.textAlign = "center";
    for (const g of gates) {
      if (g.x < camX - 120 || g.x > camX + VW + 120) continue;
      const open = gateOpen(g);
      if (open) {
        ctx.fillStyle = "rgba(80,220,140,0.22)";
        ctx.fillRect(g.x, GROUND_Y - 130, 12, 130);
      } else {
        ctx.fillStyle = "rgba(255,90,90,0.85)";
        for (let y = GROUND_Y - 130; y < GROUND_Y; y += 16) ctx.fillRect(g.x, y, 12, 10);
      }
      ctx.fillStyle = open ? "#7cf0a8" : "#ff9a9a";
      ctx.font = "bold 11px monospace";
      ctx.fillText(open ? "OPEN" : "LOCKED", g.x + 6, GROUND_Y - 152);
      ctx.font = "11px monospace";
      ctx.fillText("needs " + g.ppm.toFixed(2) + " ppm", g.x + 6, GROUND_Y - 138);
    }
    ctx.textAlign = "left";
  }

  function drawPads() {
    ctx.textAlign = "center";
    for (const pad of pads) {
      if (pad.x < camX - 60 || pad.x > camX + VW + 60) continue;
      const ready = pad.cool <= 0;
      const col = pad.deg === 90 ? "#ffcc33" : "#66d4ff";
      ctx.fillStyle = pad.flash > 0 ? "#ffffff" : (ready ? col : "rgba(255,255,255,0.25)");
      ctx.fillRect(pad.x - 20, GROUND_Y - 8, 40, 8);
      ctx.fillStyle = col;
      ctx.font = "bold 12px monospace";
      ctx.fillText(pad.deg + " deg", pad.x, GROUND_Y - 14);
      if (pad.flash > 0) {
        ctx.strokeStyle = "rgba(255,255,255," + (pad.flash / 0.7) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pad.x, GROUND_Y - 20, 40 * (1 - pad.flash / 0.7) + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.textAlign = "left";
  }

  function drawCoils() {
    ctx.textAlign = "center";
    for (const c of coils) {
      if (c.x < camX - 60 || c.x > camX + VW + 60) continue;
      ctx.strokeStyle = c.got ? "#7cf0a8" : "#c8d4ff";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(c.x, GROUND_Y - 20 - i * 16, 16, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = c.got ? "#7cf0a8" : "#8fa3d8";
      ctx.font = "10px monospace";
      ctx.fillText(c.got ? (c.got * 100).toFixed(0) + "%" : "COIL", c.x, GROUND_Y - 108);
    }
    ctx.textAlign = "left";
  }

  function drawRelaxers() {
    ctx.textAlign = "center";
    for (const r of relaxers) {
      if (r.x < camX - 60 || r.x > camX + VW + 60) continue;
      ctx.fillStyle = "#c86bff";
      ctx.beginPath();
      ctx.arc(r.x + 13, GROUND_Y - 13, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,107,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x + 13, GROUND_Y - 13, 19 + Math.sin(performance.now() / 200) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#2a0b3d";
      ctx.font = "bold 10px monospace";
      ctx.fillText("Gd", r.x + 13, GROUND_Y - 9);
    }
    ctx.textAlign = "left";
  }

  function drawRungs() {
    ctx.font = "10px monospace";
    for (const r of rungs) {
      if (r.x + r.w < camX - 80 || r.x > camX + VW) continue;
      ctx.strokeStyle = "rgba(224,138,90,0.35)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(r.x - 70, r.y); ctx.lineTo(r.x, r.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = vib === r.v ? "#ffcc33" : "#e08a5a";
      ctx.fillText("v = " + r.v + "   " + Math.round(G(r.v)) + " cm-1", r.x + 2, r.y - 6);
    }
  }

  function drawIrDoors() {
    for (const d of irDoors) {
      if (d.x < camX - 80 || d.x > camX + VW + 80) continue;
      ctx.fillStyle = d.active ? "rgba(90,230,150,0.28)" : "rgba(255,120,90,0.85)";
      ctx.fillRect(d.x, d.y, 12, d.h);
      ctx.save();
      ctx.translate(d.x + 6, d.y + d.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = d.active ? "#8ff0b8" : "#ffb3a0";
      ctx.font = "bold 11px monospace";
      ctx.fillText(d.label, 0, -13);
      ctx.font = "9px monospace";
      ctx.fillText(d.sub, 0, -1);
      ctx.restore();
      ctx.textAlign = "left";
    }
  }

  function drawBeam() {
    if (camX + VW > 3950 && camX < 4700) {
      ctx.strokeStyle = "rgba(120,255,180,0.28)";
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(3950, BEAM_Y); ctx.lineTo(4700, BEAM_Y); ctx.stroke();
      ctx.strokeStyle = "rgba(200,255,220,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(3950, BEAM_Y); ctx.lineTo(4700, BEAM_Y); ctx.stroke();
    }
    for (const ph of photons) {
      const col = ph.kind === "anti" ? "#7fb0ff" : ph.kind === "stokes" ? "#ff8a5c" : "#eaffef";
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ph.x, ph.y, ph.kind ? 7 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ph.x, ph.y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawCuvettes() {
    ctx.font = "10px monospace";
    for (const cv of cuvettes) {
      if (cv.x + 120 < camX || cv.x > camX + VW) continue;
      const dark = Math.min(0.8, 0.12 + cv.A * 0.45);
      ctx.fillStyle = "rgba(90,45,150," + dark + ")";
      ctx.fillRect(cv.x, cv.yTop, 120, cv.h);
      ctx.strokeStyle = cv.used ? "#7cf0a8" : "#b79bff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cv.x, cv.yTop, 120, cv.h);
      ctx.fillStyle = "#efe8ff";
      ctx.fillText("A = " + cv.A.toFixed(2), cv.x + 8, cv.yTop + 15);
      ctx.fillText("T = " + (cv.T * 100).toFixed(1) + "%", cv.x + 8, cv.yTop + 28);
    }
  }

  function drawDetector() {
    if (detector.x + 60 < camX || detector.x > camX + VW) return;
    ctx.fillStyle = "#cfd8ff";
    ctx.fillRect(detector.x, detector.yTop, 14, detector.h);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("DETECTOR", detector.x + 7, detector.yTop - 10);
    ctx.textAlign = "left";
  }

  function drawPlayer() {
    const { x, y, w, h } = player;
    ctx.fillStyle = "#e8f0ff";
    ctx.fillRect(x + 3, y + 10, w - 6, h - 10);
    ctx.fillStyle = "#9fb8ff";
    ctx.fillRect(x + 3, y + 10, w - 6, 4);
    ctx.fillStyle = "#20284a";
    ctx.fillRect(x + 8, y + 21, 4, 4);
    ctx.fillRect(x + w - 12, y + 21, 4, 4);
  }

  // The phase dial: every spin packet is a spoke, and the bright arrow is their
  // vector sum. Spokes fanned out with a short arrow is exactly what dephasing
  // is, and watching the fan wind back together is the echo.
  function drawDial() {
    const cx = player.x + player.w / 2;
    const cy = player.y - 32;
    const R = 19;
    ctx.strokeStyle = "rgba(160,190,255,0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    const per = M0 / N_PACK;
    const stepI = Math.max(1, Math.round(N_PACK / N_DRAW));
    ctx.strokeStyle = "rgba(140,200,255,0.75)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < N_PACK; i += stepI) {
      const p = packs[i];
      const mag = Math.hypot(p.mx, p.my) / per;
      if (mag < 0.02) continue;
      const a = Math.atan2(p.my, p.mx);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * mag, cy + Math.sin(a) * R * mag);
      ctx.stroke();
    }
    const [sx, sy] = netMxyComplex();
    const net = Math.hypot(sx, sy);
    if (net > 0.01) {
      const a = Math.atan2(sy, sx);
      ctx.strokeStyle = "#ffd93d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * net, cy + Math.sin(a) * R * net);
      ctx.stroke();
    }
  }

  // ---------- drawing: panels that stay on screen ----------
  function panelBox(x, y, w, h, accent) {
    ctx.fillStyle = "rgba(8,11,26,0.78)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  // Transmitter tuning meter: where you are parked, and where the local
  // Larmor frequency actually is.
  function drawTuner(site) {
    const x = 236, y = 42, w = 330, h = 14;
    panelBox(x, y, w, h, "rgba(120,170,255,0.6)");
    const frac = (v) => (v - TUNE_MIN) / (TUNE_MAX - TUNE_MIN);
    const target = shiftHz(site);
    const bandW = Math.max(4, (2 * OFF_RES / (TUNE_MAX - TUNE_MIN)) * w);
    ctx.fillStyle = "rgba(80,220,140,0.45)";
    ctx.fillRect(x + frac(target) * w - bandW / 2, y + 1, bandW, h - 2);
    const px = x + frac(nuRF) * w;
    const onRes = Math.abs(target - nuRF) < OFF_RES;
    ctx.fillStyle = onRes ? "#7cf0a8" : "#ffd93d";
    ctx.fillRect(px - 1.5, y - 3, 3, h + 6);
    ctx.font = "10px monospace";
    ctx.fillStyle = "#9fb8ff";
    ctx.textAlign = "center";
    ctx.fillText("transmitter offset " + Math.round(nuRF) + " Hz", x + w / 2, y - 5);
    ctx.fillStyle = onRes ? "#7cf0a8" : "#ff9a9a";
    const d = Math.round(target - nuRF);
    ctx.fillText(onRes ? "ON RESONANCE" : "off by " + d + " Hz", x + w / 2, y + h + 12);
    ctx.textAlign = "left";
  }

  // Mz can go negative after a 180, so it gets a zero-centred bar.
  function drawSpinBars() {
    const x = 16, w = 138;
    const mz = netMz(), mxy = netMxy();
    ctx.font = "10px monospace";

    panelBox(x, 64, w, 16, "rgba(120,170,255,0.45)");
    const mid = x + w / 2;
    ctx.fillStyle = mz >= 0 ? "#6fd3ff" : "#ff8a8a";
    ctx.fillRect(mz >= 0 ? mid : mid + (mz / M0) * (w / 2), 66, Math.abs(mz / M0) * (w / 2), 12);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.moveTo(mid, 64); ctx.lineTo(mid, 80); ctx.stroke();
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText("Mz " + mz.toFixed(2), x + w + 8, 76);

    panelBox(x, 84, w, 16, "rgba(255,217,61,0.5)");
    ctx.fillStyle = "#ffd93d";
    ctx.fillRect(x + 2, 86, Math.max(0, mxy / M0) * (w - 4), 12);
    ctx.fillStyle = "#ffd93d";
    ctx.fillText("|Mxy| " + mxy.toFixed(2), x + w + 8, 96);
  }

  // Live FID: the transverse signal as it is actually being recorded.
  function drawScope() {
    const x = 16, y = 106, w = 200, h = 54;
    panelBox(x, y, w, h, "rgba(124,240,168,0.45)");
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    if (nScans > 0) {
      let peak = 1e-9;
      for (let i = 0; i < ACQ; i++) peak = Math.max(peak, Math.abs(fidBuf[i][0]));
      ctx.strokeStyle = "#7cf0a8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < ACQ; i++) {
        const px = x + (i / (ACQ - 1)) * w;
        const py = y + h / 2 - (fidBuf[i][0] / peak) * (h / 2 - 4);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (scanIdx < ACQ) {
        ctx.strokeStyle = "rgba(255,217,61,0.9)";
        const px = x + (scanIdx / (ACQ - 1)) * w;
        ctx.beginPath(); ctx.moveTo(px, y + 2); ctx.lineTo(px, y + h - 2); ctx.stroke();
      }
    }
    ctx.fillStyle = "#9fb8ff";
    ctx.font = "9px monospace";
    ctx.fillText("FID  " + nScans + (nScans === 1 ? " scan" : " scans co-added"), x + 5, y + 11);
  }

  function drawVibPanel() {
    const x = 16, y = 64, w = 150, h = 96;
    panelBox(x, y, w, h, "rgba(224,138,90,0.5)");
    ctx.font = "9px monospace";
    ctx.fillStyle = "#e08a5a";
    ctx.fillText("vibrational state", x + 6, y + 12);
    for (let v = 4; v >= 0; v--) {
      const ly = y + 24 + (4 - v) * 15;
      ctx.strokeStyle = v === vib ? "#ffcc33" : "rgba(224,138,90,0.45)";
      ctx.lineWidth = v === vib ? 2.5 : 1;
      ctx.beginPath(); ctx.moveTo(x + 40, ly); ctx.lineTo(x + w - 10, ly); ctx.stroke();
      ctx.fillStyle = v === vib ? "#ffcc33" : "rgba(224,138,90,0.7)";
      ctx.fillText("v=" + v, x + 10, ly + 3);
    }
  }

  function drawBeamPanel() {
    const x = 16, y = 64, w = 200, h = 40;
    panelBox(x, y, w, h, "rgba(183,155,255,0.5)");
    ctx.fillStyle = "#b79bff";
    ctx.font = "9px monospace";
    ctx.fillText("beam reaching the detector", x + 6, y + 12);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 6, y + 18, w - 12, 14);
    ctx.fillStyle = "#e6dcff";
    ctx.fillRect(x + 6, y + 18, (w - 12) * beam, 14);
    ctx.fillStyle = "#1b0f2e";
    ctx.fillText("I/I0 = " + (beam * 100).toFixed(1) + "%   A = " + (-Math.log10(beam)).toFixed(2), x + 12, y + 29);
  }

  // The numbers behind whatever is on screen, toggled with the button or P.
  function drawNumbers(inst) {
    let lines;
    if (inst.key === "nmr") {
      const site = siteAt(player.x);
      const off = shiftHz(site) - nuRF;
      lines = [
        "B0 = " + B0.toFixed(2) + " T    nu0 = gamma*B0 = " + NU0.toFixed(2) + " MHz",
        "site " + site.name + "   delta = " + site.ppm.toFixed(2) + " ppm = " + Math.round(shiftHz(site)) + " Hz",
        "transmitter " + Math.round(nuRF) + " Hz   ->   offset " + Math.round(off) + " Hz",
        "Mz = " + netMz().toFixed(3) + "   |Mxy| = " + netMxy().toFixed(3) + " of M0",
        "T1 = " + (T1 * 1000).toFixed(0) + " ms   T2 = " + (T2 * 1000).toFixed(0) + " ms   shim " + site.inhom.toFixed(1) + " Hz",
        "spin clock " + (spinTime * 1000).toFixed(1) + " ms   (play runs 1:" + Math.round(1 / TIME_SCALE) + ")",
      ];
    } else if (inst.key === "ir" || inst.key === "raman") {
      const dE = Math.round(G(Math.min(vib + 1, 4)) - G(vib));
      lines = [
        "harmonic-ish ladder: E(v) = w(v+1/2) - w*x(v+1/2)^2",
        "w = " + WNUM + " cm-1    anharmonicity x = " + XE,
        "v = " + vib + "    E(v) = " + Math.round(G(vib)) + " cm-1",
        "next gap E(v+1)-E(v) = " + dE + " cm-1  (gaps shrink upward)",
        "at 300 K, N(v=1)/N(v=0) = exp(-w/kT) = 5.6e-7",
        "so anti-Stokes is rare unless something pumped you first",
      ];
    } else {
      lines = [
        "Beer-Lambert:  A = eps * c * l,   T = I/I0 = 10^(-A)",
        "absorbances add, transmissions multiply",
        "beam now " + (beam * 100).toFixed(1) + "% of I0",
        "total A so far = " + (-Math.log10(beam)).toFixed(2),
      ];
    }
    const w = 352, h = 14 + lines.length * 15;
    const x = VW - w - 14, y = 92;
    panelBox(x, y, w, h, "rgba(120,170,255,0.55)");
    ctx.font = "11px monospace";
    ctx.fillStyle = "#dbe6ff";
    lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 18 + i * 15));
  }

  function drawPanels(inst) {
    if (state !== "playing") return;
    if (inst.key === "nmr") { drawTuner(siteAt(player.x)); drawSpinBars(); drawScope(); }
    else if (inst.key === "uvvis") drawBeamPanel();
    else drawVibPanel();
    if (hudOn) drawNumbers(inst);
  }

  function wrapLines(text, maxWidth) {
    const words = text.split(" ");
    const out = [];
    let line = "";
    for (const wd of words) {
      const test = line ? line + " " + wd : wd;
      if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = wd; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  function drawToast() {
    if (!toastText) return;
    const alpha = Math.min(1, toastTimer / 0.6);
    ctx.font = "13px monospace";
    const lines = wrapLines(toastText, VW - 120);
    const h = 34 + lines.length * 17;
    const y = VH - h - 74;
    ctx.globalAlpha = alpha;
    panelBox(48, y, VW - 96, h, "rgba(255,217,61,0.85)");
    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(toastTitle || "", VW / 2, y + 18);
    ctx.fillStyle = "#e9f0ff";
    ctx.font = "13px monospace";
    lines.forEach((l, i) => ctx.fillText(l, VW / 2, y + 36 + i * 17));
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  function drawFlash() {
    if (flashTimer <= 0 || !flashText) return;
    ctx.globalAlpha = Math.min(1, flashTimer / 0.4);
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    const w = ctx.measureText(flashText).width + 24;
    panelBox(VW / 2 - w / 2, 168, w, 24, "rgba(255,255,255,0.5)");
    ctx.fillStyle = "#ffffff";
    ctx.fillText(flashText, VW / 2, 184);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // ---------- the results screen: your own FID, Fourier transformed ----------
  function drawResults() {
    ctx.fillStyle = "rgba(5,7,18,0.94)";
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillText("RUN COMPLETE - here is the spectrum you actually recorded", VW / 2, 30);

    // --- FID ---
    const fx = 34, fy = 52, fw = 330, fh = 110;
    panelBox(fx, fy, fw, fh, "rgba(124,240,168,0.5)");
    ctx.fillStyle = "#7cf0a8";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("FID  (" + nScans + " scans co-added, dwell " + (DWELL * 1e6).toFixed(0) + " us)", fx + 8, fy + 14);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.moveTo(fx, fy + fh / 2); ctx.lineTo(fx + fw, fy + fh / 2); ctx.stroke();
    if (nScans > 0) {
      let peak = 1e-9;
      for (let i = 0; i < ACQ; i++) peak = Math.max(peak, Math.abs(fidBuf[i][0]));
      ctx.strokeStyle = "#7cf0a8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < ACQ; i++) {
        const px = fx + (i / (ACQ - 1)) * fw;
        const py = fy + fh / 2 - (fidBuf[i][0] / peak) * (fh / 2 - 8);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // --- spectrum ---
    const sx = 392, sy = 52, sw = 374, sh = 110;
    panelBox(sx, sy, sw, sh, "rgba(120,170,255,0.55)");
    const { mag, ppmOf, hzPerBin } = results.spec;
    let max = 1e-12;
    for (let k = 0; k < NFFT; k++) max = Math.max(max, mag[k]);
    const PPM_L = 4.0, PPM_R = -1.0;
    const xOfPpm = (p) => sx + ((PPM_L - p) / (PPM_L - PPM_R)) * sw;
    ctx.strokeStyle = "#8fb6ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let k = 0; k < NFFT; k++) {
      const p = ppmOf(k);
      if (p > PPM_L || p < PPM_R) continue;
      const px = xOfPpm(p);
      const py = sy + sh - 16 - (mag[k] / max) * (sh - 34);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.moveTo(sx, sy + sh - 16); ctx.lineTo(sx + sw, sy + sh - 16); ctx.stroke();
    ctx.fillStyle = "#9fb8ff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (let p = 4; p >= -1; p -= 1) ctx.fillText(p.toFixed(0), xOfPpm(p), sy + sh - 4);
    ctx.textAlign = "left";
    ctx.fillText("ppm (TMS at 0)", sx + 8, sy + 14);

    // tallest peak: position and width
    let kMax = 0;
    for (let k = 0; k < NFFT; k++) if (mag[k] > mag[kMax]) kMax = k;
    let lo = kMax, hi = kMax;
    while (lo > 0 && mag[lo] > max / 2) lo--;
    while (hi < NFFT - 1 && mag[hi] > max / 2) hi++;
    const fwhm = (hi - lo) * hzPerBin;
    const peakPpm = ppmOf(kMax);
    const gotSignal = nScans > 0 && max > 1e-6;
    ctx.fillStyle = "#ffd93d";
    ctx.font = "11px monospace";
    if (gotSignal) {
      ctx.fillText("peak " + peakPpm.toFixed(2) + " ppm,  linewidth " + fwhm.toFixed(0) + " Hz", sx + 150, sy + 14);
    } else {
      ctx.fillText("no signal recorded", sx + 150, sy + 14);
    }

    // --- the numbers ---
    const stats = [
      "score                " + Math.round(score),
      "best coil signal     " + (results.best * 100).toFixed(0) + "% of M0",
      "Raman               " + results.stokes + " Stokes, " + results.antiStokes + " anti-Stokes",
      "beam at detector     " + (results.beam * 100).toFixed(1) + "%  (bonus +" + results.bonus + ")",
    ];
    const hints = [
      "A narrow line means the packets stayed together; a broad one means the",
      "shim beat you. The peak sits at the shift you excited, not where you",
      "tuned - retuning moves which site you can hit, not where it resonates.",
    ];
    panelBox(34, 178, VW - 68, 142, "rgba(255,217,61,0.5)");
    ctx.fillStyle = "#e9f0ff";
    ctx.font = "13px monospace";
    stats.forEach((s, i) => ctx.fillText(s, 50, 202 + i * 18));
    ctx.fillStyle = "#9fb8ff";
    ctx.font = "11px monospace";
    hints.forEach((s, i) => ctx.fillText(s, 50, 282 + i * 14));

    ctx.fillStyle = "#ffd93d";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("tap the screen or press Enter to run it again", VW / 2, 346);
    ctx.textAlign = "left";
  }

  // ---------- draw ----------
  function draw() {
    const inst = instrumentAt(player.x);
    drawBackground(inst);
    ctx.save();
    ctx.translate(-camX, 0);
    drawSolids();
    drawGates();
    drawPads();
    drawCoils();
    drawRelaxers();
    drawRungs();
    drawIrDoors();
    drawBeam();
    drawCuvettes();
    drawDetector();
    drawPlayer();
    if (inst.key === "nmr") drawDial();
    ctx.restore();
    drawPanels(inst);
    drawToast();
    drawFlash();
    if (state === "results") drawResults();
  }

  // ---------- boot ----------
  resetPlayer(150, GROUND_Y - 40);
  resetSpins();
  camX = 0; score = 0; lives = 3; stageIdx = -1;
  nuRF = 1350; spinTime = 0; resetFid(); sampleAcc = 0;
  pads = padsInit.map(p => ({ ...p, cool: 0, flash: 0 }));
  coils = coilsInit.map(c => ({ ...c, got: 0, flash: 0 }));
  relaxers = relaxersInit.map(r => ({ ...r, dir: 1, hit: 0 }));
  photons = []; photonTimer = 0; vib = 0; beam = 1;
  stokes = 0; antiStokes = 0; bestSignal = 0; furthestX = 0;
  toastTitle = null; toastText = null; toastTimer = 0; flashTimer = 0; flashText = null;
  state = "menu";
  updateHud();
  showOverlay("Spin Runner",
    "You are the sample: 1H magnetization in a 500 MHz magnet, then a vibrating molecule on the IR and Raman benches, then a beam in the UV-Vis. Move with the arrows, jump, and tune the transmitter with Q / E or the TUNE buttons.",
    "Start");

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 1 / 30);
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Read-only hooks so the physics claims on the project page can be checked
  // against the running game instead of taken on trust.
  window.SpinRunner = {
    getState: () => ({
      x: player.x, y: player.y, state, score, lives, nuRF, vib, beam,
      mz: netMz(), mxy: netMxy(),
      sitePpm: siteAt(player.x).ppm, instrument: instrumentAt(player.x).key,
      scans: nScans, scanIdx, spinTime, coils: coils.map(c => c.got),
      onResonance: Math.abs(shiftHz(siteAt(player.x)) - nuRF) < OFF_RES,
    }),
    constants: { B0, NU0, HZ_PER_PPM, T1, T2, TIME_SCALE, DWELL, N_PACK, WNUM, XE, OFF_RES },
    ladder: () => rungs.map(r => ({ v: r.v, cm: G(r.v), x: r.x, y: r.y })),
    cuvettes: () => cuvettes.map(c => ({ A: c.A, T: c.T })),
    setX: (x) => { player.x = x; furthestX = Math.max(furthestX, x); },
    setTune: (hz) => { nuRF = hz; },
    pulse90: () => { reseedOffsets(player.x); pulse(90, 1); scanIdx = 0; nScans += 1; },
    pulse180: () => pulse(180, 1),
    advance: (spinSeconds) => advanceSpins(spinSeconds, true),
    spectrum: () => spectrumFromFid(),
  };
})();
