# SLINGSHOT — specification

**Status: plan only. Nothing built. Awaiting go-ahead.**

> Get the probe to the flag. You get one push — the planets do the rest.

---

## 1. Why this shape

Four previous builds failed, and the diagnosis that produced this one is:

**Classic games are built on physics you can see, predict and steer.** Any
candidate mechanic has to pass three tests:

| Test | Why it matters |
|---|---|
| **Visible** | you can watch the cause produce the effect |
| **Deterministic** | same input, same result — so you can *learn* |
| **Steerable** | your skill changes the outcome |

Quantum tunnelling (the last build) fails *deterministic* and *steerable*: a
coin flip carries no information, so missing teaches nothing. NMR dephasing
fails *visible*. Newtonian gravity passes all three cleanly, which is why
Spacewar! (1962) worked on a machine with no memory to spare.

---

## 2. The verb

**Drag to set angle and power. Release.** One gesture; one finger on a phone.
No jump, no buttons, no HUD to read.

---

## 3. Physics — measured, not assumed

Everything below was verified in a headless harness before any of this was
designed (`scratchpad/gravity*.js`).

```
a = sum over bodies of  M / r^2   toward each body
integrator: velocity Verlet, dt = 1/240 s (sub-stepped within a frame)
G folded into M, so a circular orbit at radius r needs v = sqrt(M/r)
```

| Claim | Evidence |
|---|---|
| an orbit stays an orbit | 20 laps at r=200: radius held 200.0–200.0 px, energy drift 0.000% |
| Euler would also survive | 199.8–200.2 px — but Verlet is free insurance at close approach, so use it |
| there is a crash/orbit/escape band | at M=1.6e6: crash below 50 px/s, orbits 50–130, escape above 130. An 85 px/s-wide band |
| a gravity assist really gains speed | +43 px/s off a moon moving 130 px/s (theoretical ceiling is 2×130) |
| **a level can be made provably impossible without an assist** | cap the launcher at 0.86 × escape velocity, then sweep *all* 360° × *all* powers: best achievable energy stays negative. Not a playtest — a proof |

### Scale

| Quantity | Value | Consequence |
|---|---|---|
| planet mass | 6e6 | circular speed 183 px/s at r=180 |
| planet radius | 46 px | one orbit takes **6.2 s** — brisk enough to watch |
| moon | kinematic, on a prescribed circular path | restricted three-body; the probe feels the moon, the moon ignores the probe. Standard, and honest at this mass ratio |

---

## 4. The thing that makes it learnable

This is the most important finding, and it is what the last build lacked.

Sweeping aim across level 3 (flag directly behind a planet) at fixed power:

```
 -40 deg   394 px  ################################
 -36 deg   349 px  #############################
 -28 deg   248 px  #####################
 -20 deg   128 px  ###########
 -12 deg     HIT
  -8..+8    crash        <- aiming straight at it
 +12 deg     HIT
 +20 deg   128 px  ###########
 +40 deg   394 px  ################################
```

**A clean monotone funnel on both sides.** Miss by 394 px and every step toward
−12° reduces the miss. The player cannot help but home in. Compare THROUGH,
where a bounce told you nothing at all.

**Design rule that follows:** the game must *show* the miss. After every shot the
full flight path stays on screen as a ghost, and the last five are kept. The
funnel plus the ghosts *is* the tutorial; there is no text to write.

---

## 5. Levels

Single fixed screen each (960×540). No scrolling — the whole problem is visible
at once, which is a large part of the accessibility.

| # | Setup | What it forces you to discover | Verified |
|---|---|---|---|
| 1 | no planets, flag ahead | the drag control | trivial |
| 2 | one planet off to the side | **mass bends your path** | — |
| 3 | flag directly behind the planet | you must aim *off* the target; straight ahead crashes | monotone funnel, two symmetric solution lobes at ±12° |
| 4 | crash below / escape above | there is a speed that **circles** | band 50–130 px/s at M=1.6e6 |
| 5 | flag tucked behind the planet's far side | swing around the back | — |
| 6 | two planets | small changes now matter a lot — the three-body problem, felt | — |
| 7 | **you are bound**: launcher capped below escape velocity, flag outside the system | the only way out is to **steal speed from the moving moon** | proven impossible without the moon; 11.3% of launches escape with it, largest contiguous winning region ≈50 grid cells at aim 0–50°, power 125–185 |

### Level 7 is hard, and honestly so

The winning region map (rows = power, columns = aim):

```
185 |-OOOO-----.............O..O.--OOO.....OO.......---O..-...O--
173 |OOOOO----O.............O-----.-OO...........--OO...-....OOOO
161 |OOOO----OO...........O-.-----..-OO...............O.....OOOOO
149 |OOOOOOOOO..............--------..-OO...........-..........-O
137 |.OOOOOOO...............-------....--OO.....OOO..............
125 |....O-..................---------....-----..................
113 |.........................--------...........................
     0   30   60   90  120  150  180  210  240  270  300  330  (aim, deg)
     .crash   -falls back   O ESCAPES
```

There is a real contiguous blob on the left that a player can slide into. There
is also scattered noise — genuine three-body chaos, where some wins are luck.
So level 7 gets **a full trajectory preview** (see §6) rather than the short
one, turning it from guesswork into aiming. It is the finale and is allowed to
be the hardest thing in the game.

---

## 6. What is on screen

- Planets, moons (visibly moving), a flag, the launcher. **No numbers.**
- **Aim preview:** a short dotted arc, roughly 0.6 s of flight — enough to aim,
  not enough to solve the level for you. Level 7 gets the full predicted path,
  because there it is the difference between aiming and guessing.
- **Ghost trails:** every past attempt stays as a faint line. This is the
  teaching mechanism.
- Instant retry, no lives, no failure screen, no score.
- A `physics` toggle: speed, orbital energy, and the live force vectors. Off by
  default; changes nothing about play.

---

## 7. What I will verify before calling it finished

Same discipline that caught every real bug in the last build:

1. **A hill-climbing bot** that only adjusts toward a smaller miss must solve
   levels 1–6 within a sane number of attempts. This is the accessibility test.
2. Level 7's winning region stays contiguous after any tuning.
3. 60 fps with three bodies and five ghost trails, on a phone viewport.
4. Every level solvable from a cold start with no prior knowledge.

---

## 8. Three things I need decided

1. **Level 7 difficulty.** Keep it as a genuinely hard finale with a full
   preview, or soften it (heavier moon, wider window) so more players finish?
2. **Theme.** "Probe and flag" is placeholder. It could be a rescue, a delivery,
   a comet, a postal service between moons. This changes nothing mechanical but
   a lot about whether a stranger cares.
3. **Any tie to NMR/spectroscopy, or leave it as pure orbital mechanics?** There
   is no honest connection — resonance would be the bridge, and that is a
   different game. My recommendation is to leave this one pure.

---

## 9. Effort

Smaller than the last build: one input, one screen per level, no platformer
engine, no scrolling, no touch d-pad. The physics core is already written and
verified in the harness; most of the work is presentation and the seven level
layouts.
