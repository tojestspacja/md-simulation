# Handover — md-simulation

Read this, then [NOTES.md](NOTES.md).

## Who and what

Yi-Tsai Liang (GitHub `tojestspacja`), **Project 1** of TIGP *Basic Skills for
Experimentalists*, 2026. Works on **NMR and other spectroscopic techniques**.

Current state: **Agreement** (`echo/`) is the headline build. The instrument
trainer (`spin/`), the sandbox and Pixel Plumber are kept alongside it.
Live at <https://tojestspacja.github.io/md-simulation/>.

## The design history — read this before changing direction

Four shapes, three rejections. The rejections are the valuable part, because
each was a different kind of wrong and the user named each one precisely.

1. **Pixel Plumber** — Mario platformer with physics zones. Fine; physics was
   flavour.
2. **Spin Runner** — NMR platformer. *"you copy all interface and idea from
   Mario… I don't know how to play it by seeing the instructions… don't
   understand what physics you are trying to connect."* A teaching layer was
   bolted on and helped, but the root problem stood.
3. **The root problem, named by the user:** the objects were *"concepts rather
   than things that really matter… far from real machine."* Correct — the game
   had **turned parameters into props**.
4. **Shim** (`spin/`) — I over-corrected into a faithful instrument trainer:
   real console, real shim coils, real lineshapes. The user: *"you are wrong. i
   want something more creative, that you digest the underlying physics but make
   it into some game rules or objects that really matters."* Accurate again — it
   was a simulator with no game in it.
5. **Agreement** (`echo/`) — the current answer. Digest the physics until what
   remains is a *rule*, then build from rules. See NOTES.md §1.

**The lesson to carry forward:** the failure mode at each end is symmetrical.
Skin a game with physics → unreadable. Reproduce the instrument → inert. The
target is the narrow middle: rules that *are* mechanisms.

## State

Everything committed, pushed and verified live.

- Agreement: six rounds, all verified by script, with the naive play failing in
  rounds 3, 4 and 6 (that is the test of a rule — see NOTES.md §1).
- The shared engine `spin/bloch.js` is unchanged and still verified.
- Project page, README and NOTES rewritten around Agreement.

### Outstanding

1. **The class wall card is stale** — it still describes Spin Runner. Needs a
   new blurb and picture (`images/agree-echo.png` is the obvious one). Blurb is
   capped at **400 characters**; `py scripts/build.py` in the `showcase-2026`
   clone enforces it. Never hand-edit `projects.json`.
2. **Agreement has no mobile layout.** It is a 960px canvas plus a three-column
   deck; it will be cramped on a phone. Worth doing if it is to be shown around.
3. **Round 6 needs nine taps in twelve seconds.** It works but it is busy; a
   "hold to auto-tip at each gate" option would let the player think about the
   angle instead of the clicking, which is the actual lesson.
4. **More rules are available and unused**: selective refocusing (reverse only
   part of the crowd), the √N of signal averaging, Fourier duality (sharp in time
   = broad in frequency). Each is a genuine rule, not a reskin.

## Git identity trap

Pushes are rejected with `GH007: private email address` unless commits use the
noreply address. Both repos are configured already:

```
git config user.email "171763498+tojestspacja@users.noreply.github.com"
```

## How the user works

- They are the domain expert and their criticism has been right every time. Take
  it literally rather than defensively.
- They ask for **ideas and a decision**, not another round of questions. Two
  rounds of AskUserQuestion was already one too many; the third time they
  answered with a directive instead of picking an option.
- **Verified claims matter.** Every number quoted anywhere was measured by
  driving the running build from a script. When the simulation disagrees with a
  back-of-envelope, check the algebra first — it was the envelope that was wrong
  both times (the echo peak at 35 ms, and the 45° vs 35° tip angle).

## Do not break these

- Rules must be mechanisms, never props and never furniture.
- A round only teaches if the **naive play fails**. Test that, per round.
- Tune by measuring, never by feel.
- The echo peak really is at 35 ms, not 2τ = 40 ms.
- The in-game best tip angle really is ~45°, not the steady-state 35°.

## Environment gotchas

Bash heredocs break on ASCII apostrophes; backticks inside double-quoted shell
strings get command-substituted (this mangled README.md once) — use the editor
tool for prose. Node resolves `/tmp/...` to `C:\tmp\...`. Python is `py`.
Playwright lives in the session scratchpad; reinstall if gone. Patch scripts must
actually call `fs.writeFileSync`.
