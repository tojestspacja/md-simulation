# NOTES — physics, level layout, and the rules that are easy to break

Working notes for `md-simulation`. Written for whoever (or whatever) picks this
up next. The things in **Design rules** are the ones that have already been
broken once and cost real debugging time.

---

## 1. The spin engine (`spin/bloch.js`)

One implementation, shared by `spin/game.js` and `spin/sandbox.js`. Do not
fork it — the whole point of extracting it was to stop the game and the sandbox
drifting apart.

The magnetization is **64 independent spin packets** (isochromats), each a
3-vector `{dnu, mx, my, mz}`:

| Step | What happens |
|---|---|
| `evolve(dt)` | each packet rotates in the xy-plane at its own `dnu`; transverse part × `exp(-dt/T2)`; `mz` relaxes toward `M0/n` with T1 |
| `pulse(deg, eff)` | rotation of every packet about **x**: 90° takes +z into the plane, 180° inverts `mz` *and* mirrors the phase fan |
| `seedOffsets(base, inhom)` | gives each packet `base + spread[i]*inhom` Hz — called on a 90° so a packet keeps its chemical shift for the whole scan |
| `netMxyComplex()` | the **vector sum** over packets — this is the only thing a coil sees, and why dephasing costs signal without shrinking any packet |
| `dephase(f)` | scales transverse components only (paramagnetic relaxation enhancement) |

`spread[]` is a deterministic set of Gaussian quantiles × 0.62. It must **not**
be evenly spaced: evenly spaced offsets re-phase periodically and produce fake
recurring echoes.

### Constants that matter

```
T1 = 200 ms, T2 = 160 ms     (deliberately doped; T2 <= T1 always)
dwell = 250 us  -> spectral width 4 kHz
acq   = 512 points (128 ms per scan)
nfft  = 2048     (zero-filled x4 -> 1.95 Hz/bin)
TIME_SCALE = 0.04 spin-seconds per second of play (1:25 slow motion)
B0 = 11.7434 T, gamma/2pi = 42.577 MHz/T -> nu0 = 500.0 MHz -> 1 ppm = 500 Hz
```

Why the sample is doped: real water has T1 ≈ 1 s and T2* ≈ 10 ms, two orders
apart. Nothing playable can be built on that ratio, so the game states outright
that the sample carries a relaxation agent — which is true physics, not a fudge.

### Verified against closed form

Driven from a script through `window.SpinRunner` / `window.Sandbox`:

| Check | Predicted | Measured |
|---|---|---|
| Echo peak time | 34.6 ms | 35.0 ms |
| Echo peak amplitude | 0.792 M0 | 0.791 M0 |
| Spectrum peak positions | 0.00 and 2.10 ppm | 0.00 and 2.10 ppm |
| Linewidth, good vs bad shim | bad is broader | 15.6 vs 33.2 Hz |
| Beer–Lambert, middle cuvette | 25.5% | 25.5% |

**The echo timing is the subtle one.** The naive answer is 2τ = 40 ms. The
simulation said 35 ms and that looked like a bug for a while. It is not: the
refocusing envelope peaks at 2τ but is multiplied by a falling `exp(-t/T2)`, so
the observed maximum sits earlier by

```
1/(4 * pi^2 * sigma^2 * T2)  =  5.4 ms      (sigma = 5.43 Hz here)
```

Do not "fix" the 35 ms. It is right, and the project page explains why.

---

## 2. Level layout (`spin/game.js`)

World is 5500 px wide. Ground at `y = 400`. Player is 26 × 40.

```
x        0 ---- 940 ---- 1910 ---- 3110 ---- 3960 ---- 4710 ---- 5390
stage    1       2        3         4 (IR)   5 (Raman) 6 (UV)    detector
instr    <------ NMR 500 MHz ------>
```

- **Pits** (fall = lose a life): 1600–1680, 2450–2530, 4620–4690. All 70–80 px,
  clearable with room to spare (a full jump covers ~142 px horizontally).
- **Chemical sites:** 0.00 ppm up to x = 1900 (shim ±1.5 Hz), 2.10 ppm from
  1900–3100 (shim ±9 Hz, the badly shimmed patch).
