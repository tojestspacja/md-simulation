// Level: two of them. Two attractors either side of the line — the three-body
// case, where a small change in aim stops being a small change in outcome.
import { planet } from "../physics.js";

export default {
  id: "two-planets", name: "two of them", hint: "small changes matter a lot now",
  start: [90, 270], flag: [880, 270], flagR: 32,
  bodies: [planet(360, 160, 9e5, 34), planet(620, 390, 9e5, 34)],
  maxP: 300, maxT: 10,
};
