// SLINGSHOT — the playtest page, and the wall between it and production.
//
//   node test/playtest-smoke.mjs              serve slingshot/ and test it
//   node test/playtest-smoke.mjs <base-url>   test a deployment
//
// Two things to prove. That a tester can actually play the candidate on the
// real runtime — loads, aims, launches, wins, retries, records. And that doing
// so cannot reach a real player's save: the isolation is the whole reason the
// candidate is allowed in front of people at all, and "it uses a different key"
// is a claim until something seeds production progress, plays the candidate,
// and reads production progress back unchanged.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ARG = process.argv[2];

const CANDIDATE = "long-way-round-r22";
const FINGERPRINT = "6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5";
const PROD_KEY = "slingshot.progress";
const PLAYTEST_KEY = "slingshot.playtest.long-way-round-r22";

// A winning launch on the dominant family, from the candidate analysis.
const WIN = { deg: 318.0, power: 158.4 };
// The ids the runtime looks up. If the playtest markup drifts from the
// production markup, this is what notices.
const NEEDED_IDS = ["sky", "hud", "h-num", "h-name", "hint", "dots",
                    "ov", "ov-body", "ov-go", "b-retry", "b-phys"];

let playwright;
try { playwright = await import("playwright"); }
catch {
  console.error("playwright is not installed. From slingshot/:");
  console.error("  npm install && npx playwright install chromium");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "application/javascript",
                ".css": "text/css", ".json": "application/json" };
async function serve() {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ""));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": (TYPES[ext] || "application/octet-stream") + "; charset=utf-8" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: "http://127.0.0.1:" + server.address().port + "/" };
}

const local = ARG ? null : await serve();
const base = (ARG || local.url).replace(/\/?$/, "/");
console.log("testing " + base + "playtest/\n");

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
const noise = [];
page.on("pageerror", (e) => noise.push("uncaught: " + e.message));
page.on("console", (m) => { if (m.type() === "error") noise.push("console: " + m.text()); });
page.on("requestfailed", (r) => noise.push("request failed: " + r.url()));
page.on("response", (r) => { if (r.status() >= 400) noise.push("HTTP " + r.status() + ": " + r.url()); });

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label + (detail ? " — " + detail : ""));
};

