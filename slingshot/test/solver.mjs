// SLINGSHOT — headless harness.
//
//   node test/solver.mjs            verify against test/golden.json
//   node test/solver.mjs --update   re-record golden.json (only when a change is intended)
//
// Why this exists. The README quotes results from a harness that was never
// committed: bot shot counts, "r = 1006", "L conserved to 2e-12 %". Those
// numbers could not be re-earned, only repeated. This puts the harness back
// under version control, and it imports src/physics.js and src/levels.js
// rather than carrying its own copy — so it fails when the engine moves, which
// is the entire point of having it before game.js gets split up.
//
// What it pins:
//   1. trajectory fingerprints  — exact end state for fixed (angle, power) shots
//   2. angular momentum         — L = r x v, the symplectic claim, measured
//   3. level 7 without the moon — the analytic reach, recomputed
//   4. the level 3 funnel       — that missing tells you which way to go
//   5. a blind hill-climbing bot finishes all seven
//
// The bot's shot counts are this bot's, not the lost one's. They are recorded
// as a baseline to notice change, not as a reproduction of the README.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { DT, bodyAt, accel, integrate } from "../src/physics.js";
import { LEVELS } from "../src/levels.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, "golden.json");
const UPDATE = process.argv.includes("--update");

// The canvas the game is laid out against. boxOf() uses the aspect ratio, and
// the out-of-bounds rule is measured against the box, so it belongs here.
const CW = 960, CH = 540;

// ---------- camera box, copied from game.js boxOf()/levelPoints() ----------
function levelPoints(lv) {
  const pts = [[lv.start[0], lv.start[1]]];
  if (lv.flag) pts.push(lv.flag);
  for (const b of lv.bodies) {
    if (b.kind === "planet") pts.push([b.x - b.r, b.y - b.r], [b.x + b.r, b.y + b.r]);
    else pts.push([b.cx - b.R, b.cy - b.R], [b.cx + b.R, b.cy + b.R]);
  }
  return pts;
}
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

