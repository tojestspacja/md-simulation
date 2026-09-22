// SLINGSHOT — what the solution landscape of each level actually looks like.
//
//   node tools/difficulty.mjs                 measure and print
//   node tools/difficulty.mjs --write         also write analysis/
//   node tools/difficulty.mjs --angles 720    denser sweep (default 360)
//
// This is NOT a regression test and its numbers never reach golden.json. A
// regression test asks "did the game change"; this asks "what shape is the
// problem". Conflating them would mean a level could never be re-tuned without
// a fingerprint failing, and it would tempt us to treat one number as truth.
//
// The reason it exists: the search bot in test/solver.mjs finishes level 7 in
// two shots and level 6 in 154, which would say the gravity assist is the
// easiest level in the game. It is not. A search can be lucky, and one number
// cannot tell luck from ease. So four independent things get measured and
// reported side by side, and the disagreements between them are the useful
// part.
//
//   search      how expensive a blind search is, over many seeded starts
//   basin       how much of the launch space wins at all, sampled directly
//   precision   how far you can be wrong and still win
//   concept     what you have to understand — declared by hand, not measured
//
// Everything imports the canonical engine and levels; nothing here duplicates
// physics or level data.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { LEVELS } from "../src/levels/index.js";
import { fly, missOf } from "./flight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "analysis");

export const TOOL_VERSION = "1.0.0";

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};

// ---------- settings, all reported with the results ----------
export const CONFIG = {
  toolVersion: TOOL_VERSION,
  angleSamples: arg("angles", 360),     // over the full circle
  powerSamples: arg("powers", 120),     // from powerFloor to maxP. 30 was too
                                        // coarse: it put orbit's representative
                                        // sample on a ledge and read its angle
                                        // tolerance as 2.4 deg instead of 12.6.
  powerFloor: 12,                       // the game ignores a drag below this
  searchTrials: 40,                     // seeded restarts per level
  searchBudget: 2000,                   // shots before a trial is a failure
  seedBase: 20260923,
  toleranceSteps: 240,                  // bisection resolution for tolerance
};

// ---------- what each level asks you to understand ----------
// Declared, not measured. A bot cannot tell you whether a mechanic is
// counter-intuitive; pretending otherwise would be the most misleading number
// in the file.
const CONCEPT = {
  "push": { class: "direct launch", note: "aim and power, nothing else acting" },
  "bend": { class: "weak gravity deflection", note: "a mass off the line curves the path" },
  "aim-away": { class: "counter-intuitive aim", note: "aiming at the target is the one thing that fails" },
  "orbit": { class: "sustained orbit", note: "a speed band between falling in and sailing past" },
  "round-the-back": { class: "behind-body routing", note: "the target is shadowed; commit to the long way" },
  "two-planets": { class: "multi-body interaction", note: "three-body sensitivity: small change, different outcome" },
  "gravity-assist": { class: "gravity assist / escape", note: "provably impossible alone; take speed from a moving moon" },
};

// ---------- deterministic randomness ----------
// Seeded so a run can be repeated exactly. Varied starts matter because the
// shipped bot always begins at the same guess, which makes its shot count a
// property of that one guess rather than of the level.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1. search cost, over many seeded starts ----------
// Same acceptance rule as the shipped bot — only ever move to a smaller miss —
// but the starting guess and the sweep phase come from the seed, so the spread
// across trials shows how much of the shot count was the level and how much
// was where the search happened to begin.
function search(lv, seed, budget) {
  const rng = mulberry32(seed);
  let shots = 0;
  const shoot = (a, p) => {
    shots++;
    return missOf(lv, fly(lv, a, Math.max(CONFIG.powerFloor, Math.min(lv.maxP, p))));
  };

  let bestA = rng() * Math.PI * 2, bestP = lv.maxP * (0.4 + rng() * 0.6);
  let bestM = shoot(bestA, bestP);

  // Where the coarse sweep starts, anywhere on the circle. This has to span the
  // full 360: a sweep that always begins near 0 deg solves any level whose
  // answer happens to sit near 0 deg on its second shot, which measures the
  // sweep rather than the level.
  const phase = rng() * 360;
  for (let deg = phase; deg < 360 + phase; deg += 10) {
    for (let pf = 1.0; pf >= 0.4; pf -= 0.2) {
      if (shots >= budget) return { shots, solved: false };
      const m = shoot(deg * Math.PI / 180, lv.maxP * pf);
      if (m < bestM) { bestM = m; bestA = deg * Math.PI / 180; bestP = lv.maxP * pf; }
      if (bestM === 0) return { shots, solved: true };
    }
  }
  let dA = 8 * Math.PI / 180, dP = lv.maxP * 0.15;
  while (shots < budget && bestM > 0 && (dA > 1e-5 || dP > 0.05)) {
    let improved = false;
    for (const [ca, cp] of [[bestA + dA, bestP], [bestA - dA, bestP],
                            [bestA, bestP + dP], [bestA, bestP - dP],
                            [bestA + dA, bestP + dP], [bestA - dA, bestP - dP],
                            [bestA + dA, bestP - dP], [bestA - dA, bestP + dP]]) {
      if (shots >= budget) break;
      const m = shoot(ca, cp);
      if (m < bestM) { bestM = m; bestA = ca; bestP = cp; improved = true; }
      if (bestM === 0) return { shots, solved: true };
    }
    if (!improved) { dA *= 0.5; dP *= 0.5; }
  }
  return { shots, solved: bestM === 0 };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[i];
};

