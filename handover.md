# Handover — md-simulation

Read this, then [NOTES.md](NOTES.md) for the models and the rules.

## Who and what

Yi-Tsai Liang (GitHub `tojestspacja`), **Project 1** of TIGP *Basic Skills for
Experimentalists*, 2026. The user works on **NMR and other spectroscopic
techniques** — that is why the main build is what it is.

- **Shim** (`spin/`) — the current game. Get a 500 MHz magnet to lineshape spec
  before the instrument time runs out.
- **Spin sandbox** (`spin/sandbox.html`) — free play on the Bloch engine.
- **Pixel Plumber** (`app/`) — the first, simpler game. Kept.
- **Project page** (`index.html`).

Live at <https://tojestspacja.github.io/md-simulation/>.
Class wall card lives in the `showcase-2026` repo as
`projects/tojestspacja--pixel-plumber.json` + `images/tojestspacja--pixel-plumber.png`.

## The design history, because it matters

This has been through three shapes, and the reasons are the useful part.

1. **Pixel Plumber** — a Mario platformer with physics zones. Fine, but the
   physics was flavour.
2. **Spin Runner** — an NMR platformer. The user's verdict: *"you copy all
   interface and idea from Mario, so it's very hard to follow the flow of
   thinking… I don't know how to play it by seeing the instructions… don't
   understand what physics you are trying to connect."* A teaching layer was
   added (named sequences, a live pulse-programme strip, captions, hints) which
   helped, but did not fix the root problem.
3. **The root problem, in the user's next words:** the objects were *"concepts
   rather than things that really matter… far from real machine"*. Correct
   diagnosis — **the game had turned parameters into props.** A 90° pulse was a
   floor pad; the receiver was a hoop; a paramagnetic impurity was a patrolling
   enemy. None of those are things.
4. **Shim** — the current build. The user asked for a classic game whose UI/UX
   is redesigned around *physical realization*, with the NMR physics genuinely
   deciding outcomes, and for Spin Runner to be **replaced**. The classic chosen
   was **Lunar Lander**, for its loop rather than its theme: continuous control
   of a physical quantity, a budget running down, an unforgiving target, legible
   failure. Spin Runner has been deleted (history is in git).

## State

Everything is committed, pushed and verified live except where noted below.

- Shim is playable, four samples, all four verified solvable two ways.
- Specs tuned by measurement so every shim matters (see NOTES.md §1).
- The Bloch engine is unchanged and still verified (echo 0.791 M0 @ 35.0 ms).
- Project page, README and NOTES rewritten around Shim.

### Outstanding / next

1. **The class wall card still describes Spin Runner.** It needs a new blurb and
   picture (`images/shim-console.png` is the obvious one). The blurb is capped
   at **400 characters** and `py scripts/build.py` in the `showcase-2026` clone
   enforces it. Never hand-edit `projects.json` — the Action regenerates it.
2. **The magnet panel is thin when the field profile is hidden** (samples 3–4).
   It reads as an empty box. Worth drawing more of the machine there — spinner,
   probe body, depth gauge.
3. **Only the Z shims exist.** X/Y/XZ/YZ would need a 2D sample model, and would
   teach the coupled-shim problem properly.
4. **The rest of the pre-scan is missing** and would extend the same console
   naturally: find resonance (O1), tune and match the probe (wobble curve),
   calibrate the 90° by finding the 360° null, then set RG / ns / d1 with the
   Ernst-angle trade-off. That was the original plan; only shimming got built.
5. Consider a **practice mode** with no countdown, for classroom use.

## Git identity trap

Pushes are rejected with `GH007: private email address` unless commits use the
noreply address. Both repos are configured locally already:

```
git config user.email "171763498+tojestspacja@users.noreply.github.com"
```

If a push is refused, amend with `--reset-author` and push again.

## How the user works

- They want the physics **legible and real**, and they will tell you plainly
  when it is not. Take the criticism at face value; it has been right each time.
- They prefer **being shown a decision with a reason** over being asked a third
  time. Two rounds of questions was already one too many.
- **Verified claims matter.** Every number on the project page was measured by
  driving the running build from a script. Do not assert physics you have not
  measured — and when the simulation disagrees with your back-of-envelope,
  check the algebra before assuming the code is wrong. It was the envelope that
  was wrong both times it came up.
- Do not quietly redesign away from what they picked.

## Do not break these

- Objects are settings and consequences, never props.
- The spec is judged on a measurement, never on the live truth.
- Zero-fill before quoting a linewidth.
- Plot the FID magnitude envelope, not only the real part.
- The echo peak really is at 35 ms, not 2τ = 40 ms.
- A lock-only hill climb *should* stick in a local maximum on the hard samples.

## Environment gotchas

Bash heredocs break on ASCII apostrophes; backticks in double-quoted shell
strings get command-substituted (this mangled README.md once) — use the editor
tool for prose. Node resolves `/tmp/...` to `C:\tmp\...`. Python is `py`.
Playwright lives in the session scratchpad; reinstall if it is gone.
