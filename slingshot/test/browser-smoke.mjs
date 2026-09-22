// SLINGSHOT — does the real page actually run?
//
//   node test/browser-smoke.mjs                 serve slingshot/ locally and test it
//   node test/browser-smoke.mjs <url>           test a deployed URL instead
//
// The second net. test/solver.mjs imports src/ directly, so it proves the
// engine has not moved — it never loads game.js, never parses index.html and
// never resolves a module over HTTP. A broken import path, a missing file, a
// stray reference to something that was deleted, or a page that throws on load
// would all leave the solver perfectly green.
//
// This drives the shipped page in Chromium through window.Slingshot, the hook
// the game already exposes, and fails on anything the console would have shown
// a human.
//
// Deliberately not a physics test. Search, feasibility and fingerprints belong
// in the pure-JS solver, which is faster and does not need a browser. This asks
// only: does what the solver believes still hold inside the real game?
//
// Needs: npm install && npx playwright install chromium   (in slingshot/)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");           // slingshot/
const ARG = process.argv[2];

// The one shot whose outcome is pinned. Chosen because it is the level the
// README's funnel table is about, and -12 deg is the hit it reports.
const KNOWN = { level: 2, deg: -12, power: 200, out: "hit", best: 33.90990028292924 };
const EPS = 1e-6;                        // Math.sin/cos may differ in the last ulp

// The ids the game has shipped. Kept here as well as in solver.mjs on purpose:
// this one asserts what the browser actually serves, the other what the source
// declares, and an id is only really safe when both agree.
const EXPECTED_IDS = ["push", "bend", "aim-away", "orbit",
                      "round-the-back", "two-planets", "gravity-assist"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.error("playwright is not installed. From slingshot/:");
  console.error("  npm install && npx playwright install chromium");
  process.exit(2);
}

// ---------- a static server, so this test needs nothing else ----------
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
const url = ARG || local.url;
console.log("testing " + url + "\n");

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

// Anything a human would have seen in the console is a failure here.
const noise = [];
page.on("pageerror", (e) => noise.push("uncaught: " + e.message));
page.on("console", (m) => { if (m.type() === "error") noise.push("console: " + m.text()); });
page.on("requestfailed", (r) =>
  noise.push("request failed: " + r.url() + " " + (r.failure()?.errorText || "")));
