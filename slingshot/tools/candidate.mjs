// SLINGSHOT — evaluate a candidate level without letting it near the game.
//
//   node tools/candidate.mjs                        measure and print
//   node tools/candidate.mjs --write                also write the report
//   node tools/candidate.mjs --file ../candidates/x.js
//
// The candidate is measured by the same code path as the shipped seven:
// canonical physics, the shared flight model, the same difficulty tool. It is
// never imported by the game, and nothing here writes to analysis/ or to
// test/golden.json.
//
// Every report records the repository commit, the seeds and every threshold, so
// a number can always be traced to the tool version that produced it. That
// matters more than usual here: two of the tool's own metrics have already been
// corrected once, and a candidate measured before a correction is not
// comparable with one measured after it.

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { createHash } from "node:crypto";

import { LEVELS as SHIPPED } from "../src/levels/index.js";
import { CONFIG, TOOL_VERSION, measure } from "./difficulty.mjs";
import { routeFamilies, familiesAreDistinct, ROUTE_CONFIG, describe } from "./routes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argOf = (n) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : null; };
const FILE = argOf("file") || "../candidates/long-way-round.js";

const mod = await import(new URL(FILE, import.meta.url).href);
const CAND = mod.LEVEL || mod.LEVELS[0];

// ---------- acceptance gates, written down rather than judged by eye ----------
const GATES = {
  basinPercent: [1.5, 2.6],
  searchMedian: [40, 90],
  searchP90Max: 130,
  failedSeeds: 0,
  minToleranceDeg: 1.5,
  minFamilies: 2,
};

// ---------- provenance ----------
function git(...a) { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } }
const provenance = {
  repositoryCommit: git("rev-parse", "HEAD"),
  repositoryDirty: (git("status", "--porcelain") || "").length > 0,
  toolVersion: TOOL_VERSION,
  generatedBy: "tools/candidate.mjs",
  node: process.version,
};

// ---------- candidate fingerprint ----------
// Same canonicalisation as test/levels-fingerprint.mjs: keys sorted at every
// depth, so reformatting the module is free and changing a number is not. This
// is NOT a shipped golden. Its job during evaluation is to tell us whether a
// measurement moved because the tool changed or because the geometry did.
const canonical = (v) => Array.isArray(v) ? v.map(canonical)
  : (v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v);
const fingerprint = createHash("sha256")
  .update(JSON.stringify(canonical(CAND))).digest("hex");

// ---------- measure ----------
console.log("candidate    " + CAND.id + " — " + CAND.name + "   (" + basename(FILE) + ")");
console.log("fingerprint  " + fingerprint);
console.log("commit       " + provenance.repositoryCommit +
  (provenance.repositoryDirty ? "  (working tree dirty)" : ""));
console.log("grid         " + CONFIG.angleSamples + " x " + CONFIG.powerSamples +
  "   search " + CONFIG.searchTrials + " trials, budget " + CONFIG.searchBudget +
  ", seed " + CONFIG.seedBase + "\n");

const [m] = measure([CAND]);
const routes = routeFamilies(CAND);

// Compare the two largest families pairwise.
const pairs = [];
for (let i = 0; i < routes.families.length; i++)
  for (let j = i + 1; j < routes.families.length; j++)
    pairs.push({ a: i, b: j, ...familiesAreDistinct(routes.families[i], routes.families[j]) });

// ---------- comparisons ----------
const byId = Object.fromEntries(SHIPPED.map((L) => [L.id, L]));
const compareIds = ["bend", "aim-away", "round-the-back"];
const comparison = measure(compareIds.map((id) => byId[id])).map((r, k) => ({
  id: compareIds[k],
  basinPercent: r.solutionSpace.hitRatePercent,
  searchMedian: r.search.medianShots,
  searchP90: r.search.p90Shots,
  tolerance: r.precision,
  families: routeFamilies(byId[compareIds[k]]).families.map((f) => ({
    angleFromDeg: f.angleFromDeg, angleToDeg: f.angleToDeg, shareOfWins: f.shareOfWins,
    flightSeconds: f.representative.flightSeconds,
    closestApproach: f.representative.closestApproach,
  })),
}));

