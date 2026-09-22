// Level: round the back. The flag is behind the planet from where you stand.
import { planet } from "../physics.js";

export default {
  id: "round-the-back", name: "round the back", hint: "go the long way",
  start: [110, 460], flag: [600, 120], flagR: 32,
  bodies: [planet(470, 300, 1.5e6, 44)], maxP: 280, maxT: 11,
};
