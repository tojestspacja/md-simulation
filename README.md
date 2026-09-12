# md-simulation — Agreement

A puzzle game whose rules **are** the mechanisms of NMR, plus the two earlier
attempts that taught me what not to do. Plain HTML5 canvas: no engine, no
dependencies, no build step.

| | What | Live |
|---|---|---|
| **Agreement** | The game. A crowd that drifts apart, a move that mirrors the fan, a reserve you spend at an angle. | [`echo/`](echo/) — [play](https://tojestspacja.github.io/md-simulation/echo/) |
| **Instrument trainer** | A real shimming drill: the lineshape tells you which shim is wrong. | [`spin/`](spin/) — [run](https://tojestspacja.github.io/md-simulation/spin/) |
| **Spin sandbox** | Free play on the engine: T1, T2, shim, offset, one-click echo / CPMG / inversion recovery. | [`spin/sandbox.html`](spin/sandbox.html) — [open](https://tojestspacja.github.io/md-simulation/spin/sandbox.html) |
| **Pixel Plumber** | The first build, a Mario-like platformer with physics zones. | [`app/`](app/) — [play](https://tojestspacja.github.io/md-simulation/app/) |

## Agreement

A crowd of things, each running at its own fixed rate. **Your score is the
length of their sum** — not how many, not how much each has, only whether they
still agree. Two moves and a dial, six rounds, each adding one rule.

### The physics, digested into rules

| What the physics says | The rule |
|---|---|
| Signal is the vector sum over the ensemble | You only score when they agree |
| Each packet precesses at its own offset | They drift apart on their own |
| A 180 degree pulse mirrors the phase fan | **REVERSE** — after the same time again they all meet |
| Mz and Mxy are one budget: `sin θ` out, `cos θ` banked | A reserve you spend at an angle |
| T1 refills slowly, T2 drains fast, T2* is reversible and T2 is not | REVERSE recovers the spreading, never the scatter |

No spectrometer appears anywhere. Every rule is a mechanism rather than a
picture of one.

### Does the physics decide it?

The test of a rule is whether the naive play fails. Measured by script:

| Round | Naive | Intended |
|---|---|---|
| 3 · echo | tip and wait → 0.01 | reverse at half time → 0.77 |
| 4 · train | one reverse → 0.87 | three reverses → 2.43 |
| 6 · reserve | all in at 90° → 2.39 | 45° → 3.60 |

Round 6 is the Ernst angle. `cos θ = exp(−TR/T1)` gives **35°** for these
numbers; the measured best play is nearer **45°**, because the Ernst angle is a
steady-state result and nine gates from a full reserve never reach steady state.
Either way 90° loses badly.

Controls: `Z` tips, `X` reverses, the slider sets the tip angle.

## The two earlier attempts, and why they failed

Kept in git history, and worth knowing before redesigning anything here.

1. **A platformer with NMR skinned on** — turned parameters into props. A 90°
   pulse became a floor pad; the receiver a hoop. Unreadable, because jumping has
   nothing to do with magnetization.
2. **A faithful instrument trainer** (still at [`spin/`](spin/), still useful) —
   the opposite error: real console, real shims, real lineshapes, no game.
3. **Agreement** — digest the physics until what is left is a rule, then build
   the game out of rules.

## Under it

All three run on one engine, [`spin/bloch.js`](spin/bloch.js): 64 packets, each
a 3-vector stepped through precession, T2 decay and T1 recovery, observable =
the vector sum. Verified against closed form — a Hahn echo peaks at 35.0 ms
against a predicted 34.6 ms and at 0.791 M0 against 0.792. (The textbook
2*tau = 40 ms is wrong; the falling T2 envelope pulls the maximum earlier by
`1/(4*pi^2*sigma^2*T2)`.)

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
- `echo/` — Agreement (`index.html`, `style.css`, `game.js`)
- `spin/` — instrument trainer (`console.js`), shared engine (`bloch.js`),
  sandbox (`sandbox.html`, `sandbox.js`)
- `app/` — Pixel Plumber
- `NOTES.md` — the models and the rules that are easy to break
- `handover.md` — where things stand and what to do next
