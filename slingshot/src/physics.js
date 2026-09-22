// SLINGSHOT — the engine, and nothing that draws.
//
// Lifted verbatim from game.js so that the game and the headless solver run the
// same integrator rather than two that merely look alike. Nothing here touches
// the DOM, so it imports cleanly into Node.
//
// Velocity Verlet, which is symplectic: a central force has no torque about its
// centre, so L = r x v comes out conserved without being enforced anywhere.
// test/solver.mjs measures that rather than taking it on trust.

export const DT = 1 / 240;

// ---------- bodies ----------
export const planet = (x, y, M, r) => ({ kind: "planet", x, y, M, r });
export const moon = (cx, cy, R, M, r, omega, phase) =>
  ({ kind: "moon", cx, cy, R, M, r, omega, phase });

export const bodyAt = (b, t) => b.kind === "planet" ? [b.x, b.y]
  : [b.cx + Math.cos(b.phase + b.omega * t) * b.R,
     b.cy + Math.sin(b.phase + b.omega * t) * b.R];

export function accel(x, y, bodies, t) {
  let ax = 0, ay = 0;
  for (const b of bodies) {
    const [bx, by] = bodyAt(b, t);
    const dx = bx - x, dy = by - y;
    const r2 = Math.max(dx * dx + dy * dy, 1);
    const r = Math.sqrt(r2);
    ax += b.M * dx / (r2 * r);
    ay += b.M * dy / (r2 * r);
  }
  return [ax, ay];
}

export function integrate(s, bodies, t, dt) {
  const [ax, ay] = accel(s.x, s.y, bodies, t);
  s.x += s.vx * dt + 0.5 * ax * dt * dt;
  s.y += s.vy * dt + 0.5 * ay * dt * dt;
  const [a2, b2] = accel(s.x, s.y, bodies, t + dt);
  s.vx += 0.5 * (ax + a2) * dt;
  s.vy += 0.5 * (ay + b2) * dt;
}
