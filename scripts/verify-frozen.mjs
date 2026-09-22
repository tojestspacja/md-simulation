// Frozen builds must stay frozen.
//
//   node scripts/verify-frozen.mjs
//
// Two directories in this repository are historical artifacts, not live code.
// Their value is that they are exactly what was committed at the time, so a
// well-meant refactor that tidies them destroys the only thing they are for.
//
// This compares the blob hash of each file against the commit it is pinned to,
// which is the same check git itself would make, and says so out loud.

import { execFileSync } from "node:child_process";

const FROZEN = [
  { dir: "games/mario-classic", at: "a147605", from: "",
    why: "Pixel Plumber as first committed, before any physics" },
  { dir: "app", at: "926e119", from: "app/",
    why: "Pixel Plumber with the physics zones" },
];

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

let bad = 0;
for (const f of FROZEN) {
  const files = git("ls-tree", "-r", "--name-only", "HEAD", f.dir + "/")
    .split("\n").filter(Boolean);
  if (!files.length) { console.error("MISSING  " + f.dir); bad++; continue; }

  console.log(f.dir + "/  pinned to " + f.at + " — " + f.why);
  for (const path of files) {
    const base = path.slice(f.dir.length + 1);
    const want = f.at + ":" + f.from + base;
    let a, b;
    try { a = git("rev-parse", want); } catch { console.error("  ?  no " + want); bad++; continue; }
    b = git("rev-parse", "HEAD:" + path);
    if (a === b) console.log("  ok " + base.padEnd(14) + a);
    else { console.error("  !! " + base + "  pinned=" + a + "  now=" + b); bad++; }
  }
}

if (bad) {
  console.error("\nFAIL — " + bad + " frozen file(s) no longer match. Revert them; do not re-pin.");
  process.exit(1);
}
console.log("\nPASS — frozen builds unchanged.");
