# md-simulation — Shim

Browser builds, plain HTML5 canvas: no engine, no dependencies, no build step.

| | What | Live |
|---|---|---|
| **Shim** | Get a 500 MHz magnet to lineshape spec before the instrument time runs out. Real console controls; the line is the histogram of B0 over the sample. | [`spin/`](spin/) — [run](https://tojestspacja.github.io/md-simulation/spin/) |
| **Spin sandbox** | Free play on the Bloch engine: T1, T2, shim and offset sliders, one-click Hahn echo / CPMG / inversion recovery. | [`spin/sandbox.html`](spin/sandbox.html) — [open](https://tojestspacja.github.io/md-simulation/spin/sandbox.html) |
| **Pixel Plumber** | The first build: a Mario-like platformer with a low-gravity zone, a frictionless ice zone and a live physics readout. | [`app/`](app/) — [play](https://tojestspacja.github.io/md-simulation/app/) |
| **Project page** | Why it is built this way and what was verified. | [`index.html`](index.html) — [read](https://tojestspacja.github.io/md-simulation/) |

## Shim

The loop is Lunar Lander's: continuous control of a physical quantity, a budget
that runs down, an unforgiving target, and failure you can read off the screen.
The quantity is the field over the sample volume, the target is a lineshape
spec, the budget is instrument time.

**The line is the histogram of B0 across the sample**, convolved with the
natural Lorentzian. That is literally the sum `console.js` evaluates, so the
shape of the line tells you which shim is wrong:

| Shim | Field it adds | Signature |
|---|---|---|
| Z1 | `z` | flat-topped and wide |
| Z2 | `z^2 - 1/3` | narrow peak on a broad one-sided base |
| Z3 | `z^3 - 0.6z` | symmetric shoulders |
| Z4 | quartic | a one-sided shoulder further out |

Reading those is the skill the game is for.

### What the console gives you

- the **lock level** is free, continuous, and only a number — log scale, because
  peak height spans three decades between a wrecked shim and a good one;
- a **lineshape costs 8 s**, and the spec is judged on a measurement, never on
  the lock;
- **autoshim costs 45 s** and gets about two thirds of the way, like the real
  routine — it will not finish the job;
- the hump widths are read off a **x120 blow-up** of the baseline.

### Controls

Drag a shim, or click it and use the arrow keys (shift for coarse). Up/down
selects the next shim, space takes a shot.

### How the levels were tuned

Not by feel. `scratchpad/pw/spectune.js` measures, for every sample, the
lineshape you get if you leave exactly one shim undialled. The specs were then
set so that **every such case fails** while **every shim within ~15% of truth
passes**. `solvable.js` and `solvable2.js` check the other side: that a plain
hill-climb on the lock reaches spec, and that the autoshim-then-refine route
always works.

Worth knowing: a lock-only hill climb solves samples 1 and 2 and then sticks in
a **local maximum** on the harder ones — a narrow peak on a ruined base. That is
not a simulation bug, it is why lock-only shimming is not enough.

## Spin sandbox

The Bloch engine with the lid off. 64 isochromats, each a 3-vector stepped
through precession, T2 decay and T1 recovery; a pulse rotates every packet about
x; the observable is the vector sum. Verified against closed form — the Hahn
echo peaks at 35.0 ms against a predicted 34.6 ms and at 0.791 M0 against 0.792.
(The textbook 2*tau = 40 ms is wrong: the falling T2 envelope pulls the maximum
earlier by `1/(4*pi^2*sigma^2*T2)`.)

## Running locally

Serve the repository root so every path resolves:

```bash
npx serve .
# or
python -m http.server 8000
```

## Deploying

GitHub Pages, `main` branch, root. Every push republishes.

## Layout

- `index.html` — project page
- `spin/` — `index.html` + `console.js` + `style.css` (Shim), `bloch.js` (shared
  spin engine), `sandbox.html` + `sandbox.js` (free play)
- `app/` — Pixel Plumber
- `images/` — screenshots used by the project page
- `NOTES.md` — physics, model and design notes
- `handover.md` — where the work stands and what to do next
