// SLINGSHOT playtest — does it survive a session, not just a shot?
//
//   node test/stress.mjs [base-url] [--attempts 60] [--engine chromium]
//
// The smoke tests take one shot. A tester takes dozens, and the failures that
// matter over a session are the ones that accumulate: a second animation loop,
// listeners added on every retry, a trail array that never resets, one launch
// recorded many times. None of those show up in a single attempt.
//
// So: drive many real launches through the real input path, then ask whether
// anything grew that should not have.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ARG = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const argOf = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const ATTEMPTS = Number(argOf("attempts", 60));
const ENGINE = argOf("engine", "chromium");

const pw = await import("playwright");
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
      res.writeHead(200, { "content-type":
        (TYPES[file.slice(file.lastIndexOf("."))] || "application/octet-stream") + "; charset=utf-8" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: "http://127.0.0.1:" + server.address().port + "/" };
}

const local = ARG ? null : await serve();
const base = (ARG || local.url).replace(/\/?$/, "/");
console.log("stress — " + base + "playtest/   " + ATTEMPTS + " attempts, " + ENGINE + "\n");

const browser = await pw[ENGINE].launch();
const page = await browser.newPage();
const errors = [];
let crashed = false;
page.on("pageerror", (e) => errors.push("uncaught: " + e.message.split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 140)); });
page.on("crash", () => { crashed = true; errors.push("PAGE CRASHED"); });

const fails = [];
const check = (ok, label, detail) => {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!ok) fails.push(label + (detail ? " — " + detail : ""));
};

try {
  await page.goto(base + "playtest/", { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("#ov-go").click();
  await page.waitForFunction(() => document.getElementById("ov").classList.contains("hidden"));

  const before = await page.evaluate(() => ({
    runtimes: window.SlingshotPlaytest.runtimeCount(),
    listeners: 0,
  }));

  // Vary the drag so attempts are not one shot repeated: some miss, some are
  // near the winning band, a few should arrive.
  const out = await page.evaluate(async (n) => {
    const G = window.SlingshotPlaytest;
    const cv = document.getElementById("sky");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: "touch", isPrimary: true }));

    const peakBuffers = { path: 0, sweep: 0, ghosts: 0 };
    let stuckAiming = 0;
    for (let i = 0; i < n; i++) {
      const b = cv.getBoundingClientRect();
      // sweep the drag direction around so different families get tried
      const ang = (i / n) * Math.PI * 2;
      const fx = b.left + b.width * (0.5 + 0.28 * Math.cos(ang));
      const fy = b.top + b.height * (0.5 + 0.28 * Math.sin(ang));
      ev("pointerdown", b.left + b.width * 0.5, b.top + b.height * 0.5);
      ev("pointermove", fx, fy);
      ev("pointerup", fx, fy);

      // let the flight resolve, then retry
      const t0 = performance.now();
      while (performance.now() - t0 < 4000) {
        const s = G.state();
        const bu = G.buffers();
        peakBuffers.path = Math.max(peakBuffers.path, bu.path);
        peakBuffers.sweep = Math.max(peakBuffers.sweep, bu.sweep);
        peakBuffers.ghosts = Math.max(peakBuffers.ghosts, bu.ghosts);
        if (s.mode !== "fly") break;
        await sleep(16);
      }
      if (G.state().mode === "aim" && G.state().tries === 0) stuckAiming++;
      const r = document.getElementById("b-retry");
      if (r) r.click();
      await sleep(10);
    }
    return {
      peakBuffers,
      stuckAiming,
      state: G.state(),
      buffers: G.buffers(),
      runtimes: G.runtimeCount(),
      session: window.SlingshotPlaytestSession.get(),
      failScreen: window.SlingshotPlaytestSession.failed(),
      stages: window.SlingshotPlaytestSession.stages(),
    };
  }, ATTEMPTS);

  check(!crashed, "the page did not crash");
  check(!out.failScreen, "the technical failure screen never appeared",
    out.stages.join(" > "));

  // Still alive and still animating?
  const frames = await page.evaluate(() => new Promise((res) => {
    let c = 0; const t0 = performance.now();
    (function tick() { c++; performance.now() - t0 < 700 ? requestAnimationFrame(tick) : res(c); })();
  }));
  check(frames >= 10, "frames still arriving after the session", frames + " in 700ms");

  check(out.runtimes === 1, "exactly one runtime on the page", String(out.runtimes));

  const recorded = out.session.attempts.length;
  check(recorded > 0, "attempts were recorded", String(recorded));
  // One record per launch, not per frame. A frame-driven bug would produce
  // thousands here; a duplicate-record bug, roughly double.
  check(recorded <= ATTEMPTS * 1.2,
    "one record per launch, not per frame", recorded + " records for <= " + ATTEMPTS + " launches");
  const uniq = new Set(out.session.attempts.map((a) => a.attempt + "/" + a.angleDeg + "/" + a.power));
  check(uniq.size === recorded, "no duplicated records",
    uniq.size + " unique of " + recorded);

  // Buffers that reset per attempt must not have grown across the session.
  check(out.buffers.ghosts <= 6, "ghost trails stay capped",
    "now " + out.buffers.ghosts + ", peak " + out.peakBuffers.ghosts);
  check(out.peakBuffers.path < 20000, "the trail array does not grow without bound",
    "peak " + out.peakBuffers.path);
  check(out.peakBuffers.sweep < 5000, "the sweep array does not grow without bound",
    "peak " + out.peakBuffers.sweep);

  // Retry must not have left a pointer capture or an aiming state stuck.
  check(out.state.mode === "aim" || out.state.mode === "done",
    "the runtime is in a sane state at the end", out.state.mode);

  const prod = await page.evaluate(() => localStorage.getItem("slingshot.progress"));
  check(prod === null, "production progress was never written", String(prod));

  check(errors.length === 0, "no page errors during the session",
    errors.length ? "\n         " + [...new Set(errors)].slice(0, 6).join("\n         ") : "clean");
} finally {
  await browser.close();
  if (local) local.server.close();
}

if (fails.length) { console.error("\nFAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("\nPASS — survived " + ATTEMPTS + " attempts with nothing accumulating.");
