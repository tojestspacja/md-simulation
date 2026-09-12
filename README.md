# THROUGH

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

## Also here

- [`spin/`](spin/) — an NMR shimming trainer. A real drill: the lineshape tells
  you which shim is wrong.
- [`spin/sandbox.html`](spin/sandbox.html) — free play on a Bloch engine verified
  against closed form (Hahn echo peaks at 35.0 ms against a predicted 34.6).
- [`echo/`](echo/) — Agreement, the coherence puzzle.
- [`app/`](app/) — Pixel Plumber.

## Running locally

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploying

GitHub Pages, `main` branch, root. Every push republishes.

## Layout

- `index.html` — project page
- `quantum/` — THROUGH (`index.html`, `style.css`, `game.js`) — self-contained
- `spin/` — shimming trainer, shared Bloch engine, sandbox
- `echo/` — Agreement
- `app/` — Pixel Plumber
- `NOTES.md`, `handover.md`