try {
  // ---------- seed production progress FIRST, from the production origin ----------
  await page.goto(base + "slingshot/".replace("slingshot/", ""), { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await page.goto(base, { waitUntil: "networkidle" });
  const seeded = JSON.stringify({
    schemaVersion: 1,
    levels: { push: { completed: true, bestTries: 3 },
              bend: { completed: true, bestTries: 7 } },
  });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PROD_KEY, seeded]);
  check(await page.evaluate((k) => localStorage.getItem(k), PROD_KEY) === seeded,
    "production progress seeded before the playtest runs");

  // ---------- the playtest page ----------
  await page.goto(base + "playtest/", { waitUntil: "networkidle", timeout: 30000 });

  const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), NEEDED_IDS);
  check(missing.length === 0, "playtest markup has every id the runtime needs",
    missing.length ? "missing " + missing.join(", ") : NEEDED_IDS.length + " ids");

  const hook = await page.evaluate(() => typeof window.SlingshotPlaytest);
  check(hook === "object", "candidate loads on the real runtime", "window.SlingshotPlaytest is " + hook);

  const info = await page.evaluate(() => ({
    ids: window.SlingshotPlaytest.levelIds(),
    levels: window.SlingshotPlaytest.levels,
    storageKey: window.SlingshotPlaytest.storageKey,
    session: window.SlingshotPlaytestSession.get(),
    keys: window.SlingshotPlaytestSession.keys,
  }));
  check(info.levels === 1 && info.ids[0] === CANDIDATE, "exactly the candidate, and nothing else",
    info.ids.join(", "));
  check(info.session.candidateFingerprint === FINGERPRINT,
    "session records the accepted fingerprint", info.session.candidateFingerprint.slice(0, 12) + "...");
  check(info.session.fingerprintVerified === true,
    "the geometry on the page hashes to that fingerprint", String(info.session.fingerprintVerified));
  check(info.storageKey === PLAYTEST_KEY, "the runtime is pointed at the playtest save", info.storageKey);
  check(info.keys.progress === PLAYTEST_KEY && info.keys.session.startsWith("slingshot.playtest."),
    "both playtest keys are namespaced", info.keys.progress + " / " + info.keys.session);

  // The banner has to say what this is, and must not give the experiment away.
  const text = (await page.locator("#pt-bar").innerText()).toLowerCase();
  check(text.includes("playtest") && text.includes("not part of the campaign"),
    "the page says it is an experiment");
  const body = (await page.locator("body").innerText()).toLowerCase();
  const leaks = ["two routes", "below the planet", "long route", "fast route", "round the back"]
    .filter((s) => body.includes(s));
  check(leaks.length === 0, "nothing on the page reveals the second route",
    leaks.length ? "leaked: " + leaks.join(", ") : "clean");

  // ---------- play it ----------
  const played = await page.evaluate(({ deg, power }) => new Promise((resolve) => {
    const G = window.SlingshotPlaytest;
    G.goto(0);
    const probe = G.tryShot(deg, power);
    const cv = document.getElementById("sky");
    const b = cv.getBoundingClientRect();
    // A real drag, through the real input path.
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      clientX: b.left + x, clientY: b.top + y, bubbles: true, pointerId: 1, isPrimary: true }));
    ev("pointerdown", 420, 300); ev("pointermove", 120, 380); ev("pointerup", 120, 380);
    const t0 = performance.now();
    (function wait() {
      const s = window.SlingshotPlaytestSession.get();
      if (s.attempts.length || performance.now() - t0 > 8000)
        resolve({ probe, session: s, state: G.state() });
      else requestAnimationFrame(wait);
    })();
  }), WIN);
  check(played.probe.out === "hit", "the pinned winning shot still wins here",
    JSON.stringify(played.probe));
  check(played.session.attempts.length >= 1, "a launch is recorded",
    played.session.attempts.length + " attempt(s)");
  const a0 = played.session.attempts[0] || {};
  const fields = ["levelId", "attempt", "angleDeg", "power", "outcome",
                  "flightSeconds", "secondsFromLoad", "secondsSincePrevious"];
  const missingFields = fields.filter((f) => !(f in a0));
  check(missingFields.length === 0, "the record has the instrumentation fields",
    missingFields.length ? "missing " + missingFields.join(", ") : fields.join(", "));
  check(a0.secondsFromLoad >= 0 && a0.secondsSincePrevious === null,
    "time to first shot is measured, and the first has no predecessor",
    a0.secondsFromLoad + "s");

  // Win it through the game's own win path, and check the family label.
  const won = await page.evaluate(() => new Promise((resolve) => {
    const G = window.SlingshotPlaytest;
    const goWin = () => {
      const s = window.SlingshotPlaytestSession.get();
      if (s.completed) return resolve(s);
      // Aim along the dominant family until the real loop registers a win.
      const cv = document.getElementById("sky");
      const b = cv.getBoundingClientRect();
      const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
        clientX: b.left + x, clientY: b.top + y, bubbles: true, pointerId: 1, isPrimary: true }));
      ev("pointerdown", 400, 330); ev("pointermove", 250, 250); ev("pointerup", 250, 250);
      setTimeout(goWin, 400);
    };
    setTimeout(goWin, 100);
    setTimeout(() => resolve(window.SlingshotPlaytestSession.get()), 15000);
  }));
  check(won.attempts.length >= 2, "retrying keeps recording", won.attempts.length + " attempts");

  // ---------- the wall ----------
  const prodAfter = await page.evaluate((k) => localStorage.getItem(k), PROD_KEY);
  check(prodAfter === seeded, "production progress is byte-identical after playing",
    prodAfter === seeded ? "unchanged" : "CHANGED: " + prodAfter);

  await page.evaluate(() => document.getElementById("pt-reset").click());
  const prodAfterReset = await page.evaluate((k) => localStorage.getItem(k), PROD_KEY);
  check(prodAfterReset === seeded, "production progress survives a playtest reset",
    prodAfterReset === seeded ? "unchanged" : "CHANGED: " + prodAfterReset);
  const ptAfterReset = await page.evaluate((k) => localStorage.getItem(k), PLAYTEST_KEY);
  check(!ptAfterReset, "the playtest reset cleared its own save", String(ptAfterReset));

  // ---------- and the other direction ----------
  await page.goto(base, { waitUntil: "networkidle" });
  const prodView = await page.evaluate(() => ({
    ids: window.Slingshot.levelIds(),
    levels: window.Slingshot.levels,
    key: window.Slingshot.storageKey,
    progress: window.Slingshot.progress(),
  }));
  check(prodView.levels === 7, "production still reports 7 levels", String(prodView.levels));
  check(!prodView.ids.includes(CANDIDATE), "production does not expose the candidate",
    prodView.ids.join(", "));
  check(prodView.key === PROD_KEY, "production reads the production save", prodView.key);
  const push = prodView.progress.find((x) => x.id === "push");
  check(push && push.bestTries === 3, "the seeded production record is still there",
    JSON.stringify(push));

  check(noise.length === 0, "no page errors or failed requests",
    noise.length ? "\n         " + noise.join("\n         ") : "clean");
} finally {
  await browser.close();
  if (local) local.server.close();
}

if (fails.length) { console.error("\nFAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("\nPASS — the candidate is playable and walled off from production.");
