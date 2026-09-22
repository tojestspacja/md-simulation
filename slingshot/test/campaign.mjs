// SLINGSHOT — the progression graph, checked on its own.
//
//   node test/campaign.mjs
//
// src/campaign.js imports nothing, so this needs no save file, no level and no
// browser: a prerequisite is just ids and a predicate. Two jobs here — pin the
// campaign that ships, and prove the rule format can express the branching the
// next phase needs before any of it is built.

import { PREREQUISITES, isLevelUnlocked, levelState, campaignIds } from "../src/campaign.js";
import { LEVELS } from "../src/levels/index.js";

let failed = 0;
function ok(cond, label, detail) {
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!cond) failed++;
}
const eq = (a, b, label) => {
  const same = JSON.stringify(a) === JSON.stringify(b);
  ok(same, label, same ? JSON.stringify(a) : JSON.stringify(a) + " != " + JSON.stringify(b));
};

// A predicate over ids, which is all the evaluator ever sees.
const completed = (...ids) => { const s = new Set(ids); return (id) => s.has(id); };
const ORDER = LEVELS.map((L) => L.id);
const states = (isDone, rules) => ORDER.map((id) => levelState(id, isDone, rules));

// ---------- the campaign that ships ----------
// Written out rather than generated, so that changing a prerequisite has to
// come here and say so.
const SHIPPED = {
  "push": {},
  "bend": { requiresAll: ["push"] },
  "aim-away": { requiresAll: ["bend"] },
  "orbit": { requiresAll: ["aim-away"] },
  "round-the-back": { requiresAll: ["orbit"] },
  "two-planets": { requiresAll: ["round-the-back"] },
  "gravity-assist": { requiresAll: ["two-planets"] },
};
eq(PREREQUISITES, SHIPPED, "the shipped prerequisite graph");

// Every level has a rule, and every rule names a real level.
ok(ORDER.every((id) => Object.prototype.hasOwnProperty.call(PREREQUISITES, id)),
  "every shipped level has a campaign rule");
eq(campaignIds().filter((id) => !ORDER.includes(id)), [],
  "no rule refers to a level that does not exist");
eq(Object.keys(PREREQUISITES).filter((id) => !ORDER.includes(id)), [],
  "no rule exists for a level that does not ship");

// ---------- walking the chain ----------
eq(states(completed()),
   ["available", "locked", "locked", "locked", "locked", "locked", "locked"],
   "fresh progress: only push is open");

eq(states(completed("push")),
   ["done", "available", "locked", "locked", "locked", "locked", "locked"],
   "after push: bend opens, nothing further");

eq(states(completed("push", "bend")),
   ["done", "done", "available", "locked", "locked", "locked", "locked"],
   "after push + bend: aim-away opens");

eq(states(completed("push", "bend", "aim-away")),
   ["done", "done", "done", "available", "locked", "locked", "locked"],
   "after three: orbit opens");

eq(states(completed("push", "bend", "aim-away", "orbit")),
   ["done", "done", "done", "done", "available", "locked", "locked"],
   "after four: round-the-back opens");

eq(states(completed("push", "bend", "aim-away", "orbit", "round-the-back")),
   ["done", "done", "done", "done", "done", "available", "locked"],
   "after five: two-planets opens");

eq(states(completed("push", "bend", "aim-away", "orbit", "round-the-back", "two-planets")),
   ["done", "done", "done", "done", "done", "done", "available"],
   "after six: gravity-assist opens");

eq(states(completed(...ORDER)), ORDER.map(() => "done"), "everything finished");

// A level that is somehow completed without its prerequisite stays done rather
// than re-locking — finishing it is a fact, and a later rebalance must not take
// it back. It still opens nothing after it: the chain is about prerequisites,
// not about how many you have finished.
eq(states(completed("gravity-assist")),
   ["available", "locked", "locked", "locked", "locked", "locked", "done"],
   "a completed level stays done even if its prerequisite is not");
ok(!isLevelUnlocked("gravity-assist", completed("gravity-assist")),
  "though the prerequisite itself is still unmet");

// ---------- unknown ids ----------
ok(!isLevelUnlocked("no-such-level", completed(...ORDER)),
  "an unknown id is locked even with everything completed");
ok(!isLevelUnlocked("", completed(...ORDER)), "an empty id is locked");
ok(levelState("no-such-level", completed(...ORDER)) === "locked",
  "an unknown id renders as locked");
ok(!isLevelUnlocked("toString", completed()),
  "an inherited property name is not a rule");

// ---------- the format the next phase needs ----------
// Test data only. None of this ships; it exists to show the rule format can
// already express a chapter before one is built:
//
//   entry -> A, B, C in parallel -> capstone needs any 2 -> expert is optional
const BRANCHING = {
  "entry": {},
  "a": { requiresAll: ["entry"] },
  "b": { requiresAll: ["entry"] },
  "c": { requiresAll: ["entry"] },
  "capstone": { requiresAny: { ids: ["a", "b", "c"], count: 2 } },
  "expert": { requiresAll: ["capstone"], requiresAny: { ids: ["a", "b", "c"], count: 3 } },
  "next-entry": { requiresAll: ["capstone"] },
};
const br = (isDone, id) => isLevelUnlocked(id, isDone, BRANCHING);

ok(br(completed(), "entry"), "branching: the entry is open from the start");
ok(!br(completed(), "a"), "branching: a parallel level needs the entry");

{
  const p = completed("entry");
  ok(br(p, "a") && br(p, "b") && br(p, "c"), "branching: the entry opens all three at once");
  ok(!br(p, "capstone"), "branching: none of the three done, capstone locked");
}
ok(!br(completed("entry", "a"), "capstone"), "branching: one of three is not enough");
ok(br(completed("entry", "a", "b"), "capstone"), "branching: any two of three opens the capstone");
ok(br(completed("entry", "b", "c"), "capstone"), "branching: a different two also works");
ok(br(completed("entry", "a", "b", "c"), "capstone"), "branching: all three works too");

// Both clauses must hold when both are present.
ok(!br(completed("entry", "a", "b", "capstone"), "expert"),
  "branching: expert needs all three, not just the capstone");
ok(br(completed("entry", "a", "b", "c", "capstone"), "expert"),
  "branching: expert opens once all three and the capstone are done");
ok(br(completed("entry", "a", "b", "capstone"), "next-entry"),
  "branching: the next chapter does not wait for the optional expert");

// Chapter completion is derived, never stored: a chapter is done when its
// capstone is.
ok(completed("entry", "a", "b", "capstone")("capstone"),
  "branching: chapter completion reads as its capstone being completed");

// A threshold that cannot be met stays locked rather than defaulting to open.
ok(!isLevelUnlocked("x", completed("a", "b", "c"),
  { x: { requiresAny: { ids: ["a", "b", "c"], count: 4 } } }),
  "branching: a count larger than the group never unlocks");

console.log(failed ? "\nFAIL — " + failed + " check(s)" : "\nPASS — campaign rules behave.");
process.exit(failed ? 1 : 0);
