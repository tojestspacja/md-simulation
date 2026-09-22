// Level: it bends. One planet, off the straight line, so the path curves.
import { planet } from "../physics.js";

export default {
  id: "bend", name: "it bends", hint: "something out there is pulling",
  start: [110, 450], flag: [860, 450], flagR: 46,
  bodies: [planet(470, 250, 9e5, 40)], maxP: 300, maxT: 8,
};
