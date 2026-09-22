// SLINGSHOT — what the player has done, kept between visits.
//
// Keyed on the immutable ids in src/levels/, never on array position. The whole
// reason this module exists separately is that the stored shape has to outlive
// the order of the campaign: insert a level at position three and an
// index-keyed save silently starts describing the wrong levels.
//
//   {
//     schemaVersion: 1,
//     levels: {
//       "push": { completed: true,  bestTries: 2 },
//       "bend": { completed: false, bestTries: null }
//     }
//   }
//
// Unlock state is NOT stored. It is derived from completion, so the rule can
// change — chapters, branching, a level that needs two predecessors — without
// every existing save becoming wrong. Storing a frontier would freeze today's
// rule into every player's save file.
//
// Everything here is a pure function over a progress object except load/save,
// which are the only two that touch storage.

export const STORAGE_KEY = "slingshot.progress";
export const SCHEMA_VERSION = 1;

export const defaultProgress = () => ({ schemaVersion: SCHEMA_VERSION, levels: {} });

// localStorage throws rather than returning null in a few real situations —
// Safari private mode on write, and any browser with site data blocked on
// read. A save the player cannot keep is a small loss; a game that will not
// start because of it is not.
function defaultStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* blocked */ }
  return null;
}

/** Read the save. Anything unreadable, malformed or from a schema we do not
 *  know yields a clean default rather than an exception. Nothing is written
 *  here, so an unrecognised save survives on disk until the player earns a
 *  new one — better than destroying a future version's data. */
export function loadProgress(storage = defaultStorage()) {
  if (!storage) return defaultProgress();
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return defaultProgress(); }
  if (!raw) return defaultProgress();

  let data;
  try { data = JSON.parse(raw); } catch { return defaultProgress(); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return defaultProgress();
  if (data.schemaVersion !== SCHEMA_VERSION) return defaultProgress();
  if (!data.levels || typeof data.levels !== "object" || Array.isArray(data.levels))
    return defaultProgress();

  // Keep only entries that look like ours; one corrupt record should not take
  // the rest of the save with it.
  const levels = {};
  for (const [id, v] of Object.entries(data.levels)) {
    if (!v || typeof v !== "object") continue;
    const best = Number.isInteger(v.bestTries) && v.bestTries > 0 ? v.bestTries : null;
    levels[id] = { completed: v.completed === true, bestTries: best };
  }
  return { schemaVersion: SCHEMA_VERSION, levels };
}

/** Write the save. Returns whether it actually persisted. */
export function saveProgress(progress, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch { return false; }
}

export function resetProgress(storage = defaultStorage()) {
  if (storage) { try { storage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
  return defaultProgress();
}

// ---------- reading ----------
export const getLevelProgress = (progress, levelId) =>
  progress.levels[levelId] || { completed: false, bestTries: null };

export const isCompleted = (progress, levelId) => getLevelProgress(progress, levelId).completed;
export const getBestTries = (progress, levelId) => getLevelProgress(progress, levelId).bestTries;

// ---------- writing ----------
/** Record a finish. Best tries only ever improves, which is what the player
 *  already sees ("Better than last time"), so the caller is told what the
 *  previous best was rather than having to read it first. */
export function recordAttemptResult(progress, levelId, tries) {
  const prev = getLevelProgress(progress, levelId);
  const previousBest = prev.bestTries;
  const bestTries = previousBest === null ? tries : Math.min(previousBest, tries);
  progress.levels[levelId] = { completed: true, bestTries };
  return { previousBest, bestTries, improved: previousBest !== null && tries < previousBest };
}

// Unlocking deliberately does NOT live here. This module records facts about
// what the player did; which level those facts open is a campaign question,
// and knowing that "bend follows push" would tie every save to one campaign
// shape. See src/campaign.js, which takes a predicate over ids:
//
//   levelState(id, (levelId) => isCompleted(progress, levelId))