- **Resonance gates** at 760 (0.00 ppm) and 1960 (2.10 ppm) — solid until the
  transmitter is within ±170 Hz.
- **Pulse pads:** 90° at 1010, 1330, 2060; 180° at 2270, 2430, 2960.
- **Coils:** 1160, 1450, 2620, 2750, 2880, 3010.
- **Hazards (Gd³⁺):** patrol 1500–1572 and 3028–3092 only.

### The intended solution to stage 3

Fire the 90° at 2060, **jump over** the 180° pad at 2270, take the one at 2430,
jump the pit, and the echo lands on the coils around 2750. Verified: coil
readings 0.30 / 0.45 / 0.36 / 0.29, score ~1680. Taking the 2270 pad instead
puts the echo at ~2434 — inside the pit, wasted. That is the whole puzzle.

Timing model, useful for moving things: at full speed (230 px/s),

```
spin-milliseconds = 0.1739 * pixels
echo position     = 2 * x(180) - x(90)
```

---

## 3. Design rules (each of these has already bitten)

1. **Never put a platform directly above a pulse pad.** A decorative platform at
   2150 sat over the 180° pad at 2270; the player bonked their head and could
   not skip the pad, which made the stage unsolvable as documented. All
   platforms are now deliberately clear of every pad.
2. **Pads only fire when `player.onGround`.** That is what makes "jump over a
   pad to skip it" reliable. Without it the pad fires before you are airborne.
3. **Nothing may sit at the bottom centre of the screen.** The camera pins the
   player there. The TUNE buttons were originally centred and permanently
   covered the player and the phase dial.
4. **Hints only fire when on the ground** (`checkTutorial` returns early
   otherwise), so the game never freezes mid-jump.
5. **Do not put a hazard between the 90° and the 180° of the echo lesson.** It
   wipes the coherence and the lesson with it.
6. **Plot the FID magnitude envelope, not just the real part.** On resonance a
   90x leaves the magnetization along y, so the real part is a flat line and the
   FID looks broken. Both the game scope and the sandbox draw the envelope.
7. **Zero-fill before measuring a linewidth.** At 512 points the bin spacing is
   7.8 Hz, so any line looks ~31 Hz wide no matter what. ×4 zero-filling gives
   1.95 Hz/bin.
8. **Coils do not consume themselves on an empty pass** (`sig < 0.02` skips), so
   arriving early costs time, not the coil.

---

## 4. Testing

Playwright is installed at
`C:\Users\Liang\AppData\Local\Temp\claude\c--Users-Liang-tigp-2026\<session>\scratchpad\pw`
(`npm i playwright` + `npx playwright install chromium` if it is gone).

Serve the repo root on port 8124, then the useful scripts are:

| Script | What it proves |
|---|---|
| `echo.js` | the Hahn echo peaks at 35.0 ms / 0.791 M0 |
| `diag2.js` | spectral lines land on 0.00 and 2.10 ppm, bad shim is broader |
| `autoplay2.js` | the whole level is completable without dying |
| `solve3.js` | stage 3 is solvable as intended (skip a pad, land the echo) |
| `sandbox.js` | the sandbox reproduces the same echo through the shared engine |

**Bots must press `T` to turn hints off**, otherwise the tutorial pauses the
game and the bot looks stuck. More than one "bug" in this session was a test
that had walked into a pit or a hint card.

---

## 5. Gotchas in this environment

- **Bash heredocs break on ASCII apostrophes** in this shell. Use the curly `’`
  in prose, or write files with the editor tool instead.
- **Backticks inside double-quoted shell strings get command-substituted** and
  silently eat your content. This mangled `README.md` once. Use single quotes,
  a heredoc, or the editor tool for anything containing markdown backticks.
- **Node resolves `/tmp/...` to `C:\tmp\...`** on this machine, so screenshots
  written by Playwright land in `C:\tmp`, not the POSIX `/tmp` the shell shows.
- Patch scripts must actually call `fs.writeFileSync` — an inline patch that
  printed "ok" but never wrote the file cost a debugging round.
