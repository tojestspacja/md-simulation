# Playtest round 1 — the long way round

**CANDIDATE UNDER EVALUATION — NOT PART OF THE CAMPAIGN.**

This is the operational sheet for the first human round. The protocol — what to
say, what never to say, the seven questions, the prewritten success criteria —
is in [playtest-long-way-round.md](playtest-long-way-round.md) and is unchanged.

---

## The frozen build

| | |
|---|---|
| tag | `playtest-long-way-round-r22-v2` |
| commit | `b30fd37` |
| supersedes | `playtest-long-way-round-r22-v1` (`18dd085`) |
| candidate | `long-way-round-r22` |
| fingerprint | `6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5` |
| playtest URL | <https://tojestspacja.github.io/md-simulation/slingshot/playtest/> |
| production URL | <https://tojestspacja.github.io/md-simulation/slingshot/> |
| playtest save | `slingshot.playtest.long-way-round-r22` |
| session record | `slingshot.playtest.session.long-way-round-r22` |
| production save | `slingshot.progress` (untouched) |

Analysis configuration behind the acceptance decision, for the record:
360 angles × 120 powers, 40 seeded search trials, budget 2000, seed base
20260923, route bands ≥3% of wins with a 2° gap, up to 250 launches sampled per
family for the tolerance distribution.

The page hashes its own geometry at boot and writes `fingerprintVerified` into
every export. A session whose export does not carry the fingerprint above was
not played on this build and must not be pooled with the rest.

### v1 is invalid for human data

`playtest-long-way-round-r22-v1` (`18dd085`) crashed for a tester. **The tag is
untouched and stays where it is**, and the commit is not rewritten. No human
sessions were collected on it, so Round 1 runs entirely on v2 and nothing has to
be merged across builds.

Two faults, neither reachable by the smoke tests that passed it.

**The banner covered the HUD on a phone.** `#hud` was offset by a hard-coded
46&nbsp;px. At 390&nbsp;px wide the banner wraps to three rows and measures
97&nbsp;px, so `document.elementFromPoint` at RETRY returned `pt-reset`: tapping
RETRY after a miss pressed RESET SESSION and wiped the run. The offset now
follows the banner's measured height through a `ResizeObserver`. The banner also
sat below the start overlay, so EXPORT and RESET were unreachable until it was
dismissed; it is now above it.

**Winning threw.** `win()` chose the gravity-assist ending by asking whether the
level was *last*. In the shipped seven, last and escape are the same level, so
reading `lv.ringAt` was safe. A one-level playtest campaign is also on its last
level and its level has a flag — `TypeError` on victory. It now asks what the
level *is* — a ring and a moon — rather than where it sits.

Both are covered now. `test/stages.mjs` walks load, modules, first render,
overlay, first pointer, launch, trajectory, frames-after-launch, retry, session
hook, fingerprint and export **separately**, in Chromium, Firefox and WebKit,
desktop and mobile with touch. `test/stress.mjs` drives 60 launches and asks
what grew; it is what found the victory crash, because the level has to be *won*
before that code runs.

The candidate geometry was not touched by any of it — `git diff` between the two
tags over `candidates/long-way-round-r22.js` is empty, and the fingerprint is
unchanged.

**The build does not change while the round is open.** Not `flagR`, not the
start, flag or planet, not `maxP` or `maxT`, not the wording on the page, not
the runtime, not the feedback. If a severe bug forces a fix, the round becomes
`…-v2` and results are reported separately rather than merged.

---

## Two questions, kept apart

### Test A — can the second route be hypothesised?

Whether the geometry and SLINGSHOT's ordinary feedback are enough for someone to
think *maybe I can go round the other side*, without being told.

1. `push` first, always, for the controls. It is the tutorial, not part of the
   comparison.
2. Open the playtest URL.
3. Say nothing about route structure.
4. Watch until they finish or stop of their own accord.
5. Ask the questions afterwards.

### Test B — is the three-way branch a real choice?

Whether `bend`, `aim-away` and the candidate give players different reasons to
pick different pairs. Requires all three played, then question 5.

`bend` and `aim-away` are reached on the production site from their own level
dots after `push`; the candidate is on the playtest URL. Testers will notice the
candidate is on a different page — that is unavoidable and worth saying plainly
("this one is an experiment") rather than disguising.

---

## Order plan

Every tester plays `push` first. The other three rotate:

| tester | order |
|---|---|
| 1 | bend → aim-away → **candidate** |
| 2 | aim-away → **candidate** → bend |
| 3 | **candidate** → bend → aim-away |
| 4 | bend → **candidate** → aim-away |
| 5 | **candidate** → aim-away → bend |
| 6 | aim-away → bend → **candidate** |

