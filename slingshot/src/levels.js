// SLINGSHOT — the seven levels, as data.
//
// Lifted verbatim from game.js. Every geometry here was verified in a harness
// before it was drawn; test/solver.mjs is that harness, put back under version
// control so the numbers in the README can be re-earned rather than quoted.
//
// Fields:
//   start        where the probe begins
//   flag/flagR   the target, and how close counts as arriving
//   ring/ringAt  level 7 instead of a flag: leave this radius to win
//   bodies       planets and moons, in the order the integrator sees them
//   maxP         the launcher cap — level 7's is below escape velocity on purpose
//   maxT         seconds before the attempt is called
//   zoomOut      how far the camera may pull back before a shot counts as gone

import { planet, moon } from "./physics.js";

export const MOON_OM = Math.sqrt(6e6 / 460) / 460;

export const LEVELS = [
  { name: "the push", hint: "pull back from the probe, then let go",
    start: [120, 400], flag: [830, 400], flagR: 30, bodies: [], maxP: 300, maxT: 6 },

  { name: "it bends", hint: "something out there is pulling",
    start: [110, 450], flag: [860, 450], flagR: 46,
    bodies: [planet(470, 250, 9e5, 40)], maxP: 300, maxT: 8 },

  { name: "aim away", hint: "straight at it will not work",
    start: [100, 270], flag: [770, 270], flagR: 34,
    bodies: [planet(430, 270, 7e5, 34)], maxP: 300, maxT: 9 },

  { name: "the circle", hint: "too slow and you fall in, too fast and you sail past",
    start: [480, 70], flag: [480, 470], flagR: 30,
    bodies: [planet(480, 270, 1.6e6, 38)], maxP: 200, maxT: 15 },

  { name: "round the back", hint: "go the long way",
    start: [110, 460], flag: [600, 120], flagR: 32,
    bodies: [planet(470, 300, 1.5e6, 44)], maxP: 280, maxT: 11 },

  { name: "two of them", hint: "small changes matter a lot now",
    start: [90, 270], flag: [880, 270], flagR: 32,
    bodies: [planet(360, 160, 9e5, 34), planet(620, 390, 9e5, 34)],
    maxP: 300, maxT: 10 },

  { name: "the way out", hint: "your engine cannot do it. the moon can",
    start: [170, 250], ring: 1150, ringAt: [430, 250],
    bodies: [planet(430, 250, 6e6, 46), moon(430, 250, 460, 2.5e6, 34, MOON_OM, 3.14)],
    maxP: 185, maxT: 30, fullPreview: true, zoomOut: 2.6 },
];
