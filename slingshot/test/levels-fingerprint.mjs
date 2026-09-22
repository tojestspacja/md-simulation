// SLINGSHOT — a fingerprint of the level definitions themselves.
//
//   node test/levels-fingerprint.mjs            verify against the pinned hash
//   node test/levels-fingerprint.mjs --print    just show it
//
// The trajectory fingerprints in solver.mjs would catch a level whose geometry
// moved enough to change a flight, but they sample five fixed shots: a changed
// hint, a renamed title, a tweaked maxT or a body edited somewhere the probes
// never fly could slip past. This hashes every value in every level object, so
// a file-layout refactor can be shown to be exactly that.
//
// Keys are sorted before hashing, so reformatting or reordering fields inside
// a level object is not a change; reordering the campaign IS, because the array
// order is what isUnlocked() reads.

import { createHash } from "node:crypto";
import { LEVELS } from "../src/levels/index.js";

// Sort keys at every depth so only values and array order matter.
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]));
  return v;
}

const serialized = JSON.stringify(canonical(LEVELS));
const hash = createHash("sha256").update(serialized).digest("hex");

// Pinned from the definitions as they stood before they were split into
// per-level modules. Changing a level is allowed; changing it by accident is
// what this is here to stop.
const PINNED = "0f6359d29932bafc9b45df7ccab60d355dc07c470bee444981ac6850a556d7c8";

console.log("levels sha256      " + hash);
console.log("campaign order     " + LEVELS.map((L) => L.id).join(" -> "));

if (process.argv.includes("--print")) process.exit(0);

if (hash !== PINNED) {
  console.error("\nFAIL — the level definitions changed.");
  console.error("  pinned  " + PINNED);
  console.error("  now     " + hash);
  console.error("\nIf that was intended, update PINNED in this file and say why in the commit.");
  process.exit(1);
}
console.log("\nPASS — level definitions unchanged.");
