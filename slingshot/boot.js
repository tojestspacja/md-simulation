// SLINGSHOT — the production entry.
//
// The shipped seven, the shipped unlock graph, the shipped save. Nothing here
// is conditional on a candidate existing: an experimental level is wired up by
// its own boot file on its own page, never by a flag in this one.
import { createSlingshot } from "./game.js";
import { LEVELS } from "./src/levels/index.js";
import { PREREQUISITES } from "./src/campaign.js";
import { STORAGE_KEY } from "./src/progress.js";

createSlingshot({
  levels: LEVELS,
  prerequisites: PREREQUISITES,
  storageKey: STORAGE_KEY,
});
