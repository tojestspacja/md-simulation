// Level: the circle. Start above, flag below, planet between: too slow and you
// fall in, too fast and you sail past. The band between them is the lesson.
import { planet } from "../physics.js";

export default {
  id: "orbit", name: "the circle", hint: "too slow and you fall in, too fast and you sail past",
  start: [480, 70], flag: [480, 470], flagR: 30,
  bodies: [planet(480, 270, 1.6e6, 38)], maxP: 200, maxT: 15,
};