Then repeat from 1. Across any six testers each level sits in each position
twice; across any three of rows 1–3 each sits in each position once.

This is not a statistical correction and six people cannot be corrected. It
exists so the third level does not systematically benefit from two levels of
practice, and so "everyone said they would skip X" cannot turn out to mean
"X was always last".

**Test A is cleanest when the candidate comes first** — testers 3 and 5. Record
the candidate's position on every sheet and weight the discoverability evidence
accordingly in synthesis. Positions 2 and 3 are still worth having: they answer a
different question, namely whether having played `bend` or `aim-away` makes the
second route easier to think of.

---

## Observation sheet

One per tester. Fill in during play; the interview comes after.

```
tester            #____        date ____________      observer ____________
candidate position   1st / 2nd / 3rd        order played ______________________
build fingerprint verified in export?   yes / no
```

### Before they succeed

```
first hypothesis, in their words
  ______________________________________________________________

first shot went                 up-right / right / down-right / down / other
visible hesitation or confusion, and at what
  ______________________________________________________________

do they look at the ghost trails?        yes / no / unclear
do they mention the closest-point mark?  yes / no
repeating essentially the same failed idea?   no / a few times / stuck on it
  how many attempts before they varied it   ____

first time they aim downward at all       attempt ____   (or never)
anything said out loud
  ______________________________________________________________
```

### At the moment it changes

```
deliberate hypothesis, or an accidental launch that worked?   deliberate / accident / unclear
what seemed to trigger it (a ghost curving, the planet's pull, a miss that
swung round, boredom with the obvious route, something else)
  ______________________________________________________________

did they say what they expected BEFORE launching it?    yes / no
  if yes, what
  ______________________________________________________________
```

### After success

```
did they keep playing after finishing?      yes / no
did they find the other route too?          yes / no      at attempt ____
gave up before finishing?                   yes / no      after ____ attempts
```

Then the seven questions from the protocol, verbatim, without agreeing or
correcting. Keep the answers in a separate file from the exported JSON.

---

## Warning patterns

Written down before anyone plays. Any of these, repeated across testers, sends
the candidate back to `REFINE` — none of them is fixed by adding a hint.

| pattern | what it looks like |
|---|---|
| **discoverability failure** | the obvious route gets finished, the second is never even hypothesised unless someone says it |
| **secret-route failure** | route B is only ever reached by accident, and testers describe it as a surprise rather than something they could have reasoned to |
| **precision failure** | the idea is stated correctly and repeatedly, and still cannot be executed; the words "fiddly" or "pixel hunting" appear |
| **branch failure** | nearly everyone names the same level to skip, for the same reason |
| **feedback failure** | ghosts and the closest-point marker are on screen and nobody uses them to decide what to change |

These are qualitative. None of them has a percentage, and none should acquire
one from a handful of sessions.

---

## Telemetry

Each tester presses **Export playtest data**. Then:

```bash
cd slingshot
node tools/playtest-summary.mjs --dir <folder of exports>
node tools/playtest-summary.mjs --dir <folder> --json    # for a spreadsheet
```

Per tester it reports: attempts to first completion, first-shot angle/power and
which family it was aimed into, the family of the first win, whether both were
found, the attempt at which each family was first *tried* and first *won*, time
to first shot, time to completion, the aim sequence as a string of A/B/-, how
many times they switched families, and whether the closest approach converged or
wandered.

It reads only the fields the export already has. No new instrumentation, no
network, nothing written back.

**The summary says what happened. It does not say why.** "First tried family B on
attempt 10" is not evidence that anyone understood gravity; question 3 is. Keep
the two files apart and let the interview carry every conceptual claim.

---

## Synthesis, after the round

```
## What consistently worked
observations repeated across testers, each with the telemetry and the
interview line that support it

## What consistently failed
the same, for friction and misunderstanding

## Individual differences
where testers genuinely diverged — different first routes, different levels
they would skip, different reasons

## Surprises
behaviour the measurements did not predict. The gates said two distinct
families and a median of 69 shots; anything a person did that this does not
explain belongs here, and is the most valuable part of the round

## Decision
PROMOTE TO CAMPAIGN DESIGN  |  REFINE AND RE-PLAYTEST  |  REJECT
```

`PROMOTE TO CAMPAIGN DESIGN` does not mean appending the level to `LEVELS`. It
means Chapter 1 gets designed deliberately — entry, the three parallel levels,
the capstone, the prerequisite graph and the save implications — with this level
in the slot it was built for.
