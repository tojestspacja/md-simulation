// THROUGH — a platformer where you are a quantum particle.
//
// Built to be picked up by anyone: run, jump, reach the end. The only thing
// that makes it strange is that walls are not always solid — and that is the
// real physics doing the work, not a power-up.
//
//   tunnelling      T = exp(-2*kappa*d),  kappa = sqrt(2m(V-E))/hbar
//                   so the odds fall EXPONENTIALLY with thickness: double the
//                   wall and you square the chance. Run faster (more E) and the
//                   odds improve. Both are in the formula below, unchanged.
//
//   measurement     a detector beam collapses you. While observed you are a
//                   definite particle: solid, and walls are solid too.
//
//   superposition   a splitter puts you on both paths at once. One set of
//                   controls, two bodies, and they must both survive.
//
//   interference    when the two paths merge, what matters is the DIFFERENCE in
//                   how far each travelled. Equal paths add up; half a
//                   wavelength apart and they cancel.
//
// No jargon is shown to the player unless they press the physics button.
(() => {
  "use strict";

  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");
  const VW = cv.width, VH = cv.height;
  const $ = (id) => document.getElementById(id);

  // ---------- movement (tuned by hand until it felt right) ----------
  const GRAV = 2200, ACCEL = 1500, VMAX = 250, FRIC = 1700;
  const JUMP = -690, CUT = -420, GROUND_Y = 388;

  // ---------- the one piece of physics the whole game turns on ----------
  // T = exp(-ALPHA * d * sqrt(V - E)). E comes from how fast you are going.
  const ALPHA = 0.075, EMAX = 0.55;
  function chance(barrier, speed) {
    const f = Math.min(1, Math.abs(speed) / VMAX);
    const E = EMAX * f * f;                       // kinetic energy, normalised
    return Math.exp(-ALPHA * barrier.d * Math.sqrt(Math.max(0, barrier.V - E)));
  }

  const LAMBDA = 120;        // the wavelength, for the interference at the merge

  // ---------- level ----------
  const solids = [];
  const ground = (x1, x2, y) => solids.push({ x: x1, y: y === undefined ? GROUND_Y : y,
    w: x2 - x1, h: VH - (y === undefined ? GROUND_Y : y), kind: "ground" });
  const block = (x, y, w, h) => solids.push({ x, y, w, h, kind: "block" });

  const barriers = [];       // the walls you can go through
  const wall = (x, y, h, d, V, tag) => barriers.push({ x, y, w: d, h, d, V: V || 1, tag: tag || "", roll: null, cool: 0 });

  const eyes = [];           // detectors: while they light you, you are collapsed
  const eye = (x, y, reach, period, phase) => eyes.push({ x, y, reach, period, phase: phase || 0, lit: false });

  const orbs = [];           // things to collect, so there is a reason to explore
  const orb = (x, y) => orbs.push({ x, y, got: false });

  const signs = [];
  const sign = (x, y, lines) => signs.push({ x, y, lines });

  // --- act 1: just a platformer -------------------------------------------
  ground(0, 760);
  block(300, GROUND_Y - 96, 110, 18);
  block(520, GROUND_Y - 150, 110, 18);
  sign(90, GROUND_Y - 70, ["← →  move", "space  jump"]);
  orb(355, GROUND_Y - 130);
  orb(575, GROUND_Y - 184);

  // --- act 2: the first wall ----------------------------------------------
  ground(760, 1500);
  block(760, GROUND_Y - 210, 740, 20);           // ceiling: no jumping over
  wall(1060, GROUND_Y - 190, 190, 9, 1, "");
  sign(830, GROUND_Y - 78, ["some walls", "are not solid"]);
  orb(1240, GROUND_Y - 60);
  orb(1340, GROUND_Y - 60);

  // --- act 3: thickness is everything -------------------------------------
  ground(1500, 2320);
  block(1500, GROUND_Y - 210, 430, 20);          // ceiling stops short...
  block(2130, GROUND_Y - 210, 190, 20);          // ...and starts again, leaving a way over
  wall(1700, GROUND_Y - 190, 190, 17, 1, "");
  wall(1980, GROUND_Y - 190, 190, 34, 1, "");    // 18% — go round, or gamble
  block(1840, GROUND_Y - 104, 96, 14);           // the step up to the long way
  block(2036, GROUND_Y - 104, 96, 14);           // and down the far side
  sign(1540, GROUND_Y - 78, ["thicker is", "much harder"]);
  sign(1836, GROUND_Y - 132, ["or climb over"]);
  orb(2000, GROUND_Y - 60);                      // the prize for gambling anyway
  orb(1888, GROUND_Y - 180);

  // --- act 4: being watched -----------------------------------------------
  ground(2320, 3100);
  block(2320, GROUND_Y - 210, 780, 20);
  eye(2560, GROUND_Y - 186, 210, 4.2, 0);
  eye(2860, GROUND_Y - 186, 210, 4.2, 2.1);
  wall(2660, GROUND_Y - 190, 190, 13, 1, "");
  wall(2960, GROUND_Y - 190, 190, 13, 1, "");
  sign(2360, GROUND_Y - 78, ["watched things", "stay solid"]);
  orb(2760, GROUND_Y - 60);

  // --- act 5: both paths at once ------------------------------------------
  ground(3100, 4400);                             // floor runs past the goal
  block(3100, GROUND_Y - 300, 1200, 18);          // outer ceiling
  block(3180, GROUND_Y - 150, 1000, 16);          // the divider: two corridors
  // upper corridor has a bump you may take, which lengthens that path
  block(3560, GROUND_Y - 216, 150, 14);
  wall(3900, GROUND_Y - 134, 134, 8, 1, "");      // lower corridor, floor to divider
  wall(3900, GROUND_Y - 282, 132, 8, 1, "");      // upper corridor, divider to ceiling
  sign(3140, GROUND_Y - 78, ["you are about", "to be in two", "places at once"]);
  orb(3650, GROUND_Y - 60);
  orb(3650, GROUND_Y - 258);

  const SPLIT_X = 3200;                            // where you become two
  const MERGE_X = 4080;                            // where they come back together
  block(4290, GROUND_Y - 240, 26, 240);            // backstop, standing ON the floor
  const GOAL = { x: 4230, y: GROUND_Y - 96, w: 22, h: 96 };
  const WORLD = 4400;

  // ---------- state ----------
  let me, twin, camX, dead, won, t, msg, msgT, splitPhase, showPhys, bright;
  let found = 0;

  function newBody(x, y) {
    return { x, y, w: 22, h: 30, vx: 0, vy: 0, onGround: false, face: 1,
             path: 0, ghost: 0, collapsed: 0, blocked: 0 };
  }

  function reset() {
    me = newBody(60, GROUND_Y - 30);
    twin = null;
    camX = 0; dead = false; won = false; t = 0; bright = false;
    msg = null; msgT = 0; splitPhase = null;
    found = 0;
    orbs.forEach(o => (o.got = false));
    barriers.forEach(b => { b.roll = null; b.cool = 0; });
    $("h-found").textContent = "0";
    $("h-total").textContent = orbs.length;
    $("hud-mid").textContent = "";
  }

  function say(text, secs) { msg = text; msgT = secs || 2.6; }

  // ---------- input ----------
  const keys = { l: false, r: false };
  let jHeld = false, jBuf = false;

  addEventListener("keydown", (e) => {
    if (["ArrowLeft", "KeyA"].includes(e.code)) keys.l = true;
    if (["ArrowRight", "KeyD"].includes(e.code)) keys.r = true;
    if (["ArrowUp", "KeyW", "Space"].includes(e.code)) {
      if (!jHeld) jBuf = true;
      jHeld = true; e.preventDefault();
    }
    if (e.code === "KeyR") { reset(); hideOv(); }
    if (e.code === "KeyP") togglePhys();
    if (e.code === "Enter" && !$("ov").classList.contains("hidden")) $("ov-go").click();
  });
  addEventListener("keyup", (e) => {
    if (["ArrowLeft", "KeyA"].includes(e.code)) keys.l = false;
    if (["ArrowRight", "KeyD"].includes(e.code)) keys.r = false;
    if (["ArrowUp", "KeyW", "Space"].includes(e.code)) jHeld = false;
  });

  function hold(el, on, off) {
    const d = (e) => { e.preventDefault(); el.classList.add("on"); on(); };
    const u = (e) => { e.preventDefault(); el.classList.remove("on"); off(); };
    el.addEventListener("pointerdown", d);
    el.addEventListener("pointerup", u);
    el.addEventListener("pointercancel", u);
    el.addEventListener("pointerleave", u);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  hold($("p-left"), () => (keys.l = true), () => (keys.l = false));
  hold($("p-right"), () => (keys.r = true), () => (keys.r = false));
  hold($("p-jump"), () => { if (!jHeld) jBuf = true; jHeld = true; }, () => { jHeld = false; });

  function togglePhys() {
    showPhys = !showPhys;
    $("btn-phys").classList.toggle("on", showPhys);
  }
  $("btn-phys").addEventListener("click", togglePhys);

  // ---------- collision ----------
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // Walls are solid to you only while you are collapsed, or while the die says
  // they are. Everything else is ordinary platforming.
  function solidsFor(body) {
    const list = solids.slice();
    for (const b of barriers) {
      const open = b.roll && b.roll.body === body && b.roll.pass && b.roll.until > t;
      if (!open) list.push(b);
    }
    return list;
  }

  function move(body, dx, dy, list) {
    body.x += dx;
    for (const s of list) {
      if (!hit(body, s)) continue;
      if (s.d !== undefined) { tryWall(body, s, dx); if (!hit(body, s)) continue; }
      if (dx > 0) body.x = s.x - body.w;
      else if (dx < 0) body.x = s.x + s.w;
      body.vx = 0;
    }
    body.y += dy;
    body.onGround = false;
    for (const s of list) {
      if (!hit(body, s)) continue;
      if (dy > 0) { body.y = s.y - body.h; body.vy = 0; body.onGround = true; }
      else if (dy < 0) { body.y = s.y + s.h; body.vy = 0; }
    }
  }

  // The moment that matters: you meet a wall, and the formula decides.
  function tryWall(body, b, dx) {
    if (b.cool > t) return;
    if (body.collapsed > t) {                    // being watched: no tunnelling
      if (!body.blockedMsg || body.blockedMsg < t) {
        say("observed — solid"); body.blockedMsg = t + 1.4;
      }
      b.cool = t + 0.35;
      return;
    }
    const p = chance(b, body.vx);
    const pass = Math.random() < p;
    b.roll = { body, pass, until: t + 0.85, p, at: t };
    b.cool = t + (pass ? 0.0 : 0.55);
    if (pass) {
      body.ghost = t + 0.85;
      say("through — " + Math.round(p * 100) + "%");
    } else {
      body.vx = -Math.sign(dx || 1) * 120;
      say("bounced — " + Math.round(p * 100) + "% chance");
    }
  }

  // ---------- update ----------
  function step(dt) {
    t += dt;
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) msg = null; }
    if (dead || won) return;

    for (const e of eyes) {                      // detectors sweep on their own clock
      const ph = ((t + e.phase) % e.period) / e.period;
      e.lit = ph < 0.45;
    }

    const bodies = twin ? [me, twin] : [me];
    for (const body of bodies) {
      // a lit detector within reach collapses you
      for (const e of eyes) {
        if (!e.lit) continue;
        const cx = body.x + body.w / 2;
        if (Math.abs(cx - e.x) < e.reach && body.y + body.h > e.y - 10) body.collapsed = t + 0.18;
      }

      if (keys.l && !keys.r) { body.vx -= ACCEL * dt; body.face = -1; }
      else if (keys.r && !keys.l) { body.vx += ACCEL * dt; body.face = 1; }
      else {
        const f = FRIC * dt;
        body.vx = body.vx > 0 ? Math.max(0, body.vx - f) : Math.min(0, body.vx + f);
      }
      body.vx = Math.max(-VMAX, Math.min(VMAX, body.vx));

      if (jBuf && body.onGround) { body.vy = JUMP; body.onGround = false; }
      if (!jHeld && body.vy < CUT) body.vy = CUT;
      body.vy = Math.min(body.vy + GRAV * dt, 1300);

      const before = body.x;
      const list = solidsFor(body);
      move(body, body.vx * dt, 0, list);
      move(body, 0, body.vy * dt, list);
      body.path += Math.abs(body.x - before) + Math.abs(body.vy * dt);
      if (body.x < 0) body.x = 0;
    }
    jBuf = false;

    // orbs
    for (const o of orbs) {
      if (o.got) continue;
      for (const body of bodies) {
        if (Math.hypot(body.x + body.w / 2 - o.x, body.y + body.h / 2 - o.y) < 26) {
          o.got = true; found++; $("h-found").textContent = found;
        }
      }
    }

    // become two
    if (!twin && me.x > SPLIT_X && !splitPhase) {
      twin = newBody(me.x, GROUND_Y - 180);
      twin.vx = me.vx;
      me.path = 0; twin.path = 0;
      splitPhase = "split";
      say("you are in two places now");
    }

    // come back together
    if (twin && me.x > MERGE_X && twin.x > MERGE_X) {
      const dL = Math.abs(me.path - twin.path);
      const amp = Math.abs(Math.cos(Math.PI * dL / LAMBDA));
      splitPhase = { dL, amp };
      twin = null;
      if (amp > 0.55) {
        found += 2; $("h-found").textContent = found;
        bright = true;
        say("both halves in step — bright");
      } else {
        say("the halves cancelled — dim");
      }
    }

    // fell out of the world
    for (const body of bodies) {
      if (body.y > VH + 120) {
        dead = true;
        showOv("LOST", "<p>You fell out of the world.</p>", "again");
      }
    }

    if (me.x + me.w > GOAL.x && twin) {
      $("hud-mid").textContent = "both halves have to arrive";
      if (msgT <= 0) say("you are still in two places");
    } else if (twin && Math.abs(me.x - twin.x) > 130) {
      $("hud-mid").textContent = "your other half is behind — go back for it";
    } else if (!won) {
      $("hud-mid").textContent = "";
    }

    if (me.x + me.w > GOAL.x && !twin) {
      won = true;
      showOv("THROUGH",
        "<p class='big'>You walked through " + "walls" + " and came out the other side.</p>" +
        "<p>Every wall you passed was decided by <b>T = e<sup>-2κd</sup></b> — the real " +
        "tunnelling formula. It is why the thin ones felt easy and the thick ones nearly " +
        "impossible: the odds do not halve when a wall doubles, <b>they square</b>.</p>" +
        "<p>" + (bright
          ? "And when you were in two places at once, both halves came back <b>in step</b> and " +
            "added up. That is interference — the same reason a two-slit experiment has bright bands."
          : "When you were in two places at once your two halves came back <b>out of step</b> and " +
            "partly cancelled. Match the distance each half travels and they add up instead.") + "</p>" +
        "<p class='sub'>Found " + found + " of " + (orbs.length + 2) + ". This is not a metaphor for " +
        "quantum mechanics; it is quantum mechanics with a jump button.</p>", "play again");
    }
  }

  // ---------- drawing ----------
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, "#0a0a18"); g.addColorStop(1, "#10102a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    starfield();

    ctx.save();
    ctx.translate(-camX, 0);
    drawSolids();
    drawSigns();
    drawEyes();
    drawBarriers();
    drawOrbs();
    drawGoal();
    if (twin) drawBody(twin, true);
    drawBody(me, false);
    ctx.restore();

    drawEnergy();
    if (twin) drawPathMeter();
    drawMsg();
  }

  function starfield() {
    ctx.fillStyle = "rgba(180,190,255,0.5)";
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5 - camX * 0.15) % VW;
      const y = (i * 71.3) % (VH * 0.7);
      ctx.fillRect(x < 0 ? x + VW : x, y, 1.6, 1.6);
    }
  }

  function drawSolids() {
    for (const s of solids) {
      if (s.x + s.w < camX - 40 || s.x > camX + VW + 40) continue;
      ctx.fillStyle = s.kind === "ground" ? "#191a33" : "#1d1e3c";
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "rgba(150,160,255,0.28)";
      ctx.fillRect(s.x, s.y, s.w, 2);
    }
  }

  function drawSigns() {
    ctx.font = "12px ui-monospace, Consolas, monospace";
    ctx.textAlign = "left";
    for (const s of signs) {
      if (s.x < camX - 200 || s.x > camX + VW + 60) continue;
      ctx.fillStyle = "rgba(160,170,255,0.75)";
      s.lines.forEach((l, i) => ctx.fillText(l, s.x, s.y + i * 15));
    }
  }

  // Each wall wears its own odds. That single number is the entire tutorial.
  function drawBarriers() {
    for (const b of barriers) {
      if (b.x + b.w < camX - 60 || b.x > camX + VW + 60) continue;
      const open = b.roll && b.roll.pass && b.roll.until > t;
      const p = chance(b, me.vx);
      ctx.fillStyle = open ? "rgba(126,240,208,0.20)" : "rgba(150,140,255,0.5)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = open ? "rgba(126,240,208,0.8)" : "rgba(190,180,255,0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      const near = Math.abs(me.x - b.x) < 260;
      ctx.font = "bold 14px ui-monospace, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = near ? (p > 0.4 ? "#7ef0d0" : p > 0.18 ? "#ffd166" : "#ff7b93")
                           : "rgba(190,180,255,0.5)";
      ctx.fillText(Math.round(p * 100) + "%", b.x + b.w / 2, b.y - 8);
      if (near && showPhys) {
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "rgba(190,200,255,0.8)";
        ctx.fillText("d=" + b.d + "  T=e^(-" + ALPHA + "d√(V-E))", b.x + b.w / 2, b.y - 24);
      }
      ctx.textAlign = "left";
    }
  }

  function drawEyes() {
    for (const e of eyes) {
      if (e.x < camX - 300 || e.x > camX + VW + 300) continue;
      ctx.fillStyle = e.lit ? "rgba(255,123,147,0.13)" : "rgba(255,123,147,0.04)";
      ctx.fillRect(e.x - e.reach, e.y - 10, e.reach * 2, VH - e.y + 10);
      ctx.beginPath();
      ctx.fillStyle = e.lit ? "#ff7b93" : "#5a3a4a";
      ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.lit ? "#3a0c18" : "#241020";
      ctx.beginPath();
      ctx.arc(e.x, e.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOrbs() {
    for (const o of orbs) {
      if (o.got) continue;
      if (o.x < camX - 40 || o.x > camX + VW + 40) continue;
      const b = Math.sin(t * 3 + o.x) * 3;
      ctx.fillStyle = "rgba(126,240,208,0.25)";
      ctx.beginPath(); ctx.arc(o.x, o.y + b, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7ef0d0";
      ctx.beginPath(); ctx.arc(o.x, o.y + b, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawGoal() {
    if (GOAL.x < camX - 60 || GOAL.x > camX + VW + 60) return;
    const p = 0.5 + 0.5 * Math.sin(t * 2.5);
    ctx.fillStyle = "rgba(255,209,102," + (0.25 + p * 0.3) + ")";
    ctx.fillRect(GOAL.x - 6, GOAL.y - 10, GOAL.w + 12, GOAL.h + 10);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(GOAL.x, GOAL.y, GOAL.w, GOAL.h);
  }

  // You: a wave packet when free, a hard dot when something is looking.
  function drawBody(body, isTwin) {
    const cx = body.x + body.w / 2, cy = body.y + body.h / 2;
    const watched = body.collapsed > t;
    const ghost = body.ghost > t;
    const spread = watched ? 0 : Math.min(1, Math.abs(body.vx) / VMAX);

    if (!watched) {                               // the packet smeared along motion
      for (let i = 5; i >= 1; i--) {
        const a = (0.10 - i * 0.012) * (ghost ? 2 : 1);
        ctx.fillStyle = "rgba(150,170,255," + Math.max(0, a) + ")";
        ctx.beginPath();
        ctx.ellipse(cx - body.face * i * 5 * spread, cy, 15 + i * 2.4, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = ghost ? "rgba(126,240,208,0.55)" : watched ? "#ff7b93" : "#cdd6ff";
    ctx.beginPath();
    ctx.ellipse(cx, cy, watched ? 8 : 11, watched ? 8 : 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx + body.face * 3, cy - 2, watched ? 2.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (isTwin) {
      ctx.strokeStyle = "rgba(126,240,208,0.35)";
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(me.x + me.w / 2, me.y + me.h / 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Speed is energy, and energy is your odds. Shown as a bar, never as a word.
  function drawEnergy() {
    const f = Math.min(1, Math.abs(me.vx) / VMAX);
    const x = VW / 2 - 70, y = VH - 26;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, 140, 7);
    ctx.fillStyle = f > 0.75 ? "#7ef0d0" : "#8a90d0";
    ctx.fillRect(x, y, 140 * f, 7);
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = "rgba(190,200,255,0.6)";
    ctx.textAlign = "center";
    ctx.fillText(showPhys ? "E = " + (EMAX * f * f).toFixed(2) : "speed helps", VW / 2, y - 5);
    ctx.textAlign = "left";
  }

  function drawPathMeter() {
    const dL = Math.abs(me.path - twin.path);
    const amp = Math.abs(Math.cos(Math.PI * dL / LAMBDA));
    const x = VW / 2 - 110, y = 44;
    ctx.fillStyle = "rgba(8,8,20,0.75)";
    ctx.fillRect(x, y, 220, 32);
    ctx.strokeStyle = amp > 0.55 ? "rgba(126,240,208,0.7)" : "rgba(255,123,147,0.7)";
    ctx.strokeRect(x, y, 220, 32);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(200,208,255,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(showPhys ? "path difference " + Math.round(dL) + " px  (λ=" + LAMBDA + ")"
                          : "the two halves are " + Math.round(dL) + " apart", x + 110, y + 13);
    ctx.fillStyle = amp > 0.55 ? "#7ef0d0" : "#ff7b93";
    ctx.fillRect(x + 8, y + 19, (220 - 16) * amp, 6);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(x + 8 + (220 - 16) * 0.55, y + 17);
    ctx.lineTo(x + 8 + (220 - 16) * 0.55, y + 27);
    ctx.stroke();
    ctx.textAlign = "left";
  }

  function drawMsg() {
    if (!msg) return;
    ctx.globalAlpha = Math.min(1, msgT * 2);
    ctx.font = "bold 15px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    const w = ctx.measureText(msg).width + 28;
    ctx.fillStyle = "rgba(8,8,20,0.8)";
    ctx.fillRect(VW / 2 - w / 2, VH - 78, w, 27);
    ctx.fillStyle = "#e8ebff";
    ctx.fillText(msg, VW / 2, VH - 59);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // ---------- overlay ----------
  function showOv(title, body, btn) {
    const c = $("ov");
    c.querySelector("h1").textContent = title;
    c.querySelector(".tag").textContent = won ? "" : "";
    $("ov-body").innerHTML = body;
    $("ov-go").textContent = btn;
    c.classList.remove("hidden");
  }
  function hideOv() { $("ov").classList.add("hidden"); }
  $("ov-go").addEventListener("click", () => { reset(); hideOv(); });

  // ---------- go ----------
  reset();
  $("ov-body").innerHTML =
    "<p class='big'>Run. Jump. Reach the light at the end.</p>" +
    "<p>The only catch: <b>you are not solid</b>. Walls have a number on them — that is " +
    "your chance of going straight through. Thin walls are easy. Thick walls are not.</p>" +
    "<p class='sub'>Run faster and the odds get better. Nothing here is invented: it is the " +
    "real tunnelling formula, the thing that makes the sun burn and your USB stick remember.</p>";
  $("ov-go").textContent = "play";

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if ($("ov").classList.contains("hidden")) step(dt);
    camX = Math.max(0, Math.min(me.x - VW / 2, WORLD - VW));
    draw();
    requestAnimationFrame(loop);
  })(last);

  // hooks, so the design can be checked from a script
  window.Through = {
    state: () => ({ x: me.x, y: me.y, vx: me.vx, found, dead, won, t,
                    twin: twin ? { x: twin.x, path: twin.path } : null,
                    path: me.path, collapsed: me.collapsed > t }),
    chanceOf: (i) => chance(barriers[i], VMAX),
    barriers: () => barriers.map(b => ({ x: b.x, d: b.d, V: b.V })),
    reset, setX: (x) => { me.x = x; }, say,
  };
})();
