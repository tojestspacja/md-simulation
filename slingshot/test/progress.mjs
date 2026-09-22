// SLINGSHOT — the save file, checked without a browser.
//
//   node test/progress.mjs
//
// Storage rules are easy to get wrong in ways nothing notices until a player
// loses their record: a best that gets worse, a save that throws in private
// mode, a level that re-locks. Those are all cheap to pin here; whether the
// real page is actually wired to any of it is browser-smoke's job.

import {
  STORAGE_KEY, SCHEMA_VERSION, defaultProgress,
  loadProgress, saveProgress, resetProgress,
  getLevelProgress, isCompleted, getBestTries,
  recordAttemptResult,
} from "../src/progress.js";
import { LEVELS } from "../src/levels/index.js";

const ORDER = LEVELS.map((L) => L.id);

let failed = 0;
function ok(cond, label, detail) {
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!cond) failed++;
}
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label,
  JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(b) ? "" : " != " + JSON.stringify(b)));

// A localStorage good enough to test against, plus the ways real ones fail.
const fake = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
};
const throwing = () => ({
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("quota"); },
  removeItem() { throw new Error("blocked"); },
});

console.log("storage key        " + STORAGE_KEY);
console.log("schema version     " + SCHEMA_VERSION + "\n");

// ---------- empty and broken storage ----------
eq(loadProgress(fake()), defaultProgress(), "no save yields the default");
eq(loadProgress(null), defaultProgress(), "no storage at all yields the default");
eq(loadProgress(throwing()), defaultProgress(), "storage that throws on read yields the default");
ok(saveProgress(defaultProgress(), throwing()) === false, "a save that cannot write says so");

eq(loadProgress(fake({ [STORAGE_KEY]: "{not json" })), defaultProgress(), "malformed JSON yields the default");
eq(loadProgress(fake({ [STORAGE_KEY]: "[]" })), defaultProgress(), "an array yields the default");
eq(loadProgress(fake({ [STORAGE_KEY]: "null" })), defaultProgress(), "null yields the default");
eq(loadProgress(fake({ [STORAGE_KEY]: JSON.stringify({ schemaVersion: 99, levels: { push: { completed: true } } }) })),
  defaultProgress(), "an unknown schema version yields the default");

// An unknown schema must not be destroyed on read — a future version's save
// should survive someone opening an older build.
{
  const future = JSON.stringify({ schemaVersion: 99, levels: {} });
  const s = fake({ [STORAGE_KEY]: future });
  loadProgress(s);
  ok(s.getItem(STORAGE_KEY) === future, "reading an unknown schema does not overwrite it");
}

// One corrupt record should not cost the player the rest of the save.
{
  const p = loadProgress(fake({ [STORAGE_KEY]: JSON.stringify({
    schemaVersion: 1,
    levels: { push: { completed: true, bestTries: 3 }, bend: "nonsense",
              orbit: { completed: true, bestTries: -4 } },
  }) }));
  ok(isCompleted(p, "push") && getBestTries(p, "push") === 3, "a good record survives a bad neighbour");
  ok(!isCompleted(p, "bend"), "a nonsense record is dropped");
  ok(getBestTries(p, "orbit") === null, "an impossible bestTries is dropped, not kept");
}

// ---------- recording ----------
{
  const p = defaultProgress();
  ok(!isCompleted(p, "push"), "nothing is completed to begin with");
  ok(getBestTries(p, "push") === null, "no best to begin with");
  eq(getLevelProgress(p, "push"), { completed: false, bestTries: null }, "unknown level reads as untouched");

  const first = recordAttemptResult(p, "push", 5);
  ok(first.previousBest === null && first.bestTries === 5 && !first.improved,
    "first finish records the best", JSON.stringify(first));
  ok(isCompleted(p, "push") && getBestTries(p, "push") === 5, "and it reads back");

  const better = recordAttemptResult(p, "push", 2);
  ok(better.bestTries === 2 && better.improved === true, "a better run replaces the best");

  const worse = recordAttemptResult(p, "push", 9);
  ok(worse.bestTries === 2 && worse.improved === false, "a worse run does not");
  ok(getBestTries(p, "push") === 2, "the best stayed at 2 after a worse run");
  ok(isCompleted(p, "push"), "and the level is still completed");
}

// ---------- keyed by id, not position ----------
{
  const p = defaultProgress();
  recordAttemptResult(p, "orbit", 4);
  eq(Object.keys(p.levels), ["orbit"], "the save is keyed by id");
  const round = loadProgress(fake({ [STORAGE_KEY]: JSON.stringify(p) }));
  ok(getBestTries(round, "orbit") === 4, "and survives a write/read round trip");
  ok(!JSON.stringify(p).includes('"3"'), "no array index appears in the stored shape");
}

// Unlocking is no longer this module's business — see test/campaign.mjs. What
// remains here is the fact it depends on: that completion is recorded per id.
{
  const p = defaultProgress();
  recordAttemptResult(p, ORDER[0], 3);
  ok(isCompleted(p, ORDER[0]), "completion is readable by id");
  ok(!isCompleted(p, ORDER[1]), "and does not leak to the next level");
  ok(!JSON.stringify(p).includes("reached"), "no numeric frontier is stored");
  ok(!JSON.stringify(p).includes("unlocked"), "no unlocked flag is stored");
}

// ---------- reset ----------
{
  const s = fake();
  const p = defaultProgress();
  recordAttemptResult(p, "push", 2);
  saveProgress(p, s);
  ok(s.getItem(STORAGE_KEY) !== null, "a save is written");
  const after = resetProgress(s);
  ok(s.getItem(STORAGE_KEY) === null, "reset removes it");
  eq(after, defaultProgress(), "and hands back a clean one");
  ok(resetProgress(throwing()) !== undefined, "reset survives storage that throws");
}

console.log(failed ? "\nFAIL — " + failed + " check(s)" : "\nPASS — progress storage behaves.");
process.exit(failed ? 1 : 0);
