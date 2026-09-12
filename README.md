# md-simulation — two physics games

Two browser games built with plain HTML5 canvas: no engine, no dependencies,
no build step. Both run on a phone as well as a laptop.

| | What | Live |
|---|---|---|
| **Spin Runner** | A spectroscopy platformer on a real Bloch-equation simulation: NMR resonance, T1, T2*, spin echoes, then IR / Raman / UV-Vis. | [`spin/`](spin/) — [play](https://tojestspacja.github.io/md-simulation/spin/) |
| **Pixel Plumber** | A small Mario-like platformer with a low-gravity zone, a frictionless ice zone and a live physics readout. | [`app/`](app/) — [play](https://tojestspacja.github.io/md-simulation/app/) |
| **Project page** | What they are, how the physics works, and what was verified. | [`index.html`](index.html) — [read](https://tojestspacja.github.io/md-simulation/) |

## Spin Runner

You are the sample. Stages 1–3 you are the ¹H magnetization inside a 500 MHz
magnet; stages 4–5 a vibrating molecule on the IR and Raman benches; stage 6 the
beam in a UV-Vis spectrometer.

The spin physics is simulated rather than scripted. The magnetization is carried
by 64 independent spin packets (isochromats), each a 3-vector stepped through
precession and relaxation:

- free precession at each packet's own offset, plus `exp(-dt/T2)` on the
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

### Controls

- **Desktop:** arrows / `A D` to move, `space` to jump, `Q` / `E` to tune the
  transmitter, `P` for the numbers panel.
- **Phone:** on-screen pads — move and TUNE on the left, jump on the right.
  Landscape recommended.

### Verifying the physics yourself

`window.SpinRunner` exposes read-only hooks (`getState`, `constants`, `ladder`,
`cuvettes`, `spectrum`) plus `setX`, `setTune`, `pulse90`, `pulse180` and
`advance(spinSeconds)` for driving the simulation from a script. The numbers on
the project page were measured through those hooks, e.g. the echo peaks at
35.0 ms against a predicted 34.6 ms and at 0.791 M0 against a predicted 0.792.

## Running locally

Serve the repository root so every path resolves:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `/` for the project page, `/spin/` or `/app/` for the games.

## Deploying

GitHub Pages, `main` branch, root. Every push republishes.

## Layout

- `index.html` — project page (the report for both games)
- `spin/` — Spin Runner: `index.html`, `style.css`, `game.js`
- `app/` — Pixel Plumber: `index.html`, `style.css`, `game.js`
- `images/` — screenshots used by the project page