page.on("response", (r) => {
  if (r.status() >= 400) noise.push("HTTP " + r.status() + ": " + r.url());
});

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label + (detail ? " — " + detail : ""));
};

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  // 1. the module ran at all
  const hook = await page.evaluate(() => typeof window.Slingshot);
  check(hook === "object", "page loads and game.js initialises", "window.Slingshot is " + hook);

  if (hook === "object") {
    // 2. levels come through from the shared module
    const levels = await page.evaluate(() => window.Slingshot.levels);
    check(levels === 7, "reports 7 levels", "got " + levels);

    // 3. every level switches, and 4. every level takes a shot
    let switched = 0, shot = 0;
    const seen = [];
    for (let i = 0; i < (levels || 0); i++) {
      const r = await page.evaluate((i) => {
        window.Slingshot.goto(i);
        const s = window.Slingshot.state();
        const probe = window.Slingshot.tryShot(-12, 200);
        return { level: s.level, mode: s.mode, probe };
      }, i);
      if (r.level === i && r.mode === "aim") switched++;
      if (r.probe && typeof r.probe.out === "string") shot++;
      seen.push(r.probe);
    }
    check(switched === levels, "levels 1-" + levels + " all switch to aim", switched + "/" + levels);
    check(shot === levels, "levels 1-" + levels + " all accept a shot", shot + "/" + levels);

    // 4b. stable ids are visible, and goto() takes either form
    const ids = await page.evaluate(() =>
      typeof window.Slingshot.levelIds === "function" ? window.Slingshot.levelIds() : null);
    check(Array.isArray(ids) && ids.length === levels && ids.every((s) => SLUG.test(s)),
      "exposes " + levels + " stable ids", Array.isArray(ids) ? ids.join(", ") : "missing");
    check(Array.isArray(ids) && new Set(ids).size === (ids || []).length,
      "ids are unique", Array.isArray(ids) ? new Set(ids).size + " distinct" : "n/a");
    check(Array.isArray(ids) && EXPECTED_IDS.every((w) => ids.includes(w)),
      "the shipped ids are all still present", EXPECTED_IDS.join(", "));

    if (Array.isArray(ids)) {
      // goto(index) and goto(id) must land on the same LEVELS entry
      let agree = 0;
      const disagreed = [];
      for (let i = 0; i < levels; i++) {
        const r = await page.evaluate(({ i, id }) => {
          window.Slingshot.goto(i);
          const byIndex = window.Slingshot.state();
          window.Slingshot.goto(id);
          const byId = window.Slingshot.state();
          return { byIndex: [byIndex.level, byIndex.levelId],
                   byId: [byId.level, byId.levelId] };
        }, { i, id: ids[i] });
        if (r.byIndex[0] === r.byId[0] && r.byIndex[1] === r.byId[1] && r.byIndex[1] === ids[i]) agree++;
        else disagreed.push(i + ": " + JSON.stringify(r));
      }
      check(agree === levels, "goto(index) and goto(id) select the same level",
        agree + "/" + levels + (disagreed.length ? "  " + disagreed.join("; ") : ""));

      // a bad reference must fail loudly, not quietly load something else
      const rejects = await page.evaluate(() => {
        const tried = (fn) => { try { fn(); return false; } catch { return true; } };
        return {
          badIndex: tried(() => window.Slingshot.goto(99)),
          badId: tried(() => window.Slingshot.goto("no-such-level")),
        };
      });
      check(rejects.badIndex && rejects.badId, "an unknown index or id is rejected",
        "index:" + rejects.badIndex + " id:" + rejects.badId);
    }

    // 5. the pinned case still lands
    const k = seen[KNOWN.level];
    const near = k && k.out === KNOWN.out && Math.abs(k.best - KNOWN.best) < EPS;
    check(near, "level " + (KNOWN.level + 1) + " at " + KNOWN.deg + " deg / " + KNOWN.power +
      " still " + KNOWN.out, k ? k.out + " best=" + k.best : "no result");

    // 6. a real drag launches, the probe moves, tries increments
    const flight = await page.evaluate(() => new Promise((resolve) => {
      window.Slingshot.goto(0);
      const before = window.Slingshot.state().tries;
      const cv = document.getElementById("sky");
      const b = cv.getBoundingClientRect();
      const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
        clientX: b.left + x, clientY: b.top + y, bubbles: true, pointerId: 1, isPrimary: true }));
      ev("pointerdown", 140, 400); ev("pointermove", 60, 400); ev("pointerup", 60, 400);
      const t0 = performance.now(); const pts = [];
      (function tick() {
        const s = window.Slingshot.state();
        if (s.probe) pts.push([Math.round(s.probe.x), Math.round(s.probe.y)]);
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else resolve({ before, after: window.Slingshot.state().tries, moved: pts.length,
                       spread: pts.length ? Math.abs(pts[pts.length - 1][0] - pts[0][0]) : 0 });
      })();
    }));
    check(flight.moved >= 5, "a drag launches and the probe flies",
      flight.moved + " frames, moved " + flight.spread + " px");
    check(flight.after > flight.before, "the launch counts as an attempt",
      flight.before + " -> " + flight.after);
  }

  // 7. nothing in the console, no 404 on a module
  check(noise.length === 0, "no page errors or failed requests",
    noise.length ? "\n         " + noise.join("\n         ") : "clean");
} finally {
  await browser.close();
  if (local) local.server.close();
}

if (fails.length) {
  console.error("\nFAIL\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("\nPASS — the real page loads its modules and plays.");
