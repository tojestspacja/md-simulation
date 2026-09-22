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
//
// Boot is staged and the stage is written to <html data-boot-stage>. v1 of this
// page reached a tester and appeared to break, and the useful question was
// "how far did it get" — which nothing recorded. Now it does.

import { createSlingshot } from "../game.js";
import { LEVEL } from "../candidates/long-way-round-r22.js";

const STAGES = [];
const stage = (name) => {
  STAGES.push({ name, at: Math.round(performance.now()) });
  try { document.documentElement.dataset.bootStage = name; } catch { /* ignore */ }
};
stage("boot-module-loaded");

// Accepted at this fingerprint. Recorded in every export so a session can be
// tied to the geometry that produced it, and checked at boot so a session can
// never be attributed to the wrong revision.
const CANDIDATE_FINGERPRINT =
  "6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5";

const PROGRESS_KEY = "slingshot.playtest.long-way-round-r22";
const SESSION_KEY = "slingshot.playtest.session.long-way-round-r22";

/** Stop, visibly. A blank or frozen page tells a tester nothing and tells us
 *  less; this is a technical fallback, not gameplay UI. */
function fail(what, err) {
  const last = STAGES.length ? STAGES[STAGES.length - 1].name : "(none)";
  const detail = [
    "stage: " + last,
    "error: " + (err ? (err.name || "Error") + ": " + (err.message || String(err)) : what),
    "candidate: " + LEVEL.id,
    "expected fingerprint: " + CANDIDATE_FINGERPRINT,
    "stages: " + STAGES.map((s) => s.name + "@" + s.at + "ms").join(" > "),
  ].join("\n");
  console.error("playtest failed to start\n" + detail, err || "");
  try {
    document.getElementById("pt-fail-detail").textContent = detail;
    document.getElementById("pt-fail").classList.add("show");
  } catch { /* the page is worse off than we thought */ }
}

window.addEventListener("error", (e) => fail("uncaught error", e.error || new Error(e.message)));
window.addEventListener("unhandledrejection", (e) =>
  fail("unhandled rejection", e.reason instanceof Error ? e.reason : new Error(String(e.reason))));

// ---------- the session record ----------
// Anonymous and local. A random id per session so several exports from one
// browser can be told apart; nothing identifies a person, and nothing is
// derived from the browser, the network or the clock beyond elapsed times.
// Math.random rather than crypto.randomUUID: universally available, and a
// collision between two of our own sessions is not a problem worth an API for.
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
  bootStages: STAGES,
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

// One record per resolved launch. createSlingshot calls this once when a flight
// ends, not once per frame; test/stress.mjs asserts that over 60 attempts.
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
  // A save the tester cannot keep is a small loss; a page that dies because
  // storage is blocked is not. Everything above already happened in memory.
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* fine */ }
}

// ---------- the banner must not cover the game ----------
// It wraps on a narrow screen, so its height is measured rather than assumed.
// Getting this wrong is what made RETRY unreachable on a phone in v1 — the tap
// landed on RESET SESSION instead.
function trackBarHeight() {
  const bar = document.getElementById("pt-bar");
  if (!bar) return;
  const apply = () => {
    const h = Math.ceil(bar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--pt-bar-h", h + "px");
  };
  apply();
  if (typeof ResizeObserver === "function") new ResizeObserver(apply).observe(bar);
  addEventListener("resize", apply);
  addEventListener("orientationchange", () => setTimeout(apply, 120));
}

// ---------- fingerprint ----------
// Same canonicalisation as test/levels-fingerprint.mjs and tools/candidate.mjs.
const canonical = (v) => Array.isArray(v) ? v.map(canonical)
  : (v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v);

async function fingerprintOf(level) {
  // crypto.subtle only exists in a secure context. Over plain http on anything
  // but localhost it is undefined, and a tester would get an unexplained
  // rejection — so this is checked rather than assumed.
  if (typeof crypto === "undefined" || !crypto.subtle)
    throw new Error("crypto.subtle unavailable — the page must be served over https");
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(level)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- go ----------
let game = null;
try {
  stage("candidate-imported");
  trackBarHeight();
  stage("bar-measured");

  game = createSlingshot({
    levels: [LEVEL],
    // One level, open from the start. Written out rather than reusing the
    // shipped graph, which knows nothing about this id.
    prerequisites: { [LEVEL.id]: {} },
    storageKey: PROGRESS_KEY,
    globalName: "SlingshotPlaytest",
    onAttempt: record,
  });
  stage("runtime-created");

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
  stage("controls-bound");
} catch (e) {
  fail("boot", e);
}

// The fingerprint is checked after the game is up, so a verification problem
// cannot stop someone playing — but it is never allowed to pass quietly. A
// session that cannot prove which geometry it was played on is not usable
// evidence, and the page says so rather than exporting a false negative.
if (game) {
  stage("fingerprint-start");
  fingerprintOf(LEVEL).then((fp) => {
    session.fingerprintVerified = fp === CANDIDATE_FINGERPRINT;
    if (session.fingerprintVerified) { stage("ready"); return; }
    fail("candidate fingerprint mismatch", new Error(
      "expected " + CANDIDATE_FINGERPRINT + ", found " + fp +
      " — the geometry changed, so this is a new revision and needs the numerical gates again"));
  }).catch((e) => {
    session.fingerprintVerified = false;
    fail("fingerprint could not be computed", e);
  });
}

// For the browser tests, and for anyone wanting the session from the console.
window.SlingshotPlaytestSession = {
  get: () => JSON.parse(JSON.stringify(session)),
  keys: { progress: PROGRESS_KEY, session: SESSION_KEY },
  expectedFingerprint: CANDIDATE_FINGERPRINT,
  stages: () => STAGES.map((s) => s.name),
  failed: () => document.getElementById("pt-fail").classList.contains("show"),
};
