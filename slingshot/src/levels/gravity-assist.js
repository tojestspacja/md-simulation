// Level: the way out. No flag — leave the ring at r = 1150 instead.
//
// maxP is capped at 185 on purpose: that is below escape velocity here, so the
// furthest any launch can reach on its own is r = 1006, analytically and by
// brute force over every angle and power. The moon is the only way out, and
// test/solver.mjs re-derives that number rather than trusting this comment.
import { planet, moon } from "../physics.js";

export const MOON_OM = Math.sqrt(6e6 / 460) / 460;

export default {
  id: "gravity-assist", name: "the way out", hint: "your engine cannot do it. the moon can",
  start: [170, 250], ring: 1150, ringAt: [430, 250],
  bodies: [planet(430, 250, 6e6, 46), moon(430, 250, 460, 2.5e6, 34, MOON_OM, 3.14)],
  maxP: 185, maxT: 30, fullPreview: true, zoomOut: 2.6,
};
