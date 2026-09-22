// SLINGSHOT playtest — the candidate, played on the real runtime.
//
// This page exists to put one experimental level in front of people using the
// game's own aiming, integrator, trail, ghosts, closest-point marker, camera
// and retry. None of those are reimplemented here: createSlingshot() is the
// same function ../boot.js calls, so a tester is playing SLINGSHOT rather than
// something that resembles it.
//
// What is different, and only this:
//   * the level list is the candidate, not the shipped seven
//   * the unlock graph is one level with no prerequisite
//   * the save lives under its own key, so finishing or resetting an
//     experiment cannot touch a real player's record
//   * an onAttempt recorder keeps what happened, in memory and in that key
//
// Nothing is sent anywhere. There is no analytics, no backend and no network
// call: the data leaves this page only when a tester presses Export.

import { createSlingshot } from "../game.js";
import { LEVEL } from "../candidates/long-way-round-r22.js";

// Accepted at this fingerprint. Recorded in every export so a session can be
// tied to the geometry that produced it, and checked at boot so a session can
// never be attributed to the wrong revision.
const CANDIDATE_FINGERPRINT =
  "6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5";

const PROGRESS_KEY = "slingshot.playtest.long-way-round-r22";
const SESSION_KEY = "slingshot.playtest.session.long-way-round-r22";

// Same canonicalisation as test/levels-fingerprint.mjs and tools/candidate.mjs.
const canonical = (v) => Array.isArray(v) ? v.map(canonical)
  : (v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v);
async function fingerprintOf(level) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(level)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- the session record ----------
// Anonymous and local. A random id per session so several exports from one
// browser can be told apart; nothing identifies a person, and nothing is
// derived from the browser, the network or the clock beyond elapsed times.
const session = {
  candidate: LEVEL.id,
  candidateFingerprint: CANDIDATE_FINGERPRINT,
  fingerprintVerified: null,
  sessionId: "s-" + Math.random().toString(36).slice(2, 10),
  startedAt: new Date().toISOString(),
  attempts: [],
  completed: false,
  completedOnAttempt: null,
  discoveredRoutes: [],
};

const loadedAt = performance.now();
let previousAttemptAt = null;

// Route families as measured, from candidates/long-way-round-r22.analysis.json.
// Used only to label a winning shot in the export. It is deliberately never
// shown to the player: telling someone there is a second route would answer the
// question this playtest exists to ask.
const FAMILIES = [
  { id: "A", fromDeg: 237, toDeg: 332 },
  { id: "B", fromDeg: 28.5, toDeg: 104.5 },
];
function familyOf(angleDeg) {
  const a = ((angleDeg % 360) + 360) % 360;
  for (const f of FAMILIES) if (a >= f.fromDeg && a <= f.toDeg) return f.id;
  return null;
}

function record(attempt) {
  const now = performance.now();
  const entry = {
    ...attempt,
    secondsFromLoad: Number(((now - loadedAt) / 1000).toFixed(2)),
    secondsSincePrevious: previousAttemptAt === null
      ? null : Number(((now - previousAttemptAt) / 1000).toFixed(2)),
  };
  previousAttemptAt = now;
  delete entry.at;

  if (entry.outcome === "arrived") {
    const fam = familyOf(entry.angleDeg);
    if (fam) {
      entry.routeFamily = fam;
      if (!session.discoveredRoutes.includes(fam)) session.discoveredRoutes.push(fam);
    }
    if (!session.completed) {
      session.completed = true;
      session.completedOnAttempt = entry.attempt;
    }
  }
  session.attempts.push(entry);
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* fine */ }
}

// ---------- boot ----------
const game = createSlingshot({
  levels: [LEVEL],
  // One level, open from the start. Written out rather than reusing the shipped
  // graph, which knows nothing about this id.
  prerequisites: { [LEVEL.id]: {} },
  storageKey: PROGRESS_KEY,
  globalName: "SlingshotPlaytest",
  onAttempt: record,
});

fingerprintOf(LEVEL).then((fp) => {
  session.fingerprintVerified = fp === CANDIDATE_FINGERPRINT;
  if (!session.fingerprintVerified) {
    console.error("playtest: candidate fingerprint mismatch.\n  expected " +
      CANDIDATE_FINGERPRINT + "\n  found    " + fp +
      "\nThe geometry changed. This is a new revision and needs the numerical gates again.");
  }
});

// ---------- session controls ----------
document.getElementById("pt-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "slingshot-playtest-" + LEVEL.id + "-" + session.sessionId + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("pt-reset").addEventListener("click", () => {
  session.attempts = [];
  session.completed = false;
  session.completedOnAttempt = null;
  session.discoveredRoutes = [];
  previousAttemptAt = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* fine */ }
  game.resetProgress();
  game.goto(0);
});

// For the browser test, and for anyone wanting the session from the console.
window.SlingshotPlaytestSession = {
  get: () => JSON.parse(JSON.stringify(session)),
  keys: { progress: PROGRESS_KEY, session: SESSION_KEY },
  expectedFingerprint: CANDIDATE_FINGERPRINT,
};
