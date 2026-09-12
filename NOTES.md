# NOTES — the models, and the rules that are easy to break

## 0. THROUGH (quantum/game.js) — the current build

One formula decides every wall:

```
T = exp(-ALPHA * d * sqrt(V - E))       ALPHA = 0.075
E = EMAX * (speed/VMAX)^2               EMAX  = 0.55
```

which is `T = exp(-2*kappa*d)` in game units. At full speed:

| thickness | odds |
|---|---|
| 8 px | 67% |
| 16 px | 45% |
| 30 px | 22% |
| 50 px | 8% |

45% is exactly 67% squared. Doubling the thickness squares the chance, and that
is the entire lesson the game teaches without a word of text.

Other mechanics: detectors collapse you (while watched, walls are solid); a
splitter gives you two bodies on one input; the merge scores
amp = |cos(pi*dL/LAMBDA)| with LAMBDA = 120 px.

### Rules it must keep passing

1. a naive player (hold right, jump when stuck) must finish — scratchpad/pw/through.js
2. no jargon on screen unless the physics button is on
3. never punish for something invisible: interference is a bonus, not a death
4. a hard wall must have a route round it, or it is a toll booth
5. never let the player run past the goal into a pit (there is a backstop block)

Rules 3, 4 and 5 each came from a bug the naive-player test found.

---

## 0. Agreement (echo/game.js) — the rules, and how they were tested

The design rule: **digest the physics until what is left is a game rule.** Not a
game with physics painted on (attempt 2), not a reproduction of the instrument
(attempt 3). See handover.md for why both of those failed.

| Physics | Rule |
|---|---|
| signal is the vector sum over the ensemble | you only score when they agree |
| each packet precesses at its own offset | they drift apart on their own |
| a 180 mirrors the phase fan | REVERSE: after the same time again, they meet |
| Mz/Mxy is one budget, sin out and cos banked | a reserve you spend at an angle |
| T1 slow, T2 fast, T2* reversible and T2 not | REVERSE recovers spreading, never scatter |

### The test of a rule: the naive play must fail

Measured with scratchpad/pw/agree.js, which plays every round by script:

| Round | Naive | Intended | Goal |
|---|---|---|---|
| 1 collect early | — | 0.52 | 0.45 |
| 2 watch it die | — | 0.41 | 0.35 |
| 3 the echo | tip and wait 0.01 | reverse at half 0.77 | 0.50 |
| 4 the train | one reverse 0.87 | three 2.43 | 1.35 |
| 5 irreversible | gates pay 0.68/0.48/0.28 | 1.44 | 1.25 |
| 6 the reserve | 90 deg 2.39 | 45 deg 3.60 | 2.80 |

Rounds 3, 4 and 6 are the real ones: there the obvious play loses outright.

### Round 6 and the Ernst angle

cos(theta) = exp(-TR/T1) gives 35 degrees for TR 40 ms and T1 200 ms. The
measured best play is nearer 45 degrees. That gap is **real**: the Ernst angle
is a steady-state result and nine gates from a full reserve never reach steady
state, which pays for a bolder angle early. Do not fix it to 35.

A TIP also spoils whatever transverse signal is left, which is what a spoiled
gradient echo does, and is what makes the Ernst arithmetic exact.

---


Working notes for `md-simulation`. Two independent physics models live here.

---

## 1. The shim model (`spin/console.js`) — what Shim is built on

### The field

Each shim coil adds its own axial profile to B0 along the tube. The sample runs
`z = -1 .. +1`, cut into 160 slices:

```
Z1: z                          Z3: z^3 - 0.6z
Z2: z^2 - 1/3                  Z4: z^4 - (6/7)z^2 + 3/35
```

The residual field is `E(z) = sum over shims of (aberration - dialled) * HZ_PER_UNIT * profile(z)`,
with `HZ_PER_UNIT = { Z1: 1.0, Z2: 2.2, Z3: 4.0, Z4: 6.0 }` so one unit of any
shim does comparable damage.

Slices are weighted by a flat-topped coil sensitivity `exp(-(z/0.82)^8)` — the
coil only sees the middle of the tube, which is why sample depth matters.

### The line

**The lineshape is the histogram of E(z) over the sample, convolved with the
natural Lorentzian.** Computed by direct summation on a 1000-point grid over
±50 Hz. That single fact is the whole design: the shape of the line is a
readout of which shim is wrong.

Sample T2 = 2.0 s, so the natural FWHM is 1/(pi*T2) = 0.16 Hz — far under spec,
so everything you see is the shim and not the sample.

Verified signatures (measured, not asserted):

| Mis-set | FWHM | 0.55% | Shape |
|---|---|---|---|
| Z1 by 9 | 14.1 Hz | 21.7 Hz | flat-topped rectangle |
| Z2 by 7 | 0.61 Hz | 16.0 Hz | narrow peak, broad one-sided base |
| Z3 by 4 | 5.9 Hz | 10.6 Hz | symmetric double horn |
| Z4 by 5 | 5.6 Hz | 9.8 Hz | one-sided shoulder further out |