// Seeds derive from the level id, never from where it sits in the array being
// measured. Position-derived seeds meant the same level measured inside a
// different list got different seeds and different numbers — round-the-back
// read as a median of 86 in the baseline and 41 in a candidate comparison, for
// no reason but its index.
function idSeed(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function searchProfile(lv) {
  const runs = [];
  for (let k = 0; k < CONFIG.searchTrials; k++)
    runs.push(search(lv, (CONFIG.seedBase + idSeed(lv.id) + k) >>> 0, CONFIG.searchBudget));
  const solved = runs.filter((r) => r.solved).map((r) => r.shots).sort((a, b) => a - b);
  return {
    trials: runs.length,
    solved: solved.length,
    successRate: Number((solved.length / runs.length).toFixed(3)),
    failuresWithinBudget: runs.length - solved.length,
    budget: CONFIG.searchBudget,
    medianShots: quantile(solved, 0.5),
    p75Shots: quantile(solved, 0.75),
    p90Shots: quantile(solved, 0.9),
    minShots: solved[0] ?? null,
    maxShots: solved[solved.length - 1] ?? null,
  };
}

// ---------- 2. the raw solution basin ----------
// Sample the launch space directly. Independent of any search: this is how
// much of what a player could physically do actually wins.
function sampleGrid(lv) {
  const { angleSamples: NA, powerSamples: NP, powerFloor } = CONFIG;
  const grid = [];                       // grid[ai][pi] = won
  let hits = 0;
  for (let ai = 0; ai < NA; ai++) {
    const a = (ai / NA) * Math.PI * 2;
    const row = [];
    for (let pi = 0; pi < NP; pi++) {
      const p = powerFloor + ((lv.maxP - powerFloor) * pi) / (NP - 1);
      const won = fly(lv, a, p).won;
      row.push(won);
      if (won) hits++;
    }
    grid.push(row);
  }
  return { grid, hits, total: NA * NP };
}

// ---------- 3. how many separate ways in ----------
// Connected components over the sampled grid, 4-connected, wrapping in angle
// because 359 deg and 0 deg are neighbours. Several regions usually means
// several strategies, which is what makes a puzzle feel exploratory.
function basins(grid) {
  const NA = grid.length, NP = grid[0].length;
  const seen = grid.map((r) => r.map(() => false));
  const sizes = [];
  for (let ai = 0; ai < NA; ai++) {
    for (let pi = 0; pi < NP; pi++) {
      if (!grid[ai][pi] || seen[ai][pi]) continue;
      let size = 0;
      const stack = [[ai, pi]];
      seen[ai][pi] = true;
      while (stack.length) {
        const [x, y] = stack.pop();
        size++;
        const nbrs = [[(x + 1) % NA, y], [(x - 1 + NA) % NA, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of nbrs) {
          if (ny < 0 || ny >= NP) continue;
          if (grid[nx][ny] && !seen[nx][ny]) { seen[nx][ny] = true; stack.push([nx, ny]); }
        }
      }
      sizes.push(size);
    }
  }
  sizes.sort((a, b) => b - a);
  // Counting every speck as a strategy is how two-planets reads as 32 routes
  // when 31 of them are shards of chaos. A region only counts as somewhere a
  // player could deliberately go if it is big enough to aim at: at least ten
  // sampled launches, and at least a twentieth of everything that wins.
  const total = sizes.reduce((a, b) => a + b, 0);
  const meaningful = sizes.filter((n) => n >= 10 && n >= total * 0.05);
  return { count: sizes.length, sizes: sizes.slice(0, 6), largest: sizes[0] ?? 0,
           meaningfulRoutes: meaningful.length, meaningfulSizes: meaningful };
}

// ---------- 4. how wrong you can be ----------
// Walk outward from a winning shot until it stops winning, in each direction
// separately: a basin with a planet on one side is not symmetric, and averaging
// the two sides would hide exactly the thing that makes a level feel tight.
function tolerance(lv, angle, power) {
  const wins = (a, p) => p >= CONFIG.powerFloor && p <= lv.maxP && fly(lv, a, p).won;
  const walk = (stepA, stepP, limit) => {
    let last = 0;
    for (let k = 1; k <= CONFIG.toleranceSteps; k++) {
      const d = (k / CONFIG.toleranceSteps) * limit;
      if (!wins(angle + stepA * d, power + stepP * d)) break;
      last = d;
    }
    return last;
  };
  const degLimit = 30 * Math.PI / 180;
  const powLimit = lv.maxP * 0.5;
  return {
    angleMinusDeg: Number((walk(-1, 0, degLimit) * 180 / Math.PI).toFixed(2)),
    anglePlusDeg: Number((walk(+1, 0, degLimit) * 180 / Math.PI).toFixed(2)),
    powerMinus: Number(walk(0, -1, powLimit).toFixed(1)),
    powerPlus: Number(walk(0, +1, powLimit).toFixed(1)),
  };
}

/** A winning shot near the middle of the biggest basin, so the tolerance
 *  numbers describe the route a player would most plausibly find. */
function representative(lv, grid) {
  const NA = grid.length, NP = grid[0].length;
  let best = null, bestScore = -1;
  for (let ai = 0; ai < NA; ai++) {
    for (let pi = 0; pi < NP; pi++) {
      if (!grid[ai][pi]) continue;
      // score = how many of the 8 neighbours also win: prefers the interior
      let n = 0;
      for (let da = -1; da <= 1; da++)
        for (let dp = -1; dp <= 1; dp++) {
          if (!da && !dp) continue;
          const x = (ai + da + NA) % NA, y = pi + dp;
          if (y >= 0 && y < NP && grid[x][y]) n++;
        }
      if (n > bestScore) { bestScore = n; best = [ai, pi]; }
    }
  }
  if (!best) return null;
  const [ai, pi] = best;
  return {
    angleDeg: Number(((ai / NA) * 360).toFixed(2)),
    angle: (ai / NA) * Math.PI * 2,
    power: Number((CONFIG.powerFloor +
      ((lv.maxP - CONFIG.powerFloor) * pi) / (NP - 1)).toFixed(1)),
    neighbours: bestScore,
  };
}

// ---------- run ----------
export function measure(levels) {
  return levels.map((lv, i) => {
  const t0 = Date.now();
  const { grid, hits, total } = sampleGrid(lv);
  const b = basins(grid);
  const rep = representative(lv, grid);
  const tol = rep ? tolerance(lv, rep.angle, rep.power) : null;
  const s = searchProfile(lv);
  return {
    id: lv.id,
    name: lv.name,
    maxPower: lv.maxP,
    maxTime: lv.maxT,
    bodies: lv.bodies.length,
    search: s,
    solutionSpace: {
      samples: total,
      hits,
      hitRatePercent: Number(((hits / total) * 100).toFixed(2)),
      basinCount: b.count,
      largestBasin: b.largest,
      largestBasinPercent: Number(((b.largest / total) * 100).toFixed(2)),
      basinSizes: b.sizes,
      meaningfulRoutes: b.meaningfulRoutes,
      meaningfulSizes: b.meaningfulSizes,
    },
    precision: rep ? { representative: { angleDeg: rep.angleDeg, power: rep.power }, ...tol } : null,
    concept: CONCEPT[lv.id] || { class: "(candidate)", note: "not yet classified" },
    seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
  });
}

// Candidates live outside src/levels/ until they earn their way in; point the
// tool at a module exporting LEVELS to measure them with this exact code path.
// Only measure and print when run directly. Imported — by tools/candidate.mjs,
// for instance — this file is a library and must not kick off a four-minute
// sweep of the shipped seven as a side effect.
const RUNNING_DIRECTLY = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (RUNNING_DIRECTLY) {
const levelsArg = process.argv.indexOf("--levels");
const SUBJECT = levelsArg >= 0 && process.argv[levelsArg + 1]
  ? (await import(process.argv[levelsArg + 1])).LEVELS
  : LEVELS;

const results = measure(SUBJECT);

// ---------- print ----------
const pad = (s, n) => String(s).padEnd(n);
console.log("SLINGSHOT difficulty baseline   tool " + TOOL_VERSION);
console.log("grid " + CONFIG.angleSamples + " angles x " + CONFIG.powerSamples +
  " powers   search " + CONFIG.searchTrials + " seeded trials, budget " +
  CONFIG.searchBudget + "   seed base " + CONFIG.seedBase + "\n");

console.log(pad("level", 16) + pad("hit%", 8) + pad("routes", 8) + pad("largest%", 10) +
  pad("median", 8) + pad("p90", 7) + pad("fail", 6) + "angle tol");
console.log("-".repeat(86));
for (const r of results) {
  const t = r.precision;
  console.log(
    pad(r.id, 16) +
    pad(r.solutionSpace.hitRatePercent, 8) +
    pad(r.solutionSpace.meaningfulRoutes + "/" + r.solutionSpace.basinCount, 8) +
    pad(r.solutionSpace.largestBasinPercent, 10) +
    pad(r.search.medianShots ?? "-", 8) +
    pad(r.search.p90Shots ?? "-", 7) +
    pad(r.search.failuresWithinBudget, 6) +
    (t ? `-${t.angleMinusDeg} / +${t.anglePlusDeg} deg` : "-"));
}
console.log("\nconcept");
for (const r of results) console.log("  " + pad(r.id, 16) + r.concept.class);

// ---------- write ----------
if (process.argv.includes("--write")) {
  mkdirSync(OUT, { recursive: true });
  const payload = { generatedBy: "tools/difficulty.mjs", toolVersion: TOOL_VERSION,
                    config: CONFIG, levels: results };
  writeFileSync(join(OUT, "difficulty-baseline.json"), JSON.stringify(payload, null, 2) + "\n");
  writeFileSync(join(OUT, "difficulty-baseline.md"), markdown(results));
  console.log("\nwritten to analysis/");
}
}   // end RUNNING_DIRECTLY

function markdown(rs) {
  const L = [];
  L.push("# SLINGSHOT — difficulty baseline\n");
  L.push("Generated by `tools/difficulty.mjs` " + TOOL_VERSION +
    ". Re-run with `node tools/difficulty.mjs --write`.\n");
  L.push("This is analysis, not a regression test. None of it reaches `golden.json`, " +
    "and none of it is imported by the game.\n");
  L.push("## How it was measured\n");
  L.push("| setting | value |");
  L.push("|---|---|");
  L.push("| launch grid | " + CONFIG.angleSamples + " angles over 360 deg x " +
    CONFIG.powerSamples + " powers from " + CONFIG.powerFloor + " to each level's cap |");
  L.push("| search trials | " + CONFIG.searchTrials + " per level, seeded from " +
    CONFIG.seedBase + " |");
  L.push("| search budget | " + CONFIG.searchBudget + " shots before a trial counts as failed |");
  L.push("| tolerance | walked outward from the most interior winning sample, " +
    CONFIG.toleranceSteps + " steps, each direction separately |");
  L.push("\nThe search uses the same acceptance rule as the shipped bot — only ever " +
    "move to a smaller miss — but starts from a seeded guess rather than one fixed " +
    "one, so the spread shows how much of a shot count belongs to the level rather " +
    "than to where the search began.\n");
  L.push("## Summary\n");
  L.push("| level | concept | hit % | basins | median shots | p90 | angle tolerance | power tolerance |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const r of rs) {
    const t = r.precision;
    L.push("| `" + r.id + "` | " + r.concept.class + " | " + r.solutionSpace.hitRatePercent +
      " | " + r.solutionSpace.basinCount + " | " + (r.search.medianShots ?? "-") +
      " | " + (r.search.p90Shots ?? "-") +
      " | " + (t ? "-" + t.angleMinusDeg + " / +" + t.anglePlusDeg + " deg" : "-") +
      " | " + (t ? "-" + t.powerMinus + " / +" + t.powerPlus : "-") + " |");
  }
  L.push("\n## Per level\n");
  for (const r of rs) {
    const t = r.precision;
    L.push("### `" + r.id + "` — " + r.name + "\n");
    L.push("**concept:** " + r.concept.class + " — " + r.concept.note + "\n");
    L.push("```");
    L.push("search       " + r.search.solved + "/" + r.search.trials + " solved" +
      "   median " + (r.search.medianShots ?? "-") +
      "   p75 " + (r.search.p75Shots ?? "-") +
      "   p90 " + (r.search.p90Shots ?? "-") +
      "   range " + (r.search.minShots ?? "-") + "-" + (r.search.maxShots ?? "-"));
    L.push("solution     " + r.solutionSpace.hits + "/" + r.solutionSpace.samples +
      " samples win = " + r.solutionSpace.hitRatePercent + "%" +
      "   " + r.solutionSpace.basinCount + " region(s)" +
      "   largest " + r.solutionSpace.largestBasinPercent + "%");
    if (t) {
      L.push("precision    from " + t.representative.angleDeg + " deg at power " +
        t.representative.power);
      L.push("             angle  -" + t.angleMinusDeg + " / +" + t.anglePlusDeg + " deg");
      L.push("             power  -" + t.powerMinus + " / +" + t.powerPlus);
    }
    L.push("```\n");
  }
  return L.join("\n") + "\n";
}
