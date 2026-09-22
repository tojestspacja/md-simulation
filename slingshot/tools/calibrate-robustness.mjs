// Calibrate the distribution tolerance metric against the seven shipped levels.
//
//   node tools/calibrate-robustness.mjs [--write]
//
// A threshold invented before looking at known-good designs is a guess. These
// seven are the only levels anyone has judged playable, so what the metric says
// about them is what "acceptable" has to mean.
//
// These numbers are NOT comparable with the single representative-point
// tolerances in analysis/difficulty-baseline.json. Different metric, different
// question: that one asked how much slack one chosen launch has, this asks how
// much slack the population of winning launches has.

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LEVELS } from "../src/levels/index.js";
import { robustness, tightestSide, ROBUSTNESS_CONFIG } from "./robustness.mjs";
import { ROUTE_CONFIG } from "./routes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return null; } };

const pad = (s, n) => String(s).padEnd(n);
console.log("distribution tolerance, shipped levels");
console.log("grid " + ROUTE_CONFIG.angleSamples + " x " + ROUTE_CONFIG.powerSamples +
  "   up to " + ROBUSTNESS_CONFIG.perFamily + " launches sampled per family\n");
console.log(pad("level", 16) + pad("family", 16) + pad("share", 7) +
  pad("angle lower p10/med/p90", 26) + pad("angle upper p10/med/p90", 26) + "power width med");
console.log("-".repeat(110));

const rows = [];
for (const lv of LEVELS) {
  const r = robustness(lv);
  rows.push({ id: lv.id, ...r });
  r.families.forEach((f, i) => {
    console.log(
      pad(i === 0 ? lv.id : "", 16) +
      pad(Math.round(f.angleFromDeg) + "-" + Math.round(f.angleToDeg) + " deg", 16) +
      pad(Math.round(f.shareOfWins * 100) + "%", 7) +
      pad([f.angleLowerDeg.p10, f.angleLowerDeg.median, f.angleLowerDeg.p90].join(" / "), 26) +
      pad([f.angleUpperDeg.p10, f.angleUpperDeg.median, f.angleUpperDeg.p90].join(" / "), 26) +
      f.powerWidth.median);
  });
}

const tight = rows.flatMap((r) => r.families.map((f) => ({ id: r.id, t: tightestSide(f) })))
  .sort((a, b) => a.t - b.t);
console.log("\nnarrower side, MEDIAN, every shipped family, tightest first");
for (const x of tight) console.log("  " + pad(x.id, 18) + x.t + " deg");
console.log("\nThe tightest shipped design sits at " + tight[0].t +
  " deg. Any threshold above that would reject a level that already ships.");

if (process.argv.includes("--write")) {
  const dir = join(HERE, "..", "analysis");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "tolerance-calibration.json"), JSON.stringify({
    metric: "distribution tolerance (supersedes single representative-point tolerance)",
    note: "Not comparable with the representative-point tolerances in difficulty-baseline.json.",
    provenance: { repositoryCommit: git("rev-parse", "HEAD"),
                  repositoryDirty: (git("status", "--porcelain") || "").length > 0,
                  node: process.version },
    config: { route: ROUTE_CONFIG, robustness: ROBUSTNESS_CONFIG },
    tightestShippedSideMedianDeg: tight[0].t,
    levels: rows,
  }, null, 2) + "\n");
  console.log("\nwritten to analysis/tolerance-calibration.json");
}
