# Handover — md-simulation

Read this, then [NOTES.md](NOTES.md).

## Who and what

Yi-Tsai Liang (GitHub `tojestspacja`), **Project 1** of TIGP *Basic Skills for
Experimentalists*, 2026. Works on NMR and other spectroscopic techniques.

**Current build: THROUGH** (`quantum/`) — a platformer where you are a quantum
particle and walls are only probably solid. Live at
<https://tojestspacja.github.io/md-simulation/quantum/>.

Earlier builds kept and still playable: `spin/` (shimming trainer),
`spin/sandbox.html` (Bloch sandbox), `echo/` (Agreement), `app/` (Pixel Plumber).

## The brief, in the user's words

> *"i want to turn some hard physics into some classics games like (but not
> necessarily is) Mario accessible to general public"*

Three constraints, and the third is the one that took four attempts to hear:
**a classic game shape**, **hard physics**, and **accessible to the general
public**.

## The design history — read before changing direction

| Build | What it was | Why it was wrong |
|---|---|---|
| Pixel Plumber | Mario clone with low-gravity and ice zones | physics was decoration |
| Spin Runner | NMR platformer, pulses as floor pads | *"you copy all interface and idea from Mario… don't understand what physics you are trying to connect"* — it turned parameters into props |
| Shim | faithful spectrometer shimming trainer | *"you are wrong… i want something more creative"* — accurate instrument, no game |
| Agreement | abstract coherence puzzle, NMR digested into rules | *"you got lost in the midpoint"* — neither a real game nor a real instrument, and only legible to an expert |
| **THROUGH** | platformer, real tunnelling decides every wall | the current answer |

**The shape of the error, both ways:** skin a game with physics and it is
unreadable; reproduce the instrument and it is inert; abstract it for an expert
and the public is locked out. The target is a game anyone can already play, in
which the hard physics is *the best mechanic*, not the lesson.

## THROUGH — what it is built on

One formula does the work:

```
T = exp(-ALPHA * d * sqrt(V - E))        ALPHA = 0.075
E = EMAX * (speed/VMAX)^2                EMAX  = 0.55
```

which is `T = exp(-2*kappa*d)` in game units. Odds at full speed: 8 px → 67%,
16 px → 45%, 30 px → 22%, 50 px → 8%. Doubling the thickness squares the
chance — that is exact, and it is the whole lesson.

Other mechanics: detectors collapse you (solid while watched), a splitter makes
you two bodies on one input, and the merge compares path lengths
(`amp = |cos(pi*dL/LAMBDA)|`, LAMBDA = 120 px) for a bonus.

## Rules it must keep passing

1. **A naive player must be able to finish.** `scratchpad/pw/through.js` holds
   right and jumps when stuck. Run it after any level change; it should reach the
   end. It has caught every real bug so far.
2. **No jargon on screen** unless the physics button is on.
3. **Never punish for something invisible.** Interference is a bonus, not a
   death.
4. **A hard wall must have a way round it,** or it is a toll booth.
5. **Never let the player run past the goal into a pit.** There is a backstop
   block; the goal also explains itself if your other half has not arrived.

## Outstanding

1. **The class wall card is stale** — still describes an older build. Needs a new
   blurb and picture (`images/through-title.png`). Blurb capped at **400
   characters**; `py scripts/build.py` in the `showcase-2026` clone enforces it.
   Never hand-edit `projects.json`.
2. **More acts are available and cheap**: a barrier you must *lower your* energy
   to pass would be a nice inversion; a corridor where two routes differ by
   exactly half a wavelength would make interference a real puzzle rather than a
   bonus.
3. The `%` label can overlap a ceiling block at some camera positions. Cosmetic.

## Git identity trap

Pushes are rejected with `GH007: private email address` unless commits use the
noreply address. Configured already:

```
git config user.email "171763498+tojestspacja@users.noreply.github.com"
```

## How the user works

- Their criticism has been right every single time, and it gets to the point
  faster than my analysis did. Take it literally.
- They want **ideas and a decision**, not questions. Three rounds of asking was
  two too many; the last time they answered a multiple-choice with a directive.
- **Verified claims only.** Every number quoted anywhere was measured by driving
  the running build from a script. When a simulation disagrees with a
  back-of-envelope, check the algebra first — it was the envelope that was wrong
  both times it came up.

## Environment gotchas

Bash heredocs break on ASCII apostrophes; backticks inside double-quoted shell
strings get command-substituted (this mangled README.md once) — use the editor
tool for prose. Node resolves `/tmp/...` to `C:\tmp\...`. Python is `py`.
Playwright lives in the session scratchpad. Patch scripts must actually call
`fs.writeFileSync`.
