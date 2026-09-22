# SLINGSHOT

**One push, and the planets do the rest.**

Drag back from the probe and let go. Everything after that is Newtonian gravity
with nothing added. Seven levels; by the last one your engine is provably too
weak to leave, and the only way out is a gravity assist off a moving moon.

Play: <https://tojestspacja.github.io/md-simulation/slingshot/>

## Proved before it was drawn

A headless harness answered the design questions first, before a line of the
game existed:

| Question | Answer |
|---|---|
| does an orbit stay an orbit? | 20 laps, radius 200.0-200.0 px, 0.000% energy drift |
| is there a crash/orbit/escape band? | crash <50 px/s, orbit 50-130, escape >130 |
| does an assist gain speed? | +43 px/s off a moon moving 130 |
| can level 7 be impossible without it? | yes - furthest reachable r = 1006 analytically AND by brute force; ring at 1150 |

## What is on screen

The engine conserves `L = r x v` to 2e-12 % — velocity Verlet is symplectic and a
central force has no torque about its centre — but conserving it invisibly is
worth nothing to a player. So:

- the **trail is coloured by speed**, deep blue to white-hot, which is what makes
  a gravity assist something you watch rather than something you are told;
- every attempt leaves a **ghost marked where it came closest**, and the best one
  draws a line to the target, so the funnel is visible;
- the **physics** toggle sweeps wedges from the planet at fixed time intervals.
  They come out equal in area. That is Kepler's second law, which is the same
  statement as L being constant.

Nothing is asserted that is not computed. When you escape on level 7, the finish
screen re-flies that exact launch with the moon deleted and reports how far it
gets: r = 1006, against a boundary at 1150.

## Is it playable?

The claim is that missing tells you where to go. A bot that only ever adjusts
toward a smaller miss - no knowledge of the answer - solves all seven in
13, 15, 10, 13, 9, 40, 21 shots. The 40 is the three-body level and that spike
is deliberate.

Design rules, each earned from a bug that test found:

- the camera must never zoom out so far the level is unreadable;
- a miss must not cost more than a few seconds before you can retry;
- level N must not be harder than level N+1 (level 2 was harder than level 6);
- every level geometry gets verified in the harness before it is drawn.

## The trilogy

| | Game | Physics | Shape | Status |
|---|---|---|---|---|
| 1 | SLINGSHOT | gravity | aim and release | built |
| 2 | PRECESS | angular momentum | hold a direction | [spec](ANGULAR-SPEC.md) |
| 3 | - | resonance | timing | sketch |

Together they are the physics underneath magnetic resonance, taken apart. Each
stands alone and none of them mentions it.

---

# The earlier builds

**You can walk through walls. Sometimes.**

An ordinary platformer — run, jump, reach the light at the end — in which you are
a quantum particle. Every wall wears a number: your chance of tunnelling through
it. Thin walls are easy. Thick walls are nearly impossible. Running faster helps.

Play it: <https://tojestspacja.github.io/md-simulation/quantum/>
(any browser, phone included, about three minutes)

That number is not a difficulty knob. It is `T = exp(-2*kappa*d)` with
`kappa = sqrt(2m(V-E))/hbar` — the real tunnelling probability, with the real
exponential dependence on thickness and the real dependence on your energy.
Nobody is told that while playing. They learn in their hands that **a wall twice
as thick is not twice as hard, it squares the odds.**

## The physics, and where it hides

| Real physics | What the player experiences |
|---|---|
| Quantum tunnelling, `T = exp(-2*kappa*d)` | Walls have odds; thin is easy, thick is hopeless, speed helps |
| Measurement collapse | A detector sweeps the corridor; while its light is on you, you and the walls are solid |
| Superposition | You become two. One set of controls, two bodies, both must survive |
| Interference | When the halves rejoin, their path difference decides whether they add up or cancel |

Press the **physics** button and every number shows its working — the formula on
each wall, the energy term, the path difference. Ignore it and the game is
unchanged. Play first; the physics is underneath for anyone who looks.

## Design rules this had to pass

- **Can someone who only presses right and jump finish it?** Verified by script,
  repeatedly, in `scratchpad/pw/through.js`. Four runs out of four.
- **No jargon on screen** unless the physics button is on.
- **Never punish for something invisible.** An early version killed you when your
  two halves came back out of step — a number the player could not steer. Now it
  is a bonus for getting it right, never a death.
- **A hard wall must be a choice, not a toll booth.** The 18% wall has a route
  over the top, so thickness is something you decide about rather than grind
  against.

## The three builds before it, and why they were wrong

Kept in the repo, and honest about what they are:

1. **[Pixel Plumber](app/)** — Mario clone with physics zones. The physics was
   decoration.
