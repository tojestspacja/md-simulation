// SLINGSHOT — the campaign.
//
// Each level lives in a file named after its id, because the id is what is
// permanent: it keys saved progress and must never change. Order is not
// permanent, and it lives here — in this array and nowhere else.
//
// That distinction matters more than it looks. isUnlocked() in progress.js
// reads "the level before this one is completed", so the order of this array
// IS the progression: swapping two entries silently changes which level opens
// which. test/solver.mjs asserts the exact sequence for that reason, so a
// deliberate reorder has to update the test and an accidental one fails.
//
// Consumers import LEVELS from here, not the individual files. Anything that
// wants the ids in order derives them — LEVELS.map(L => L.id) — rather than
// keeping a second list that can disagree with this one.
//
// Fields, and which are safe to change:
//   id           permanent. Saved progress is keyed on it; renaming one
//                orphans a player's record of that level.
//   name         what the player sees. Free to reword.
//   hint         shown under the title. Free to reword.
//   start        where the probe begins
//   flag/flagR   the target, and how close counts as arriving
//   ring/ringAt  gravity-assist has no flag: leave this radius to win
//   bodies       planets and moons, in the order the integrator sees them
//   maxP         the launcher cap
//   maxT         seconds before the attempt is called
//   zoomOut      how far the camera may pull back before a shot counts as gone

import push from "./push.js";
import bend from "./bend.js";
import aimAway from "./aim-away.js";
import orbit from "./orbit.js";
import roundTheBack from "./round-the-back.js";
import twoPlanets from "./two-planets.js";
import gravityAssist, { MOON_OM } from "./gravity-assist.js";

export { MOON_OM };

export const LEVELS = [
  push,
  bend,
  aimAway,
  orbit,
  roundTheBack,
  twoPlanets,
  gravityAssist,
];