// ---------- one attempt ----------
// Steps at a fixed DT. The game steps min(frameDt, DT) repeatedly, so at any
// frame rate that is a multiple of DT — 60 fps is exactly four steps — this is
// the same sequence of integrations in the same order.
export function fly(lv, angle, power) {
  const base = boxOf(levelPoints(lv));
  const s = { x: lv.start[0], y: lv.start[1],
              vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  let t = 0, closest = Infinity, maxR = 0, steps = 0;
  const limit = Math.ceil(lv.maxT / DT) + 8;

  while (steps++ < limit) {
    integrate(s, lv.bodies, t, DT);
    t += DT;

    for (const b of lv.bodies) {
      const [bx, by] = bodyAt(b, t);
      if (Math.hypot(bx - s.x, by - s.y) < b.r)
        return done(b.kind === "moon" ? "into the moon" : "into the planet");
    }
    if (lv.flag) {
      const d = Math.hypot(lv.flag[0] - s.x, lv.flag[1] - s.y);
      if (d < closest) closest = d;
      if (d < lv.flagR) return done("arrived");
    }
    if (lv.ring) {
      const d = Math.hypot(lv.ringAt[0] - s.x, lv.ringAt[1] - s.y);
      if (d > maxR) maxR = d;
      if (d > lv.ring) return done("out");
    }
    const far = Math.hypot(s.x - base.cx, s.y - base.cy);
    if (far > base.w * (lv.zoomOut || 1.5) * 0.85)
      return done(lv.ring ? "fell back" : "sailed past");
    if (t > lv.maxT) return done(lv.ring ? "fell back" : "out of time");
  }
  return done("ran long");

  function done(outcome) {
    return { outcome, t, x: s.x, y: s.y, vx: s.vx, vy: s.vy, closest, maxR,
             won: outcome === "arrived" || outcome === "out" };
  }
}

// How far short the attempt fell. This is the only feedback the bot gets.
const missOf = (lv, r) => r.won ? 0 : (lv.ring ? lv.ring - r.maxR : r.closest);

// ---------- 1. trajectory fingerprints ----------
// Fixed shots, chosen to spread across outcomes rather than to succeed.
const PROBES = [
  [0.0, 1.0], [-0.35, 0.9], [0.35, 0.9], [-0.12, 0.6], [0.2, 0.45],
];
function fingerprints() {
  const out = {};
  LEVELS.forEach((lv, i) => {
    out[`L${i + 1}`] = PROBES.map(([a, pf]) => {
      const r = fly(lv, a, lv.maxP * pf);
      return [r.outcome, round(r.t, 6), round(r.x, 6), round(r.y, 6),
              round(r.vx, 6), round(r.vy, 6)];
    });
  });
  return out;
}

// ---------- 2. angular momentum ----------
// Level 4 is the clean circular case: one planet, probe in orbit. L = r x v
// about the planet should not move, and the README claims 2e-12 %.
function angularMomentumDrift() {
  const lv = LEVELS[3];
  const p = lv.bodies[0];
  const s = { x: lv.start[0], y: lv.start[1], vx: 0, vy: 0 };
  // Put it on a circular orbit: v = sqrt(M/r), perpendicular to the radius.
  const dx = s.x - p.x, dy = s.y - p.y;
  const r = Math.hypot(dx, dy), v = Math.sqrt(p.M / r);
  s.vx = -dy / r * v; s.vy = dx / r * v;

  const L = (st) => (st.x - p.x) * st.vy - (st.y - p.y) * st.vx;
  const L0 = L(s);
  let worst = 0, t = 0;
  const laps = 20, period = 2 * Math.PI * r / v;
  while (t < laps * period) {
    integrate(s, lv.bodies, t, DT);
    t += DT;
    worst = Math.max(worst, Math.abs((L(s) - L0) / L0));
  }
  return { percent: worst * 100, laps };
}

// ---------- 3. level 7 without the moon ----------
// Brute force over every angle and power the launcher allows: the furthest any
// launch can possibly reach when the moon is deleted.
function reachWithoutMoon() {
  const lv = LEVELS[6];
  const only = lv.bodies.filter((b) => b.kind !== "moon");
  let best = 0;
  for (let ai = 0; ai < 360; ai++) {
    const a = ai * Math.PI / 180;
    for (let pf = 1.0; pf > 0.3; pf -= 0.05) {
      const s = { x: lv.start[0], y: lv.start[1],
                  vx: Math.cos(a) * lv.maxP * pf, vy: Math.sin(a) * lv.maxP * pf };
      let t = 0, far = 0, hit = false;
      while (t < lv.maxT * 3) {
        integrate(s, only, t, DT * 2);
        t += DT * 2;
        far = Math.max(far, Math.hypot(s.x - lv.ringAt[0], s.y - lv.ringAt[1]));
        if (only.some((b) => Math.hypot(b.x - s.x, b.y - s.y) < b.r)) { hit = true; break; }
      }
      if (!hit || far > best) best = Math.max(best, far);
    }
  }
  return { reach: Math.round(best), ring: lv.ring };
}

// ---------- 4. the level 3 funnel ----------
// Sweep aim at fixed power. Every step toward the answer must shrink the miss,
// or "missing tells you where to go" is not true and the level is unlearnable.
function funnel() {
  const lv = LEVELS[2];
  const rows = [];
  for (let deg = -40; deg <= 40; deg += 4) {
    const r = fly(lv, deg * Math.PI / 180, lv.maxP);
    rows.push([deg, r.won ? "HIT" : Math.round(missOf(lv, r))]);
  }
  return rows;
}

// ---------- 5. the blind bot ----------
// It knows nothing but whether this shot missed by less than the best so far.
// No gradient, no memory of the level, no knowledge of the answer.
function bot(lv, cap = 4000) {
  let shots = 0;
  const tryShot = (a, p) => {
    shots++;
    return missOf(lv, fly(lv, a, Math.max(10, Math.min(lv.maxP, p))));
  };

  let bestA = 0, bestP = lv.maxP, bestM = tryShot(bestA, bestP);
  // A coarse deterministic sweep first: this is a player looking around.
  for (let deg = -180; deg < 180; deg += 10) {
    for (let pf = 1.0; pf >= 0.4; pf -= 0.2) {
      if (shots >= cap) return { shots, solved: bestM === 0 };
      const a = deg * Math.PI / 180, p = lv.maxP * pf;
      const m = tryShot(a, p);
      if (m < bestM) { bestM = m; bestA = a; bestP = p; }
      if (bestM === 0) return { shots, solved: true };
    }
  }
  // Then refine, only ever accepting a smaller miss.
  let dA = 8 * Math.PI / 180, dP = lv.maxP * 0.15;
  while (shots < cap && bestM > 0 && (dA > 1e-5 || dP > 0.05)) {
    let improved = false;
    for (const [ca, cp] of [[bestA + dA, bestP], [bestA - dA, bestP],
                            [bestA, bestP + dP], [bestA, bestP - dP],
                            [bestA + dA, bestP + dP], [bestA - dA, bestP - dP],
                            [bestA + dA, bestP - dP], [bestA - dA, bestP + dP]]) {
      if (shots >= cap) break;
      const m = tryShot(ca, cp);
      if (m < bestM) { bestM = m; bestA = ca; bestP = cp; improved = true; }
      if (bestM === 0) return { shots, solved: true };
    }
    if (!improved) { dA *= 0.5; dP *= 0.5; }
  }
  return { shots, solved: bestM === 0 };
}

// ---------- run ----------
const round = (v, n) => Number(v.toFixed(n));

const report = {
  fingerprints: fingerprints(),
  angularMomentum: (() => { const a = angularMomentumDrift();
    return { laps: a.laps, percent: Number(a.percent.toPrecision(3)) }; })(),
  withoutMoon: reachWithoutMoon(),
  funnel: funnel(),
  bot: LEVELS.map((lv, i) => { const b = bot(lv); return [i + 1, lv.name, b.shots, b.solved]; }),
};

if (UPDATE) {
  writeFileSync(GOLDEN, JSON.stringify(report, null, 2) + "\n");
  console.log("golden.json rewritten.");
  print(report);
  process.exit(0);
}

let golden;
try {
  golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
} catch {
  console.error("No test/golden.json. Run: node test/solver.mjs --update");
  process.exit(2);
}

print(report);

const fails = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!same(report.fingerprints, golden.fingerprints)) fails.push("trajectory fingerprints moved");
if (!same(report.withoutMoon, golden.withoutMoon)) fails.push("level 7 reach without the moon moved");
if (!same(report.funnel, golden.funnel)) fails.push("the level 3 funnel moved");
if (report.angularMomentum.percent > 1e-9) fails.push("angular momentum drift above 1e-9 %");
if (report.bot.some(([, , , solved]) => !solved)) fails.push("the bot failed to finish a level");
if (!same(report.bot, golden.bot)) fails.push("bot shot counts moved");

if (fails.length) {
  console.error("\nFAIL\n  " + fails.join("\n  "));
  console.error("\nIf the change was intended: node test/solver.mjs --update");
  process.exit(1);
}
console.log("\nPASS — engine unchanged.");

function print(r) {
  console.log("angular momentum   %s laps, worst drift %s %%", r.angularMomentum.laps, r.angularMomentum.percent);
  console.log("level 7 alone      reach r = %d, boundary ring at %d -> %s",
    r.withoutMoon.reach, r.withoutMoon.ring,
    r.withoutMoon.reach < r.withoutMoon.ring ? "unreachable, as designed" : "REACHABLE");
  console.log("\nlevel 3 funnel (miss in px at fixed power)");
  for (const [deg, m] of r.funnel) {
    const bar = m === "HIT" ? "HIT" : "#".repeat(Math.min(40, Math.round(m / 12)));
    console.log("  %s%d deg  %s", deg < 0 ? "" : " ", deg, bar);
  }
  console.log("\nblind bot");
  for (const [n, name, shots, solved] of r.bot) {
    console.log("  " + n + " " + name.padEnd(16) + String(shots).padStart(4) +
      " shots  " + (solved ? "solved" : "FAILED"));
  }
}
