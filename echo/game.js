// AGREEMENT — a puzzle game whose rules are the mechanisms of NMR.
//
// There is no spectrometer in here. What there is:
//
//   * a crowd of things that each run at their own fixed rate, so they drift
//     apart on their own — and only their SUM scores, so drifting apart costs
//     you everything even though nothing has been lost;
//   * REVERSE, which mirrors the fan: whoever ran furthest ahead is now
//     furthest behind, so after the same time again they all meet;
//   * a reserve you spend at an angle — sin(theta) comes out as signal,
//     cos(theta) stays banked — refilling on a slower clock than the signal drains;
//   * scatter that REVERSE cannot undo.
//
// Those are, in order: coherence as a vector sum, the Hahn echo, the Mz/Mxy
// budget with T1 recovery, and true T2. The optimal play for the reserve rule
// is the Ernst angle, and a player who finds it has derived it.
(() => {
  "use strict";

  const cv = document.getElementById("view");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const $ = (id) => document.getElementById(id);

  const RATE = 0.03;          // seconds of crowd-time per second of yours

  // ---------- the crowd ----------
  // Each member runs at its own fixed rate, spread around zero.
  function seedCrowd(spreadHz) {
    const n = Bloch.cfg.nPack;
    const off = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const t = Math.sqrt(-2 * Math.log(Math.min(u, 1 - u) + 1e-6));
      const z = (u < 0.5 ? -1 : 1) *
        (t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t));
      off.push(z * 0.62 * spreadHz);
    }
    Bloch.setOffsets(off);
  }

  // ---------- rounds ----------
  // Each one isolates a single rule, so the lesson cannot be confused with
  // another. Times are in milliseconds of crowd-time.
  const ROUNDS = [
    {
      title: "THEY ONLY COUNT TOGETHER",
      rule: "Your score is the length of the <b>sum</b>, not how much you have. " +
            "A crowd pointing every which way scores nothing at all.",
      body: "TIP spends your reserve and starts the crowd off pointing the same way. " +
            "They immediately begin to drift apart, because each one runs at its own rate. " +
            "Collect while they still agree.",
      why: "This is coherence. A detector adds the contributions as vectors, so a spread-out " +
           "ensemble is invisible even though every member is still there.",
      spread: 7, T1: 3.0, T2: 0.5, dur: 130, goal: 0.45,
      windows: [{ at: 35, dur: 14 }],
      verbs: { tip: true, rev: false },
    },
    {
      title: "OUT OF REACH",
      rule: "The reserve refills <b>slowly</b>. Here it barely refills at all, so you get " +
            "one TIP and it has to count.",
      body: "Take the gate, then keep watching. The trace shows the sum collapsing while every " +
            "member of the crowd is still exactly where it was — none of them lost anything. They " +
            "simply stopped agreeing.",
      why: "The spreading is T2*, the loss of agreement from everyone running at a slightly " +
           "different rate. Nothing has decayed yet; it has only disagreed.",
      spread: 10, T1: 40.0, T2: 0.8, dur: 190, goal: 0.35,
      windows: [{ at: 30, dur: 12 }],
      verbs: { tip: true, rev: false },
    },
    {
      title: "REVERSE",
      rule: "<b>REVERSE mirrors the fan.</b> Whoever ran furthest ahead is now furthest behind — " +
            "and since everyone keeps their own rate, after the same time again they all meet.",
      body: "One TIP, one far gate. Reverse at the halfway point and the crowd comes back " +
            "together exactly when the gate opens.",
      why: "That is a Hahn echo. The 180 degree pulse does not undo the spreading; it swaps who " +
           "is ahead, and lets the spreading itself run the fan back together at 2 tau.",
      spread: 10, T1: 40.0, T2: 0.9, dur: 220, goal: 0.5,
      windows: [{ at: 150, dur: 16 }],
      verbs: { tip: true, rev: true },
    },
    {
      title: "AGAIN AND AGAIN",
      rule: "You may REVERSE as often as you like. Each one starts the fan winding back again.",
      body: "Three gates. One tip is all you get, so keep the crowd meeting the gates by " +
            "reversing between them.",
      why: "A train of inversions is CPMG. It is how a real measurement keeps signal alive " +
           "long past the point where the ensemble would otherwise have stopped agreeing.",
      spread: 12, T1: 40.0, T2: 1.4, dur: 330, goal: 1.35,
      windows: [{ at: 90, dur: 14 }, { at: 180, dur: 14 }, { at: 270, dur: 14 }],
      verbs: { tip: true, rev: true },
    },
    {
      title: "WHAT REVERSE CANNOT FIX",
      rule: "Some of the crowd is <b>scattered</b>, not merely spread. REVERSE brings back the " +
            "spreading. It never brings back the scatter.",
      body: "Same shape of problem, but the scatter is fierce. The later gates simply cannot pay " +
            "as well as the early ones, however perfectly you reverse. Take what you can, early.",
      why: "Spreading is T2* and is reversible; scatter is true T2 and is not. An echo recovers " +
           "the first and never the second, which is exactly why T2 is the honest number.",
      spread: 12, T1: 40.0, T2: 0.22, dur: 330, goal: 1.25,
      windows: [{ at: 60, dur: 14 }, { at: 150, dur: 14 }, { at: 250, dur: 14 }],
      verbs: { tip: true, rev: true },
    },
    {
      title: "DON'T GO ALL IN",
      rule: "A TIP at angle θ pays out <b>sin θ</b> and keeps <b>cos θ</b> in reserve. " +
            "The reserve refills on its own slow clock.",
      body: "Nine gates, close together, and almost no spreading to fight. Going all in at 90° " +
            "empties the reserve and every gate after the first pays badly. There is an angle that " +
            "beats it. Find it.",
      why: "That is the Ernst angle: cos θ = exp(−TR/T1), which for these numbers (TR 40 ms, " +
           "T1 200 ms) is 35°. Measured in this game the best play is nearer 45°, and the gap is " +
           "real rather than sloppy — the Ernst angle is a steady-state result, and nine gates " +
           "starting from a full reserve never quite reach steady state, which pays for a bolder " +
           "angle early. Either way 90° loses badly, and that is the trade every fast experiment makes.",
      spread: 1.5, T1: 0.2, T2: 0.5, dur: 400, goal: 2.8,
      windows: [40, 80, 120, 160, 200, 240, 280, 320, 360].map(at => ({ at, dur: 10 })),
      verbs: { tip: true, rev: true },
    },
  ];

  // ---------- state ----------
  let ri = 0, round = null;
  let t = 0;                   // crowd-time, seconds
  let phase = "intro";         // intro | brief | playing | over
  let score = 0;
  let history = [];            // {t, mxy}
  let marks = [];              // {t, kind}
  let windows = [];
  let tipAngle = 90;

  function startRound(i) {
    ri = i;
    round = ROUNDS[i];
    Bloch.cfg.T1 = round.T1;
    Bloch.cfg.T2 = round.T2;
    Bloch.reset();
    seedCrowd(round.spread);
    t = 0; score = 0; history = []; marks = [];
    windows = round.windows.map(w => ({ at: w.at / 1000, dur: w.dur / 1000, sum: 0, n: 0, got: 0 }));
    $("b-rev").disabled = !round.verbs.rev;
    $("round").textContent = (i + 1) + " / " + ROUNDS.length + " · " + round.title.toLowerCase();
    $("goal").textContent = "collect " + round.goal.toFixed(2);
    syncScore();
  }

  const syncScore = () => { $("score").textContent = score.toFixed(2); };

  // ---------- the two verbs ----------
  function tip() {
    if (phase !== "playing") return;
    Bloch.dephase(0);                    // whatever is left of the old signal is spoiled
    Bloch.pulse(tipAngle, 1);
    marks.push({ t, kind: "tip", a: tipAngle });
  }
  function reverse() {
    if (phase !== "playing" || !round.verbs.rev) return;
    Bloch.pulse(180, 1);
    marks.push({ t, kind: "rev" });
  }

  $("b-tip").addEventListener("click", tip);
  $("b-rev").addEventListener("click", reverse);
  $("ang").addEventListener("input", (e) => {
    tipAngle = +e.target.value;
    $("ang-lab").textContent = tipAngle + "°";
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyZ") { tip(); e.preventDefault(); }
    if (e.code === "KeyX") { reverse(); e.preventDefault(); }
    if (e.code === "Enter" && phase !== "playing") $("ov-btn").click();
  });

  // ---------- clock ----------
  function step(dtReal) {
    if (phase !== "playing") return;
    let left = dtReal * RATE;
    let guard = 0;
    while (left > 1e-9 && guard++ < 600) {
      const h = Math.min(left, 0.0005);
      Bloch.evolve(h);
      t += h;
      left -= h;
      const m = Bloch.netMxy();
      for (const w of windows) {
        if (t >= w.at && t <= w.at + w.dur) { w.sum += m * h; w.n += h; }
      }
    }
    history.push({ t, m: Bloch.netMxy(), z: Bloch.netMz() });
    if (history.length > 3000) history.shift();
    score = windows.reduce((s, w) => s + (w.n > 0 ? w.sum / w.n : 0), 0);
    for (const w of windows) w.got = w.n > 0 ? w.sum / w.n : 0;
    syncScore();
    if (t >= round.dur / 1000) finish();
  }

  function finish() {
    phase = "over";
    const won = score >= round.goal;
    const last = ri + 1 >= ROUNDS.length;
    let body = "<p>You collected <b>" + score.toFixed(2) + "</b> against a goal of " +
      round.goal.toFixed(2) + ".</p>";
    body += "<div class='rule'>" + windows.map((w, i) =>
      "gate " + (i + 1) + " at " + Math.round(w.at * 1000) + " ms &nbsp;→&nbsp; " +
      w.got.toFixed(2)).join("<br />") + "</div>";
    body += "<div class='why'><b>What that was:</b> " + round.why + "</div>";
    if (won && last) {
      showOverlay("ALL SIX", body + "<p class='note'>That is the whole set. Every rule you just " +
        "used is a mechanism a spectrometer runs on.</p>", "play again");
    } else if (won) {
      showOverlay("THROUGH", body, "next round");
    } else {
      showOverlay("NOT ENOUGH", body, "try again");
    }
  }

  // ---------- overlay ----------
  const ov = $("overlay");
  function showOverlay(title, html, btn) {
    $("ov-title").textContent = title;
    $("ov-body").innerHTML = html;
    $("ov-btn").textContent = btn;
    ov.classList.remove("hidden");
  }
  function brief() {
    phase = "brief";
    showOverlay(round.title,
      "<div class='rule'>" + round.rule + "</div><p>" + round.body + "</p>" +
      "<p class='note'>Z tips · X reverses · the round runs " + round.dur + " ms of crowd-time.</p>",
      "go");
  }
  $("ov-btn").addEventListener("click", () => {
    if (phase === "intro") { startRound(0); brief(); return; }
    if (phase === "brief") { ov.classList.add("hidden"); phase = "playing"; return; }
    if (phase === "over") {
      const won = score >= round.goal;
      if (won && ri + 1 < ROUNDS.length) startRound(ri + 1);
      else if (won) startRound(0);
      else startRound(ri);
      brief();
    }
  });

  // ---------- drawing ----------
  function draw() {
    ctx.fillStyle = "#08070f";
    ctx.fillRect(0, 0, W, H);
    drawCrowd(200, 166, 116);
    drawTrace(398, 22, 540, 236);
    drawBars(398, 270, 540, 44);
    drawTimeline(24, 344, W - 48, 104);
  }

  // The crowd on its circle, and the one thing that scores: their sum.
  function drawCrowd(cx, cy, R) {
    ctx.strokeStyle = "#1c1a2c";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();

    const packs = Bloch.packets();
    const per = Bloch.cfg.M0 / packs.length;
    for (let i = 0; i < packs.length; i += 4) {
      const p = packs[i];
      const mag = Math.hypot(p.mx, p.my) / per;
      if (mag < 0.02) continue;
      const a = Math.atan2(p.my, p.mx);
      ctx.strokeStyle = "rgba(94,224,208,0.55)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * mag, cy + Math.sin(a) * R * mag);
      ctx.stroke();
    }
    const v = Bloch.netMxyComplex();
    const net = Math.hypot(v[0], v[1]);
    if (net > 0.004) {
      const a = Math.atan2(v[1], v[0]);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * net, cy + Math.sin(a) * R * net);
      ctx.stroke();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * R * net, cy + Math.sin(a) * R * net, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#8d87ab";
    ctx.textAlign = "center";
    ctx.fillText("the crowd — each one runs at its own rate", cx, cy + R + 26);
    ctx.fillStyle = "#ffd166";
    ctx.fillText("the gold arrow is their sum, and the sum is your score", cx, cy + R + 40);
    ctx.textAlign = "left";
  }

  // The sum over time, with the gates drawn where they open.
  function drawTrace(x, y, w, h) {
    ctx.strokeStyle = "#262439";
    ctx.strokeRect(x, y, w, h);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#8d87ab";
    ctx.fillText("THE SUM, OVER TIME", x + 9, y + 15);

    const T = round.dur / 1000;
    const xOf = (tt) => x + 8 + (tt / T) * (w - 16);
    const base = y + h - 12, top = y + 24;

    for (const win of windows) {           // gates
      const x0 = xOf(win.at), x1 = xOf(win.at + win.dur);
      ctx.fillStyle = t > win.at + win.dur
        ? (win.got > 0.25 ? "rgba(94,224,208,0.16)" : "rgba(255,123,147,0.14)")
        : "rgba(255,209,102,0.16)";
      ctx.fillRect(x0, top, Math.max(2, x1 - x0), base - top);
      if (t > win.at + win.dur) {
        ctx.fillStyle = win.got > 0.25 ? "#5ee0d0" : "#ff7b93";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(win.got.toFixed(2), (x0 + x1) / 2, top - 3);
        ctx.textAlign = "left";
      }
    }
    ctx.strokeStyle = "#1c1a2c";
    ctx.beginPath(); ctx.moveTo(x + 8, base); ctx.lineTo(x + w - 8, base); ctx.stroke();

    if (history.length > 1) {
      ctx.strokeStyle = "#5ee0d0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const px = xOf(history[i].t);
        const py = base - Math.min(1, history[i].m) * (base - top);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    for (const m of marks) {               // what you did, and when
      const px = xOf(m.t);
      ctx.strokeStyle = m.kind === "tip" ? "#ffd166" : "#a78bfa";
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, base); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.kind === "tip" ? "#ffd166" : "#a78bfa";
      ctx.font = "8px ui-monospace, monospace";
      ctx.fillText(m.kind === "tip" ? m.a + "°" : "REV", px + 2, top + 9);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)";   // now
    ctx.beginPath(); ctx.moveTo(xOf(t), top); ctx.lineTo(xOf(t), base); ctx.stroke();
  }

  function drawBars(x, y, w, h) {
    const mz = Bloch.netMz(), mxy = Bloch.netMxy();
    const row = (yy, lab, v, col, signed) => {
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "#8d87ab";
      ctx.fillText(lab, x, yy + 9);
      const bx = x + 74, bw = w - 120;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(bx, yy, bw, 11);
      ctx.fillStyle = col;
      if (signed && v < 0) ctx.fillRect(bx + bw / 2 + v * bw / 2, yy, -v * bw / 2, 11);
      else if (signed) ctx.fillRect(bx + bw / 2, yy, v * bw / 2, 11);
      else ctx.fillRect(bx, yy, Math.max(0, v) * bw, 11);
      ctx.fillStyle = col;
      ctx.fillText(v.toFixed(2), bx + bw + 8, yy + 9);
    };
    row(y, "reserve", mz, "#a78bfa", true);
    row(y + 20, "the sum", mxy, "#5ee0d0", false);
  }

  // The round laid out end to end, so the gates ahead are visible.
  function drawTimeline(x, y, w, h) {
    const T = round.dur / 1000;
    const xOf = (tt) => x + 10 + (tt / T) * (w - 20);
    ctx.strokeStyle = "#262439";
    ctx.strokeRect(x, y, w, h);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#8d87ab";
    ctx.fillText("THE ROUND", x + 10, y + 16);

    const mid = y + h / 2 + 8;
    ctx.strokeStyle = "#2e2b45";
    ctx.beginPath(); ctx.moveTo(x + 10, mid); ctx.lineTo(x + w - 10, mid); ctx.stroke();
    ctx.fillStyle = "#57517a";
    ctx.font = "9px ui-monospace, monospace";
    for (let ms = 0; ms <= round.dur; ms += round.dur > 250 ? 100 : 50) {
      const px = xOf(ms / 1000);
      ctx.beginPath(); ctx.moveTo(px, mid - 4); ctx.lineTo(px, mid + 4); ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(ms, px, mid + 16);
    }
    ctx.textAlign = "left";

    for (const win of windows) {
      const x0 = xOf(win.at), x1 = xOf(win.at + win.dur);
      const open = t >= win.at && t <= win.at + win.dur;
      const done = t > win.at + win.dur;
      ctx.fillStyle = open ? "#ffd166" : done ? (win.got > 0.25 ? "#2e6b63" : "#5c2b38") : "#4a4270";
      ctx.fillRect(x0, mid - 16, Math.max(3, x1 - x0), 24);
      if (open) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "bold 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("OPEN", (x0 + x1) / 2, mid - 21);
        ctx.textAlign = "left";
      }
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xOf(t), mid - 20); ctx.lineTo(xOf(t), mid + 12); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // ---------- go ----------
  startRound(0);
  phase = "intro";
  showOverlay("AGREEMENT",
    "<p>A crowd of things, each running at its own fixed rate. They start out pointing the same " +
    "way and then they drift apart, because they always do.</p>" +
    "<div class='rule'>Your score is the length of their <b>sum</b>. Not how many there are, " +
    "not how much each has — only whether they still agree.</div>" +
    "<p>You have two moves and a dial. Six rounds, each one adding a single rule.</p>" +
    "<p class='note'>Every rule in this game is a mechanism a nuclear spin actually runs on. " +
    "Nothing is decoration, and the best play in the last round is a real published result.</p>",
    "begin");

  let last = performance.now();
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  })(last);

  // read-only hooks for checking the design from a script
  window.Agreement = {
    state: () => ({ round: ri, t, score, goal: round.goal, phase,
                    mxy: Bloch.netMxy(), mz: Bloch.netMz(),
                    windows: windows.map(w => ({ at: w.at, got: w.got })) }),
    tip, reverse, setAngle: (a) => { tipAngle = a; },
    start: (i) => { startRound(i); ov.classList.add("hidden"); phase = "playing"; },
    step: (dtReal) => step(dtReal),
    rounds: ROUNDS.length,
  };
})();
