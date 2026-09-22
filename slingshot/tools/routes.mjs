// SLINGSHOT — how many genuinely different ways there are through a level.
//
// Connected components over the launch grid answer a different question than
// the one that matters. two-planets resolves into 37 of them, 34 of which are
// shards of a chaotic boundary; aim-away resolves into two that are exact
// mirror images of each other — the same idea used twice, not two ideas. And
// the component count is not even stable: the same level gave 4 regions at 30
// power samples and 2 at 120.
//
// So group the winning launches into contiguous bands of launch angle, then
// describe what each band actually does — how long the flight takes, how close
// it comes to the mass, whether it changes sides. Two bands are two strategies
// only if the journeys differ, not merely the launch directions.

import { DT, integrate } from "../src/physics.js";
import { fly } from "./flight.mjs";

export const ROUTE_CONFIG = {
  angleSamples: 720,
  powerSamples: 120,
  powerFloor: 12,
  bandGapDeg: 2,          // a gap wider than this starts a new band
  minShareOfWins: 0.03,   // a band below this is not somewhere you aim
};

/** Fly one shot and describe the journey rather than the outcome. */
export function describe(lv, angle, power) {
  const P = lv.bodies[0];
  const s = { x: lv.start[0], y: lv.start[1],
              vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  let t = 0, minR = Infinity, maxR = 0, side = null, crossed = false, apexY = s.y;
  const path = [[s.x, s.y]];
  while (t < lv.maxT) {
    integrate(s, lv.bodies, t, DT);
    t += DT;
    if (path.length < 4000 && (t * 240) % 4 < 1) path.push([Math.round(s.x), Math.round(s.y)]);
    const r = P ? Math.hypot(s.x - P.x, s.y - P.y) : Infinity;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    apexY = Math.min(apexY, s.y);
    if (P) {
      const sd = s.y < P.y ? "above" : "below";
      if (side && sd !== side) crossed = true;
      side = sd;
    }
    if (lv.flag && Math.hypot(lv.flag[0] - s.x, lv.flag[1] - s.y) < lv.flagR) break;
    if (P && r < P.r) break;
  }
  return {
    flightSeconds: Number(t.toFixed(2)),
    closestApproach: Math.round(minR),
    furthest: Math.round(maxR),
    apexY: Math.round(apexY),
    endsOn: side,
    crossesSides: crossed,
    path,
  };
}

/** Every winning (angle, power) on a dense grid, grouped into angle bands. */
export function routeFamilies(lv, cfg = ROUTE_CONFIG) {
  const { angleSamples: NA, powerSamples: NP, powerFloor } = cfg;
  const wins = [];
  for (let ai = 0; ai < NA; ai++) {
    const a = (ai / NA) * Math.PI * 2;
    for (let pi = 0; pi < NP; pi++) {
      const p = powerFloor + ((lv.maxP - powerFloor) * pi) / (NP - 1);
      if (fly(lv, a, p).won) wins.push({ deg: (ai * 360) / NA, angle: a, power: p });
    }
  }
  if (!wins.length) return { wins: 0, families: [], allBands: 0 };

  wins.sort((x, y) => x.deg - y.deg);
  const bands = [];
  for (const w of wins) {
    const last = bands[bands.length - 1];
    if (last && w.deg - last.hi <= cfg.bandGapDeg) { last.hi = w.deg; last.members.push(w); }
    else bands.push({ lo: w.deg, hi: w.deg, members: [w] });
  }
  // 0 deg and 360 deg are neighbours.
  if (bands.length > 1 && bands[0].lo <= cfg.bandGapDeg &&
      360 - bands[bands.length - 1].hi <= cfg.bandGapDeg) {
    const first = bands.shift();
    const last = bands[bands.length - 1];
    last.hi = first.hi + 360;
    last.members.push(...first.members);
  }

  const families = bands
    .filter((b) => b.members.length >= wins.length * cfg.minShareOfWins)
    .sort((x, y) => y.members.length - x.members.length)
    .map((b) => {
      const mid = b.members[Math.floor(b.members.length / 2)];
      const d = describe(lv, mid.angle, mid.power);
      const powers = b.members.map((m) => m.power);
      // Spread of flight times inside the band: a band whose members fly for
      // wildly different lengths is not one strategy.
      const times = [b.members[0], mid, b.members[b.members.length - 1]]
        .map((m) => describe(lv, m.angle, m.power).flightSeconds);
      return {
        angleFromDeg: Number(b.lo.toFixed(1)),
        angleToDeg: Number((b.hi % 360).toFixed(1)),
        angleWidthDeg: Number((b.hi - b.lo).toFixed(1)),
        wins: b.members.length,
        shareOfWins: Number((b.members.length / wins.length).toFixed(3)),
        powerFrom: Math.round(Math.min(...powers)),
        powerTo: Math.round(Math.max(...powers)),
        representative: {
          angleDeg: Number(((mid.angle * 180) / Math.PI).toFixed(2)),
          power: Number(mid.power.toFixed(1)),
          outcome: fly(lv, mid.angle, mid.power).outcome,
          flightSeconds: d.flightSeconds,
          closestApproach: d.closestApproach,
          apexY: d.apexY,
          endsOn: d.endsOn,
          crossesSides: d.crossesSides,
        },
        flightSecondsAcrossBand: times,
      };
    });

  return { wins: wins.length, allBands: bands.length, families };
}

/** Do two families describe different journeys, or the same one twice? */
export function familiesAreDistinct(a, b) {
  const A = a.representative, B = b.representative;
  const timeRatio = Math.max(A.flightSeconds, B.flightSeconds) /
                    Math.min(A.flightSeconds, B.flightSeconds);
  const closeRatio = Math.max(A.closestApproach, B.closestApproach) /
                     Math.max(1, Math.min(A.closestApproach, B.closestApproach));
  return {
    flightTimeRatio: Number(timeRatio.toFixed(2)),
    closestApproachRatio: Number(closeRatio.toFixed(2)),
    // Mirror images of one idea come out at the same time and the same distance.
    distinct: timeRatio >= 1.5 || closeRatio >= 1.5,
  };
}