2. **An NMR platformer** (deleted, in git history) — turned parameters into
   props: a pulse became a floor pad. Jumping has nothing to do with
   magnetization, so nothing read.
3. **[Shim](spin/)** and **[Agreement](echo/)** — a faithful instrument trainer
   and an abstract coherence puzzle. Both accurate; both only legible to someone
   who already knew the subject. Lost in the middle: not a real game, not a real
   instrument.

The lesson: start from a game anyone can already play, then make the hard physics
the thing that makes it good. Tunnelling is not a lesson bolted onto a
platformer — it is the best mechanic in it.

## Every game, and where it lives

**The arcade — one entry per game:**
<https://tojestspacja.github.io/md-simulation/games/>

Each game is a self-contained folder and has its own permanent URL. Nothing is
built, bundled or copied at deploy time, so **no game can overwrite another**:
a folder is a URL, and that is the whole mechanism.

| Game | Folder | URL |
|---|---|---|
| SLINGSHOT — gravity, aim and release | `slingshot/` | <https://tojestspacja.github.io/md-simulation/slingshot/> |
| THROUGH — a platformer on real tunnelling | `quantum/` | <https://tojestspacja.github.io/md-simulation/quantum/> |
| Shim — an NMR shimming trainer | `spin/` | <https://tojestspacja.github.io/md-simulation/spin/> |
| Agreement — the coherence puzzle | `echo/` | <https://tojestspacja.github.io/md-simulation/echo/> |
| **Pixel Plumber** — the Mario-style platformer, with physics zones | `app/` | <https://tojestspacja.github.io/md-simulation/app/> |
| **Mario Classic** — Pixel Plumber as first committed, no physics | `games/mario-classic/` | <https://tojestspacja.github.io/md-simulation/games/mario-classic/> |
| Bloch sandbox (a tool, not a game) | `spin/sandbox.html` | <https://tojestspacja.github.io/md-simulation/spin/sandbox.html> |

Related, in a **separate repository** so it deploys independently:
[Resonance](https://tojestspacja.github.io/mr-simulation/) — a playable explainer
for magnetic resonance in eight levels
([repo](https://github.com/tojestspacja/mr-simulation)).

### A note on Pixel Plumber, and the two versions of it

It is the first thing in this repository and it has never been replaced. It was
added in `a147605`, moved from the repository root into `app/` in `fdf1459`, and
last changed in `926e119` when the physics zones were added. `app/` on `main`
today is byte-identical to `926e119` — the later games were each added alongside
it in their own folders, never on top of it.

Both versions are now deployed, because they are different games to play:

| | `games/mario-classic/` | `app/` |
|---|---|---|
| Commit | `a147605`, byte-identical | `926e119`, byte-identical |
| Gravity | 2200 everywhere | 650 in the 🌙 zone, 2200 elsewhere |
| Friction | constant | near-zero in the 🧊 zone |
| 🔬 readout, jump trail, banners | no | yes |

`games/mario-classic/` is a straight `git show a147605:<file>` of the three
files into a folder. Nothing was adapted: `index.html` already referenced
`style.css` and `game.js` relatively, and the game draws everything on the
canvas, so it needed no path or configuration change to run from its own URL.

The difference between `a147605` and the copy that went into `app/` at
`fdf1459` is seven lines: an additive, read-only `window.PixelPlumber` debug
hook. `a147605` is used here because it is the version before anything at all
was added.

The game that *was* deleted is **Spin Runner**, replaced by Shim in `0dc74ee`.
It exists only in git history.

## Running locally

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploying

GitHub Pages, `main` branch, root. Every push republishes. There is no Action, no
build step and no generated output in this repository — what is committed is what
is served, at the path it sits at.

Adding a game is therefore: make a folder, put `index.html` in it, add a card to
`games/index.html`. Existing games are untouched by that, which is the point.

To check a deployment after pushing:

```bash
for u in / /games/ /slingshot/ /quantum/ /spin/ /echo/ /app/; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://tojestspacja.github.io/md-simulation$u")  $u"
done
```

## Layout

- `index.html` — project page (SLINGSHOT, the current Project 1 report)
- `games/` — the arcade: one card per game, the way in for everything below
- `games/mario-classic/` — Pixel Plumber at `a147605`, self-contained, frozen
- `slingshot/` — SLINGSHOT — self-contained
- `quantum/` — THROUGH (`index.html`, `style.css`, `game.js`) — self-contained
- `spin/` — shimming trainer, shared Bloch engine, sandbox
- `echo/` — Agreement
- `app/` — Pixel Plumber
- `images/` — screenshots used by the project page and the arcade
- `NOTES.md`, `handover.md`
