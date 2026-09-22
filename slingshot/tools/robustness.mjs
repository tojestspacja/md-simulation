// SLINGSHOT — how wrong you can be, measured across a whole route.
//
// SUPERSEDES the single representative-point tolerance in tools/difficulty.mjs
// for acceptance decisions. That metric walked outward from the one winning
// sample with the most winning neighbours, which sounds principled and is not:
// the chosen point jumps to a different part of the basin under a small
// geometry change, so the number moves without the level moving. Shrinking the
// candidate's flag from 28 to 22 made its reported tolerance widen from
// -1.87/+2.25 to -6/+12.37 degrees, which is an artefact of point selection.
//
// Instead: take the winning population, measure each sample's own margins, and
// report the distribution per route family. A level is not tight because one
// basin-edge sample is tight; it is tight when a substantial share of its
// viable solutions are.
//
// Method, per sampled winning launch:
//   angle  — hold power, walk the angle down and up along the grid while it
//            still wins, then bisect the last grid step to find the edge
//   power  — hold angle, same walk along the power axis
// Lower and upper margins are kept separate: a mass on one side makes a basin
// asymmetric, and averaging the sides would hide exactly that.
//
// Cost is why it samples rather than walking every win: the candidate has ~2000
// winning launches and four margins each. Up to `perFamily` launches are taken
// evenly across each family, which is ample for p10/median/p90 and keeps a run
// to seconds.
//
// Known limit: the outward walk steps in grid increments before bisecting, so a
// losing gap thinner than one grid step is stepped over. Denser grids narrow
// that; nothing here pretends it is exact.

import { fly } from "./flight.mjs";
import { winsAndBands, ROUTE_CONFIG } from "./routes.mjs";

export const ROBUSTNESS_CONFIG = {
  perFamily: 250,          // winning launches sampled per family
  bisectSteps: 12,         // refinement of each edge
  maxAngleDeg: 40,         // walks stop here; wider than any shipped basin
  maxPowerFraction: 0.6,   // of the level's launcher cap
};

const DEG = Math.PI / 180;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return Number(sorted[i].toFixed(2));
}
const dist = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p10: quantile(s, 0.1), median: quantile(s, 0.5),
           p90: quantile(s, 0.9), min: quantile(s, 0), max: quantile(s, 1) };
};

/** Walk one direction until the flight stops winning, then bisect the edge. */
function margin(lv, angle, power, dAngle, dPower, limit, cfg) {
  const wins = (d) => {
    const p = power + dPower * d;
    if (p < ROUTE_CONFIG.powerFloor || p > lv.maxP) return false;
    return fly(lv, angle + dAngle * d, p).won;
  };
  // coarse march
  const step = limit / 24;
  let good = 0, bad = null;
  for (let d = step; d <= limit + 1e-9; d += step) {
    if (wins(d)) good = d; else { bad = d; break; }
  }
  if (bad === null) return limit;          // still winning at the cap
  for (let k = 0; k < cfg.bisectSteps; k++) {
    const mid = (good + bad) / 2;
    if (wins(mid)) good = mid; else bad = mid;
  }
  return good;
}

/** Margin distributions for every meaningful route family of a level. */
export function robustness(lv, cfg = ROBUSTNESS_CONFIG, routeCfg = ROUTE_CONFIG) {
  const { wins, bands } = winsAndBands(lv, routeCfg);
  if (!wins.length) return { families: [] };

  const meaningful = bands
    .filter((b) => b.members.length >= wins.length * routeCfg.minShareOfWins)
    .sort((x, y) => y.members.length - x.members.length);

  const angleLimit = cfg.maxAngleDeg * DEG;
  const powerLimit = lv.maxP * cfg.maxPowerFraction;

  return {
    totalWins: wins.length,
    sampledPerFamily: cfg.perFamily,
    families: meaningful.map((b) => {
      const stride = Math.max(1, Math.floor(b.members.length / cfg.perFamily));
      const picked = b.members.filter((_, i) => i % stride === 0).slice(0, cfg.perFamily);

      const aMinus = [], aPlus = [], pMinus = [], pPlus = [], aWidth = [], pWidth = [];
      for (const w of picked) {
        const am = margin(lv, w.angle, w.power, -1, 0, angleLimit, cfg) / DEG;
        const ap = margin(lv, w.angle, w.power, +1, 0, angleLimit, cfg) / DEG;
        const pm = margin(lv, w.angle, w.power, 0, -1, powerLimit, cfg);
        const pp = margin(lv, w.angle, w.power, 0, +1, powerLimit, cfg);
        aMinus.push(am); aPlus.push(ap); pMinus.push(pm); pPlus.push(pp);
        aWidth.push(am + ap); pWidth.push(pm + pp);
      }
      return {
        angleFromDeg: Number(b.lo.toFixed(1)),
        angleToDeg: Number((b.hi % 360).toFixed(1)),
        wins: b.members.length,
        shareOfWins: Number((b.members.length / wins.length).toFixed(3)),
        sampled: picked.length,
        angleLowerDeg: dist(aMinus),
        angleUpperDeg: dist(aPlus),
        angleWidthDeg: dist(aWidth),
        powerLower: dist(pMinus),
        powerUpper: dist(pPlus),
        powerWidth: dist(pWidth),
      };
    }),
  };
}

/** The question the gate actually asks: is a SUBSTANTIAL SHARE of a family's
 *  viable solutions inside an extremely narrow window?
 *
 *  Answered on the MEDIAN of the narrower side, not the p10. Calibration on the
 *  shipped seven showed why: every family's p10 lands between 0.11 and 2.57
 *  degrees, because any basin has an edge and samples sitting on it have almost
 *  no margin by definition. p10 measures the edge, not the level, and does not
 *  discriminate between two-planets and gravity-assist. The median does: half
 *  the viable solutions are tighter than it, which is what "a substantial
 *  share" means.
 *
 *  Shipped medians, dominant family: aim-away 1.48, push 1.92, round-the-back
 *  2.48, bend 3.01, orbit 3.46, two-planets 1.12, gravity-assist 19.43. */
export function tightestSide(family) {
  return Math.min(family.angleLowerDeg.median, family.angleUpperDeg.median);
}
