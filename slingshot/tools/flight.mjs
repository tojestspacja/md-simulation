// SLINGSHOT — one headless flight, shared by everything that is not the game.
//
// The regression harness and the difficulty tools both need to answer "what
// happens if you launch at this angle and power", and they must answer it the
// same way or their numbers cannot be compared. So it lives here once, imports
// the canonical engine, and is the only headless copy of the flight rules.
//
// It mirrors game.js stepWorld(): crash, then the flag, then the ring, then out
// of bounds, then out of time, in that order. Stepping is a fixed DT; the game
// steps min(frameDt, DT) repeatedly, so at any frame rate that is a multiple of
// DT — 60 fps is exactly four steps — this is the same sequence of integrations
// in the same order.

import { DT, bodyAt, integrate } from "../src/physics.js";

// The canvas the game is laid out against. boxOf() uses the aspect ratio and
// the out-of-bounds rule is measured against the box, so it belongs here.
export const CW = 960, CH = 540;

export function levelPoints(lv) {
  const pts = [[lv.start[0], lv.start[1]]];
  if (lv.flag) pts.push(lv.flag);
  for (const b of lv.bodies) {
    if (b.kind === "planet") pts.push([b.x - b.r, b.y - b.r], [b.x + b.r, b.y + b.r]);
    else pts.push([b.cx - b.R, b.cy - b.R], [b.cx + b.R, b.cy + b.R]);
  }
  return pts;
}

export function boxOf(pts) {
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

/** How far short an attempt fell. The only feedback a search gets. */
export const missOf = (lv, r) => r.won ? 0 : (lv.ring ? lv.ring - r.maxR : r.closest);