// ---------- gates ----------
const tolMin = m.precision
  ? Math.min(m.precision.angleMinusDeg, m.precision.anglePlusDeg) : 0;
const checks = [
  ["basin in " + GATES.basinPercent.join("-") + "%",
    m.solutionSpace.hitRatePercent >= GATES.basinPercent[0] &&
    m.solutionSpace.hitRatePercent <= GATES.basinPercent[1], m.solutionSpace.hitRatePercent + "%"],
  ["search median in " + GATES.searchMedian.join("-"),
    m.search.medianShots >= GATES.searchMedian[0] && m.search.medianShots <= GATES.searchMedian[1],
    m.search.medianShots],
  ["p90 under " + GATES.searchP90Max, m.search.p90Shots < GATES.searchP90Max, m.search.p90Shots],
  ["no failed seeds", m.search.failuresWithinBudget === GATES.failedSeeds,
    m.search.failuresWithinBudget + "/" + m.search.trials],
  ["tolerance at least +/-" + GATES.minToleranceDeg + " deg", tolMin >= GATES.minToleranceDeg,
    "-" + m.precision.angleMinusDeg + " / +" + m.precision.anglePlusDeg],
  ["at least " + GATES.minFamilies + " route families", routes.families.length >= GATES.minFamilies,
    routes.families.length],
  ["families are distinct journeys", pairs.some((p) => p.distinct),
    pairs.map((p) => "time x" + p.flightTimeRatio + ", closest x" + p.closestApproachRatio).join("; ")],
];

console.log("route families (" + routes.wins + " winning launches, " + routes.allBands + " bands)");
for (const f of routes.families) {
  const r = f.representative;
  console.log("  " + String(f.angleFromDeg).padStart(5) + "-" + String(f.angleToDeg).padEnd(6) +
    " deg  " + String(Math.round(f.shareOfWins * 100)).padStart(3) + "%" +
    "  power " + f.powerFrom + "-" + f.powerTo +
    "  flight " + r.flightSeconds + "s  closest " + r.closestApproach + "px" +
    (r.crossesSides ? "  crosses" : ""));
}

console.log("\ngates");
let failed = 0;
for (const [label, ok, detail] of checks) {
  console.log("  " + (ok ? "ok   " : "FAIL ") + label.padEnd(34) + detail);
  if (!ok) failed++;
}
console.log("\n" + (failed ? failed + " gate(s) failed" : "all gates passed") +
  "  — the readability judgement is separate and is not automated.");

// ---------- write ----------
if (process.argv.includes("--write")) {
  const dir = join(HERE, "..", "candidates");
  mkdirSync(dir, { recursive: true });
  const report = {
    status: "CANDIDATE — NOT SHIPPED",
    candidate: { id: CAND.id, name: CAND.name, idIsProvisional: true, geometry: CAND, fingerprint },
    provenance,
    analysisConfig: {
      angleSamples: CONFIG.angleSamples, powerSamples: CONFIG.powerSamples,
      powerFloor: CONFIG.powerFloor, searchTrials: CONFIG.searchTrials,
      searchBudget: CONFIG.searchBudget, seedBase: CONFIG.seedBase,
      toleranceSteps: CONFIG.toleranceSteps,
      routeBandGapDeg: ROUTE_CONFIG.bandGapDeg,
      routeMinShareOfWins: ROUTE_CONFIG.minShareOfWins,
      routeGrid: ROUTE_CONFIG.angleSamples + "x" + ROUTE_CONFIG.powerSamples,
      meaningfulRouteThreshold: "grid region >= 10 cells and >= 5% of winning cells",
    },
    gates: GATES,
    measurements: m,
    routeFamilies: routes,
    familyDistinctness: pairs,
    comparison,
    gateResults: checks.map(([label, ok, detail]) => ({ label, pass: ok, value: String(detail) })),
    allGatesPassed: failed === 0,
  };
  writeFileSync(join(dir, CAND.id + ".analysis.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("\nwritten to candidates/" + CAND.id + ".analysis.json");
}

export { CAND, fingerprint, routes, m as measurement };
