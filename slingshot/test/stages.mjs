// SLINGSHOT — walk both pages through every stage, in every engine.
//
//   node test/stages.mjs                    both pages, local, all engines
//   node test/stages.mjs <base-url>         against a deployment
//   node test/stages.mjs <base-url> --only chromium
//
// Why this exists separately from the smoke tests: they passed while the real
// page crashed. They asked "does it load and can it take one shot" in one
// engine, headless, at desktop size. A page that renders and then dies on the
// first touch passes that and fails a human.
//
// So: every stage is judged on its own, in Chromium, Firefox and WebKit, at
// desktop size and with mobile viewport and touch emulation. A stage that never
// completes is a failure, not an infrastructure timeout.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ARG = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

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

const PAGES = [
  { name: "production", path: "", hook: "Slingshot" },
  { name: "playtest", path: "playtest/", hook: "SlingshotPlaytest" },
];
const ENGINES = ["chromium", "firefox", "webkit"].filter((e) => !ONLY || e === ONLY);
const PROFILES = [
  { name: "desktop", ctx: { viewport: { width: 1280, height: 800 } } },
  { name: "mobile", ctx: { viewport: { width: 390, height: 844 }, isMobile: true,
                           hasTouch: true, deviceScaleFactor: 3 } },
];

// Firefox does not support isMobile; drop it there rather than skipping mobile.
const ctxFor = (engine, profile) => engine === "firefox"
  ? { viewport: profile.ctx.viewport, hasTouch: profile.ctx.hasTouch,
      deviceScaleFactor: profile.ctx.deviceScaleFactor }
  : profile.ctx;

const results = [];

for (const engine of ENGINES) {
  for (const profile of PROFILES) {
    for (const page of PAGES) {
      const r = { engine, profile: profile.name, page: page.name,
                  stages: {}, errors: [], crashed: false };
      results.push(r);
      let browser;
      const stage = async (name, fn, ms = 15000) => {
        if (r.crashed) { r.stages[name] = "skipped"; return null; }
        try {
          const out = await Promise.race([
            fn(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("stage timed out after " + ms + "ms")), ms)),
          ]);
          r.stages[name] = "ok";
          return out;
        } catch (e) {
          r.stages[name] = "FAIL: " + e.message.split("\n")[0].slice(0, 120);
          return null;
        }
      };

      try {
        browser = await pw[engine].launch();
        const context = await browser.newContext(ctxFor(engine, profile));
        const p = await context.newPage();

        p.on("pageerror", (e) => r.errors.push("pageerror: " + e.message.split("\n")[0]));
        p.on("console", (m) => { if (m.type() === "error") r.errors.push("console: " + m.text().slice(0, 160)); });
        p.on("requestfailed", (q) => r.errors.push("requestfailed: " + q.url().split("/").pop()));
        p.on("response", (q) => { if (q.status() >= 400) r.errors.push("HTTP " + q.status() + ": " + q.url().split("/").pop()); });
        p.on("crash", () => { r.crashed = true; r.errors.push("PAGE CRASHED"); });
        p.on("close", () => { if (!r.done) r.errors.push("page closed unexpectedly"); });

        await stage("load", () => p.goto(base + page.path, { waitUntil: "domcontentloaded", timeout: 20000 }));
        await stage("modules", () => p.waitForFunction(
          (h) => typeof window[h] === "object", page.hook, { timeout: 15000 }));
        await stage("first-render", () => p.waitForFunction(() => {
          const c = document.getElementById("sky");
          if (!c) return false;
          const d = c.getContext("2d").getImageData(0, 0, 8, 8).data;
          return [...d].some((v, i) => i % 4 !== 3 && v > 0);   // something drawn
        }, null, { timeout: 15000 }));

        const canvas = await p.evaluate(() => {
          const c = document.getElementById("sky"), b = c.getBoundingClientRect();
          return { backing: [c.width, c.height], css: [Math.round(b.width), Math.round(b.height)],
                   dpr: window.devicePixelRatio };
        }).catch(() => null);
        r.canvas = canvas;

        // The game opens behind a full-screen overlay; a player presses launch
        // before anything else. Not doing this is what made the first run of
        // this harness look like a crash.
        await stage("dismiss-overlay", async () => {
          await p.locator("#ov-go").click({ timeout: 8000 });
          await p.waitForFunction(() => {
            const o = document.getElementById("ov");
            return o.classList.contains("hidden") || getComputedStyle(o).display === "none";
          }, null, { timeout: 5000 });
          return true;
        });

        // First interaction — the stage the smoke tests conflate with loading.
        await stage("first-pointer", async () => {
          const box = await p.locator("#sky").boundingBox();
          if (profile.name === "mobile" && engine !== "firefox") {
            await p.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.5);
          } else {
            await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
            await p.mouse.down(); await p.mouse.up();
          }
          await p.waitForTimeout(200);
          return p.evaluate((h) => window[h].state().mode, page.hook);
        });

        await stage("launch", async () => {
          const box = await p.locator("#sky").boundingBox();
          const cx = box.x + box.width * 0.45, cy = box.y + box.height * 0.6;
          if (profile.name === "mobile" && engine !== "firefox") {
            // A real drag, not a tap: down, move, up.
            await p.touchscreen.tap(cx, cy);   // warm the input path
            await p.evaluate(({ x, y }) => {
              const cv = document.getElementById("sky");
              const b = cv.getBoundingClientRect();
              const t = (type, cx2, cy2) => cv.dispatchEvent(new PointerEvent(type, {
                clientX: cx2, clientY: cy2, bubbles: true, pointerId: 1,
                pointerType: "touch", isPrimary: true }));
              t("pointerdown", b.left + b.width * 0.45, b.top + b.height * 0.6);
              t("pointermove", b.left + b.width * 0.15, b.top + b.height * 0.75);
              t("pointerup", b.left + b.width * 0.15, b.top + b.height * 0.75);
            }, { x: cx, y: cy });
          } else {
            await p.mouse.move(cx, cy); await p.mouse.down();
            await p.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.75, { steps: 6 });
            await p.mouse.up();
          }
          return p.waitForFunction((h) => window[h].state().tries > 0, page.hook, { timeout: 8000 });
        });

        await stage("trajectory", () => p.waitForFunction((h) => {
          const s = window[h].state();
          return s.probe !== null || s.mode !== "fly";
        }, page.hook, { timeout: 8000 }));

        // Frames still arriving after a launch?
        await stage("frames-after-launch", async () => {
          const n = await p.evaluate(() => new Promise((res) => {
            let c = 0; const t0 = performance.now();
            (function tick() { c++; performance.now() - t0 < 700 ? requestAnimationFrame(tick) : res(c); })();
          }));
          if (n < 5) throw new Error("only " + n + " animation frames in 700ms");
          return n;
        });

        await stage("retry", async () => {
          await p.locator("#b-retry").click({ timeout: 5000 });
          await p.waitForTimeout(150);
          return p.evaluate((h) => window[h].state().mode, page.hook);
        });

        if (page.name === "playtest") {
          await stage("session-hook", () => p.waitForFunction(
            () => typeof window.SlingshotPlaytestSession === "object", null, { timeout: 5000 }));
          await stage("fingerprint", async () => {
            const v = await p.evaluate(() => window.SlingshotPlaytestSession.get().fingerprintVerified);
            if (v !== true) throw new Error("fingerprintVerified = " + JSON.stringify(v));
            return v;
          });
          await stage("export-button", async () => {
            const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
            await p.locator("#pt-export").click({ timeout: 5000 });
            const d = await dl;
            if (!d) throw new Error("no download produced");
            return d.suggestedFilename();
          });
        }

        r.done = true;
        await context.close();
      } catch (e) {
        r.errors.push("harness: " + e.message.split("\n")[0]);
      } finally {
        if (browser) await browser.close().catch(() => {});
      }
    }
  }
}

