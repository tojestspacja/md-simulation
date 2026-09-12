# Handover — md-simulation

Read this first, then [NOTES.md](NOTES.md) for the physics and level detail.

## Who this is for and what it is

Yi-Tsai Liang (GitHub `tojestspacja`), **Project 1** of TIGP *Basic Skills for
Experimentalists*, 2026. The user works on **NMR and other spectroscopic
techniques**, which is why the second game is what it is.

Two games in one repo, both plain canvas, no build step:

- **Spin Runner** (`spin/`) — a spectroscopy platformer on a real Bloch
  simulation. The main piece of work.
- **Spin sandbox** (`spin/sandbox.html`) — same engine, no goals, sliders and
  one-click named experiments. Meant for a projector.
- **Pixel Plumber** (`app/`) — the first, simpler game. Kept, not retired.
- **Project page** (`index.html`) — the report covering both.

Live at <https://tojestspacja.github.io/md-simulation/>.
Class wall card: <https://tigp-experimental-methods.github.io/showcase-2026/>
(one card covering the pair, file `projects/tojestspacja--pixel-plumber.json`
in the `showcase-2026` repo, image `images/tojestspacja--pixel-plumber.png`).

## State as of the end of this session

Everything below is **done, tested and committed**, except the last deploy —
see *Immediately outstanding*.

- Bloch engine extracted to `spin/bloch.js`, shared by game and sandbox.
  Behaviour proven identical after the refactor (same echo, spectrum, autoplay).
- Teaching layer added after the user said the Mario shell hid the physics:
  stages named as real sequences, a live pulse-programme strip, an ECHO marker
  on the floor, per-panel captions, and pause-and-point hints (`T` to disable).
- Free-play sandbox built.
- Several real bugs found and fixed — a platform that made stage 3 unsolvable,
  pads that could not be skipped, a 64-iteration guard truncating the FID,
  resolution-limited linewidths, misaligned UV-Vis lanes. Details in NOTES.md.
- `README.md` and `index.html` (project page) updated to match.

### Immediately outstanding

1. **Commit and push the latest batch.** The teaching layer, `bloch.js`,
   the sandbox, the new screenshots, `NOTES.md` and this file are on disk;
   confirm with `git status` in `md-simulation` and push. GitHub Pages
   republishes from `main` root automatically (~1–2 min), then re-check
   `/`, `/spin/`, `/spin/sandbox.html`, `/app/`.
2. **Consider refreshing the wall card blurb** to mention the sandbox. Blurb is
   capped at **400 characters** — the validator (`python scripts/build.py`)
   enforces it. Do not hand-edit `projects.json`; the Action regenerates it.

## Git identity trap

Pushes are rejected with `GH007: private email address` unless commits use the
noreply address. Both repos are already configured locally:

```
git config user.email "171763498+tojestspacja@users.noreply.github.com"
```

If a push is refused, amend with `--reset-author` and push again.

## How the user works, and what they have asked for

- They want the physics **legible**, not decorative. Their exact complaint about
  the first Spin Runner: *"you copy all interface and idea from Mario, so it's
  very hard to follow the flow of thinking… I don't know how to play it by
  seeing the instructions… don't understand what physics you are trying to
  connect."* That drove the whole teaching layer.
- When offered a rebuild as a pulse-sequence puzzle, they chose to **keep the
  platformer and fix the teaching** instead. Respect that: do not quietly
  redesign it into something else.
- They asked for: experiments **named as the real thing**, **captions saying
  what each panel is**, and a **free-play sandbox**. All three are in.
- Verified claims matter to them — every physics number on the project page was
  measured by driving the deployed build from a script, not asserted.

## If you continue the work

Things that would genuinely help, roughly in order:

1. **Play it yourself and check the hint wording.** The hints have been tested
   mechanically but not read by a fresh pair of eyes for pacing. There are 11 of
   them; two fire in the first few seconds.
2. **Stage 3 is still the hardest thing to learn.** The ECHO floor marker helps
   a lot, but consider showing the coil positions on the sequence strip too, so
   the "aim the echo at a coil" idea is visible in time as well as in space.
3. **Inversion recovery has no home in the game.** The sandbox has it as a
   preset; the level never asks for a 180-then-90. A short stage where you must
   null a background signal at `tau = T1*ln2` would be the natural next lesson.
4. **Acquiring through an echo gives a modulated line** in the final spectrum.
   That is honest physics (it is why you acquire from the echo top in a real
   experiment) but it makes the results screen look messy. Either explain it on
   the results screen or start the acquisition at the echo.
5. The IR/Raman/UV stages are thinner than the NMR ones. If the user wants more
   depth in their own field, that is where the room is.

## Do not break these

Short version of NOTES.md section 3, because they are all one-line changes that
silently ruin a stage:

- no platform directly above a pulse pad;
- pads fire only when `player.onGround`;
- nothing at the bottom centre of the screen (the camera pins the player there);
- hints never fire mid-jump;
- no hazard between the 90° and the 180° of the echo lesson;
- plot the FID magnitude envelope, not only the real part;
- zero-fill before quoting a linewidth;
- the echo peak really is at 35 ms, not 2τ = 40 ms — do not "fix" it.

## Environment gotchas

- Bash heredocs here break on ASCII apostrophes; backticks inside double-quoted
  shell strings get command-substituted (this mangled `README.md` once). Use the
  editor tool for prose containing either.
- Node resolves `/tmp/...` to `C:\tmp\...`, so Playwright screenshots land there.
- Python is `py` (3.11), not `python`.
- Playwright lives in the session scratchpad; reinstall if the directory is gone.
