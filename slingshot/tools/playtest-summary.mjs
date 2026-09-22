// SLINGSHOT — summarise exported playtest sessions.
//
//   node tools/playtest-summary.mjs <session.json> [more.json ...]
//   node tools/playtest-summary.mjs --dir <folder>
//   node tools/playtest-summary.mjs --dir <folder> --json
//
// Reads the files a tester produced with EXPORT PLAYTEST DATA. Reads only:
// nothing is fetched, nothing is written back, and no new telemetry is
// introduced — every field below already exists in the export.
//
// What this can and cannot say. It reports what happened: where someone aimed,
// when they changed their mind, whether the misses got smaller. It cannot
// report why, and a trajectory is not evidence that anyone understood gravity.
// That claim needs the interview, which is kept in a separate file on purpose.

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const argOf = (n) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : null; };
const dir = argOf("dir");
const files = dir
  ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f))
  : process.argv.slice(2).filter((a) => a.endsWith(".json"));

if (!files.length) {
  console.error("usage: node tools/playtest-summary.mjs <session.json ...>  |  --dir <folder>");
  process.exit(2);
}

const EXPECTED_FINGERPRINT =
  "6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5";

// Bands from candidates/long-way-round-r22.analysis.json. Used to label a shot
// after the fact; testers never see this.
const FAMILIES = [
  { id: "A", fromDeg: 237, toDeg: 332, what: "over the top, ~2.3 s" },
  { id: "B", fromDeg: 28.5, toDeg: 104.5, what: "round the back, ~5.6 s" },
];
const familyOf = (deg) => {
  const a = ((deg % 360) + 360) % 360;
  return (FAMILIES.find((f) => a >= f.fromDeg && a <= f.toDeg) || {}).id || null;
};

/** Did the misses get smaller, or is this someone guessing? Compares the best
 *  closest-approach in the first and last third of the failed attempts. */
function convergence(attempts) {
  const misses = attempts.filter((a) => a.outcome !== "arrived" && a.closestApproach != null)
    .map((a) => a.closestApproach);
  if (misses.length < 6) return { verdict: "too few misses to say", n: misses.length };
  const third = Math.floor(misses.length / 3);
  const early = Math.min(...misses.slice(0, third));
  const late = Math.min(...misses.slice(-third));
  const ratio = early / Math.max(1, late);
  return {
    n: misses.length, bestEarly: early, bestLate: late,
    ratio: Number(ratio.toFixed(2)),
    verdict: ratio >= 1.5 ? "closing in" : ratio <= 0.8 ? "getting worse" : "no clear trend",
  };
}

/** How the aim moved between families over the session. */
function switching(attempts) {
  const seq = attempts.map((a) => familyOf(a.angleDeg) || "-");
  let switches = 0;
  for (let i = 1; i < seq.length; i++)
    if (seq[i] !== seq[i - 1] && seq[i] !== "-" && seq[i - 1] !== "-") switches++;
  return { sequence: seq.join(""), switches };
}

const rows = [];
for (const file of files) {
  let s;
  try { s = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { console.error("skipping " + basename(file) + ": " + e.message); continue; }

  const at = s.attempts || [];
  const first = at[0] || null;
  const firstWin = at.find((a) => a.outcome === "arrived") || null;

  // The first time each family was AIMED at, whether or not it worked — the
  // question is when someone tried the idea, not when it paid off.
  const firstTried = {};
  const firstWon = {};
  at.forEach((a) => {
    const f = familyOf(a.angleDeg);
    if (!f) return;
    if (!(f in firstTried)) firstTried[f] = a.attempt;
    if (a.outcome === "arrived" && !(f in firstWon)) firstWon[f] = a.attempt;
  });

  const gaps = at.map((a) => a.secondsSincePrevious).filter((x) => x != null);
  rows.push({
    file: basename(file),
    sessionId: s.sessionId,
    candidate: s.candidate,
    fingerprintOk: s.candidateFingerprint === EXPECTED_FINGERPRINT && s.fingerprintVerified === true,
    attempts: at.length,
    completed: !!s.completed,
    attemptsToFirstCompletion: s.completedOnAttempt ?? null,
    firstShot: first ? { angleDeg: first.angleDeg, power: first.power,
                         family: familyOf(first.angleDeg), outcome: first.outcome } : null,
    secondsToFirstShot: first ? first.secondsFromLoad : null,
    secondsToCompletion: firstWin ? firstWin.secondsFromLoad : null,
    firstSuccessfulFamily: firstWin ? familyOf(firstWin.angleDeg) : null,
    familiesDiscovered: (s.discoveredRoutes || []).slice().sort(),
    bothFamiliesFound: (s.discoveredRoutes || []).length >= 2,
    firstAttemptTryingEachFamily: firstTried,
    firstAttemptWinningEachFamily: firstWon,
    switching: switching(at),
    convergence: convergence(at),
    medianSecondsBetweenAttempts: gaps.length
      ? Number([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)].toFixed(1)) : null,
  });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ expectedFingerprint: EXPECTED_FINGERPRINT, sessions: rows }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s ?? "-").padEnd(n);
console.log("SLINGSHOT playtest — " + rows.length + " session(s)\n");
console.log(pad("session", 12) + pad("fp", 4) + pad("att", 5) + pad("done@", 7) +
  pad("1st shot", 18) + pad("won via", 9) + pad("found", 8) + pad("switch", 8) + "misses");
console.log("-".repeat(96));
for (const r of rows) {
  console.log(
    pad(r.sessionId, 12) +
    pad(r.fingerprintOk ? "ok" : "!!", 4) +
    pad(r.attempts, 5) +
    pad(r.attemptsToFirstCompletion, 7) +
    pad(r.firstShot ? Math.round(r.firstShot.angleDeg) + "deg/" + Math.round(r.firstShot.power) +
        " " + (r.firstShot.family || "-") : "-", 18) +
    pad(r.firstSuccessfulFamily, 9) +
    pad(r.familiesDiscovered.join("") || "-", 8) +
    pad(r.switching.switches, 8) +
    r.convergence.verdict);
}

console.log("\nper session");
for (const r of rows) {
  console.log("\n  " + r.sessionId + "   " + r.file);
  if (!r.fingerprintOk)
    console.log("    !! fingerprint mismatch — this session was NOT played on the frozen build");
  console.log("    attempts                 " + r.attempts +
    (r.completed ? ", completed on " + r.attemptsToFirstCompletion : ", not completed"));
  console.log("    time to first shot       " + r.secondsToFirstShot + " s" +
    (r.secondsToCompletion != null ? "   to completion " + r.secondsToCompletion + " s" : ""));
  console.log("    first tried each family  " + JSON.stringify(r.firstAttemptTryingEachFamily));
  console.log("    first won each family    " + JSON.stringify(r.firstAttemptWinningEachFamily));
  console.log("    aim sequence             " + r.switching.sequence + "   (" + r.switching.switches + " switches)");
  console.log("    closest approach         " + (r.convergence.n >= 6
    ? "best " + r.convergence.bestEarly + "px early -> " + r.convergence.bestLate +
      "px late, x" + r.convergence.ratio + "  " + r.convergence.verdict
    : r.convergence.verdict));
  console.log("    median gap between shots " + r.medianSecondsBetweenAttempts + " s");
}

console.log("\nThese are behaviours, not explanations. Whether a player understood");
console.log("anything is a question for the interview sheet, not for this table.");
