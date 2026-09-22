// Level: aim away. The planet sits on the line to the flag, so aiming at the
// flag crashes. This is the whole tutorial for going around something.
import { planet } from "../physics.js";

export default {
  id: "aim-away", name: "aim away", hint: "straight at it will not work",
  start: [100, 270], flag: [770, 270], flagR: 34,
  bodies: [planet(430, 270, 7e5, 34)], maxP: 300, maxT: 9,
};
