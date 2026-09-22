// SLINGSHOT — when a level becomes available.
//
// Three separate jobs, kept apart on purpose:
//
//   src/levels/    what a level IS      — geometry, bodies, the launcher cap
//   src/progress.js what the player DID — completed, best tries. Facts only.
//   this file      when a level OPENS   — prerequisites between ids
//
// Until now the third was implied by the second: unlocking read "the entry
// before this one in the LEVELS array is completed". That works for a chain
// and stops working the moment the campaign has two levels open at once, which
// is the point of chapters. It also quietly made the menu order load-bearing —
// reordering the array changed the progression.
//
// So the order of LEVELS is now presentation only, and progression is written
// down here, by id. Today the two describe the same chain. They are allowed to
// stop.
//
// This module imports nothing. It is data and one evaluator, so the rules can
// be tested without a level, a save file or a browser.
//
// A rule may carry:
//   requiresAll  every one of these ids must be completed
//   requiresAny  { ids, count } — at least `count` of these must be completed
// Both may appear; both must then be satisfied. An empty rule means the level
// is open from the start. An id with no rule at all is LOCKED, not open: a
// typo should not hand out a level.

export const PREREQUISITES = {
  "push": {},
  "bend": { requiresAll: ["push"] },
  "aim-away": { requiresAll: ["bend"] },
  "orbit": { requiresAll: ["aim-away"] },
  "round-the-back": { requiresAll: ["orbit"] },
  "two-planets": { requiresAll: ["round-the-back"] },
  "gravity-assist": { requiresAll: ["two-planets"] },
};

/** Is this level open?
 *
 *  `isCompleted` is a predicate over level ids, so this never sees a save file
 *  and progress never sees the campaign graph. Pass
 *  `(id) => isCompleted(progress, id)` from progress.js.
 *
 *  `rules` is swappable so tests can evaluate a branching campaign without one
 *  being shipped. */
export function isLevelUnlocked(levelId, isCompleted, rules = PREREQUISITES) {
  const rule = Object.prototype.hasOwnProperty.call(rules, levelId) ? rules[levelId] : null;
  if (!rule) return false;                       // unknown id: locked, never open

  if (rule.requiresAll && !rule.requiresAll.every((id) => isCompleted(id))) return false;

  if (rule.requiresAny) {
    const { ids = [], count = 1 } = rule.requiresAny;
    if (ids.filter((id) => isCompleted(id)).length < count) return false;
  }
  return true;
}

/** What the level indicator shows for one level: the campaign answer and the
 *  progress answer combined. Whether it is the level being played is runtime
 *  and stays out of here — the two are independent, since the level you are on
 *  may also be one you have already finished. */
export function levelState(levelId, isCompleted, rules = PREREQUISITES) {
  // Completion wins over the prerequisites. Finishing a level is a fact about
  // the player and nothing should take it back — if the campaign is later
  // rebalanced so that a level someone has already beaten now sits behind a
  // prerequisite they skipped, it stays done and stays replayable rather than
  // re-locking. In the linear campaign that ships, the two can never disagree.
  if (isCompleted(levelId)) return "done";
  return isLevelUnlocked(levelId, isCompleted, rules) ? "available" : "locked";
}

/** Every id the campaign mentions, whether as a level or as a prerequisite.
 *  Used by the tests to check the graph against the shipped levels. */
export function campaignIds(rules = PREREQUISITES) {
  const ids = new Set(Object.keys(rules));
  for (const rule of Object.values(rules)) {
    for (const id of rule.requiresAll || []) ids.add(id);
    for (const id of (rule.requiresAny && rule.requiresAny.ids) || []) ids.add(id);
  }
  return [...ids];
}