// ---------- report ----------
const STAGES = ["load", "modules", "first-render", "dismiss-overlay", "first-pointer", "launch", "trajectory",
                "frames-after-launch", "retry", "session-hook", "fingerprint", "export-button"];
const pad = (s, n) => String(s).padEnd(n);
console.log("stage walk — " + base + "\n");
console.log(pad("engine", 10) + pad("profile", 9) + pad("page", 12) +
  STAGES.map((s) => pad(s.slice(0, 9), 10)).join(""));
console.log("-".repeat(10 + 9 + 12 + STAGES.length * 10));
let failures = 0;
for (const r of results) {
  const cells = STAGES.map((s) => {
    const v = r.stages[s];
    if (v === undefined) return pad("-", 10);
    if (v === "ok") return pad("ok", 10);
    if (v === "skipped") return pad("skip", 10);
    failures++;
    return pad("FAIL", 10);
  });
  console.log(pad(r.engine, 10) + pad(r.profile, 9) + pad(r.page, 12) + cells.join("") +
    (r.crashed ? "  CRASHED" : ""));
}

console.log("\ndetail");
for (const r of results) {
  const bad = Object.entries(r.stages).filter(([, v]) => v !== "ok" && v !== "skipped");
  if (!bad.length && !r.errors.length) continue;
  console.log("\n  " + r.engine + " / " + r.profile + " / " + r.page +
    (r.canvas ? "   canvas " + r.canvas.backing.join("x") + " backing, " +
      r.canvas.css.join("x") + " css, dpr " + r.canvas.dpr : ""));
  for (const [s, v] of bad) console.log("    " + pad(s, 20) + v);
  for (const e of [...new Set(r.errors)].slice(0, 8)) console.log("    ! " + e);
}

console.log("\ncanvas sizes");
for (const r of results) if (r.canvas)
  console.log("  " + pad(r.engine + "/" + r.profile + "/" + r.page, 34) +
    "backing " + pad(r.canvas.backing.join("x"), 12) +
    "css " + pad(r.canvas.css.join("x"), 12) + "dpr " + r.canvas.dpr);

if (local) local.server.close();
if (failures) { console.error("\nFAIL — " + failures + " stage failure(s)"); process.exit(1); }
console.log("\nPASS — every stage completed in every environment.");
