// CANDIDATE — NOT SHIPPED.
//
// Chapter 1 slot C, the exploration level. This file is not imported by
// src/levels/index.js, is not in src/campaign.js, and does not appear in the
// game: the shipped campaign is still exactly seven levels and this one is not
// one of them.
//
// The id below is PROVISIONAL. Shipped ids are immutable because saved progress
// is keyed on them, and that promise only starts when a level enters
// src/levels/. Until then this may be renamed freely.
//
// The idea: the flag is up and to the right, the mass is down and to the right
// of the start. Go over the top, or fall past the mass and let it turn you up
// into the flag. Two journeys, one field.
//
// Geometry uses only what the engine already has — one start, one flag, one
// planet, the existing bounds and the existing feedback. No new control, body
// type, force or mechanic. planet() is the canonical constructor; nothing here
// reimplements physics.
//
// Measure it with the same code path as the shipped set:
//   node tools/candidate.mjs

import { planet } from "../src/physics.js";

export const LEVEL = {
  id: "long-way-round",
  name: "the long way round",
  hint: "short way or long way",
  start: [140, 300],
  flag: [510, 130],
  flagR: 28,
  bodies: [planet(430, 335, 2.1e6, 46)],
  maxP: 280,
  maxT: 12,
};

// tools/difficulty.mjs --levels expects a LEVELS array, so the candidate can be
// run through the identical measurement path as src/levels/index.js.
export const LEVELS = [LEVEL];
