// CANDIDATE — NOT SHIPPED.
//
// Refinement of candidates/long-way-round.js. One number differs: the flag
// radius, 28 -> 22. Everything else — start, flag position, the mass, the
// launcher cap, the time limit — is identical, so this is the same puzzle with
// a smaller target rather than a different puzzle.
//
// Why: at flagR 28 the seeded search found it in a median of 37 shots, below
// every level it would sit beside (aim-away 56, bend 78, round-the-back 78). A
// trio in which one level is visibly the cheapest is not a choice, it is a
// default, and the "complete any two" branch stops meaning anything.
//
// Both variants are kept and measured. Neither is in src/levels/, in
// src/campaign.js, or in the game; the id is still provisional.

import { planet } from "../src/physics.js";

export const LEVEL = {
  id: "long-way-round-r22",
  name: "the long way round",
  hint: "short way or long way",
  start: [140, 300],
  flag: [510, 130],
  flagR: 22,
  bodies: [planet(430, 335, 2.1e6, 46)],
  maxP: 280,
  maxT: 12,
};

export const LEVELS = [LEVEL];
