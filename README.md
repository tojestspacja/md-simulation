# md-simulation — two physics games

Two browser games built with plain HTML5 canvas: no engine, no dependencies,
no build step. Both run on a phone as well as a laptop.

| | What | Live |
|---|---|---|
| **Spin Runner** | A spectroscopy platformer on a real Bloch-equation simulation: NMR resonance, T1, T2*, spin echoes, then IR / Raman / UV-Vis. | [`spin/`](spin/) — [play](https://tojestspacja.github.io/md-simulation/spin/) |
| **Spin sandbox** | The same engine with no goals: sliders for T1, T2, shim and offset, and one-click Hahn echo / CPMG / inversion recovery. | [`spin/sandbox.html`](spin/sandbox.html) — [open](https://tojestspacja.github.io/md-simulation/spin/sandbox.html) |
| **Pixel Plumber** | A small Mario-like platformer with a low-gravity zone, a frictionless ice zone and a live physics readout. | [`app/`](app/) — [play](https://tojestspacja.github.io/md-simulation/app/) |
| **Project page** | What they are, how the physics works, and what was verified. | [`index.html`](index.html) — [read](https://tojestspacja.github.io/md-simulation/) |

## Spin Runner

You are the sample. Stages 1–3 you are the ¹H magnetization inside a 500 MHz
magnet; stages 4–5 a vibrating molecule on the IR and Raman benches; stage 6 the
beam in a UV-Vis spectrometer.

The spin physics is simulated rather than scripted. The magnetization is carried
by 64 independent spin packets (isochromats), each a 3-vector stepped through
precession and relaxation:

- free precession at each packet's own offset, plus exponential T2 decay on the
  transverse part and T1 recovery on `mz`;
- a pulse is a rotation of every packet about the x axis, so a 90° tips `Mz`
  into the plane and a 180° both inverts `Mz` and mirrors the phase fan;
- the observable is the vector sum over packets — exactly what a coil sees,
  which is why dephasing costs signal without destroying anything;
- each 90° starts an acquisition, and scans are **co-added**, the way a
  spectrometer averages them. The results screen shows that FID and its
  Fourier transform (radix-2 FFT, zero-filled ×4).

The sample is deliberately doped (`T1 = 200 ms`, `T2 = 160 ms`) so relaxation is
fast enough to play with, and the simulation runs at 1:25 slow motion.

### How it explains itself

The first version buried the physics under a platformer. Four things fixed that:

- **every stage is titled with the real sequence** — stage 2 is
  `SINGLE-PULSE ACQUIRE · 90x – acquire`, stage 3 is
  `HAHN ECHO · 90x – tau – 180x – tau`;
- **a live pulse programme** along the bottom draws the pulses you have fired on
  a time axis, names what they add up to (single-pulse acquire, Hahn echo, CPMG,
  inversion recovery) and marks where the refocus is due;
- **a dashed ECHO marker on the floor** shows where that refocus will land at
  your current speed — the stage is simply getting it onto a detector coil;
- **every panel carries a one-line caption**, and the first time each idea
  matters the game pauses, dims everything but the thing in question, and
  explains it. `T` turns the hints off.

### Controls

- **Desktop:** arrows / `A D` to move, `space` to jump, `Q` / `E` to tune the
  transmitter, `P` for the numbers panel, `T` for hints on/off.
- **Phone:** on-screen pads — move and TUNE on the left, jump on the right.
  Landscape recommended.
- **Jump over a pulse pad to skip it.** Pads only fire when you are on the
  ground; that is how you choose tau.

### Verifying the physics yourself

The engine lives in [`spin/bloch.js`](spin/bloch.js) and is shared with the
sandbox, so there is one implementation rather than two that can drift apart.

`window.SpinRunner` exposes read-only hooks (`getState`, `constants`, `ladder`,
`cuvettes`, `spectrum`) plus `setX`, `setTune`, `pulse90`, `pulse180` and
`advance(spinSeconds)` for driving the simulation from a script. `window.Sandbox`
exposes the equivalent for the sandbox. The numbers on the project page were
measured through those hooks — e.g. the echo peaks at 35.0 ms against a
predicted 34.6 ms, and at 0.791 M0 against a predicted 0.792.

See [NOTES.md](NOTES.md) for the physics constants, the level layout and the
design rules that are easy to break.

## Running locally

Serve the repository root so every path resolves:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `/` for the project page, `/spin/` or `/app/` for the games, and
`/spin/sandbox.html` for the sandbox.

## Deploying

GitHub Pages, `main` branch, root. Every push republishes.

## Layout

- `index.html` — project page (the report for both games)
- `spin/` — Spin Runner: `index.html`, `style.css`, `game.js`, `bloch.js`
  (the shared physics), `sandbox.html` + `sandbox.js` (free play)
- `app/` — Pixel Plumber: `index.html`, `style.css`, `game.js`
- `images/` — screenshots used by the project page
- `NOTES.md` — physics, level and design notes
- `handover.md` — where the work stands and what to do next