Note the Z2 row: **FWHM barely moves while the base is wrecked.** That is not a
quirk of the model, it is why the hump test (widths at 0.55% and 0.11%) is a
separate spec from FWHM.

### Lock level

Peak height of the line, normalised to the perfectly-shimmed peak. It spans
three decades between a wrecked shim and a good one, so the meter is **log
scaled** — a linear one looks flat everywhere except the very top.

### How the levels were tuned

By measurement, using `scratchpad/pw/spectune.js`:

- for every sample, leaving **any one shim undialled must fail** the spec;
- getting **every shim within ~15% of truth must pass** it.

Both properties hold for all four samples. `solvable.js` / `solvable2.js` check
the other direction — that a hill-climb on the lock reaches spec, and that the
autoshim-then-refine route always works.

**A lock-only hill climb gets stuck in a local maximum on samples 3 and 4** — a
narrow peak on a ruined base. That is real behaviour and the reason lock-only
shimming is not enough; do not "fix" it.

---

## 2. The spin engine (`spin/bloch.js`) — what the sandbox is built on

64 spin packets (isochromats), each a 3-vector `{dnu, mx, my, mz}`:

| Call | What it does |
|---|---|
| `evolve(dt)` | each packet rotates at its own `dnu`; transverse × `exp(-dt/T2)`; `mz` relaxes with T1 |
| `pulse(deg, eff)` | rotation of every packet about x — 90° takes +z into the plane, 180° inverts `mz` *and* mirrors the phase fan |
| `seedOffsets(base, inhom)` | Gaussian spread of offsets (must not be evenly spaced, or the fan re-phases periodically and fakes an echo) |
| `setOffsets(array)` | drive the packets from an explicit field profile instead |
| `netMxyComplex()` | the **vector sum** — all a coil can see, and why dephasing costs signal without shrinking any packet |
| `spectrum(fid, hzPerPpm)` | apodize, zero-fill ×4, radix-2 FFT, fftshift |

### Verified against closed form

| Check | Predicted | Measured |
|---|---|---|
| Hahn echo peak time | 34.6 ms | 35.0 ms |
| Hahn echo peak amplitude | 0.792 M0 | 0.791 M0 |
| Spectrum peak positions | 0.00 / 2.10 ppm | 0.00 / 2.10 ppm |

**The echo timing is the subtle one.** The naive answer is 2τ = 40 ms. The
refocusing envelope does peak at 2τ, but it is multiplied by a falling
`exp(-t/T2)`, so the maximum sits earlier by `1/(4*pi^2*sigma^2*T2)` = 5.4 ms.
Do not "fix" the 35 ms.

---

## 3. Design rules (each has already been broken once)

1. **Objects must be settings and consequences, not props.** The retired
   platformer turned a 90° pulse into a floor pad and the receiver into a hoop.
   That is what made the physics unreadable. If a new object is a noun invented
   so the player has something to touch, it is wrong.
2. **The spec is judged on a measurement, never on the live truth.** Forcing the
   player to spend time measuring is the whole tension, and it is authentic.
3. **Zero-fill before quoting a linewidth.** At 512 points the bin spacing is
   7.8 Hz, so every line looks ~31 Hz wide regardless of the truth.
4. **Plot the FID magnitude envelope, not only the real part.** On resonance a
   90x leaves the magnetization along y, so the real part is a flat line and the
   FID looks broken.
5. **Tune levels by measuring, not by feel.** Every spec number in `console.js`
   came out of `spectune.js`.

---

## 4. Testing

Playwright lives in the session scratchpad under `pw/` (`npm i playwright` and
`npx playwright install chromium` if it is gone). Serve the repo root on 8124.

| Script | What it proves |
|---|---|
| `shim1.js` | the lock peaks at the true aberration; shimming there reaches spec |
| `spectune.js` | every shim matters — leaving one undialled fails the spec |
| `solvable.js` | a lock-only hill climb solves 1–2 and sticks on 3–4 (expected) |
| `solvable2.js` | perfect shims pass, and autoshim-then-refine passes, on all four |
| `echo.js` / `diag2.js` | the sandbox engine still gives 0.791 M0 at 35.0 ms, peaks on 0.00/2.10 ppm |

`window.Shim` exposes `state`, `set`, `shoot`, `goto`, `lineshapeFor`;
`window.Sandbox` exposes the sandbox equivalents. Both are read-only apart from
the setters, and all the numbers quoted anywhere came through them.

---

## 5. Environment gotchas

- **Bash heredocs break on ASCII apostrophes** in this shell. Use the curly `’`
  in prose, or write files with the editor tool.
- **Backticks inside double-quoted shell strings get command-substituted** and
  silently eat content. This mangled `README.md` once. Use the editor tool for
  anything containing markdown backticks.
- Patch scripts must actually call `fs.writeFileSync` — one printed "ok" without
  writing and cost a debugging round.
- **Node resolves `/tmp/...` to `C:\tmp\...`**, so Playwright screenshots land
  there, not in the POSIX `/tmp` the shell shows.
- Python is `py` (3.11), not `python`.
