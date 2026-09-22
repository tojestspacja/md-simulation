# Chapter 1 — READ THE CURVE

**DESIGN PROPOSAL — NOT SHIPPED.**

Nothing here is in `src/levels/`, `src/campaign.js` or the game. The candidate
geometries in this document were measured with `tools/difficulty.mjs --levels`
pointed at a scratch module; they have never been imported by the game and have
no level id reserved.

Baseline referenced throughout: `analysis/difficulty-baseline.json`, 360 angles
× 120 powers, 40 seeded search trials per level.

---

## The arc, in the player's words

| slot | level | what the player leaves knowing |
|---|---|---|
| entry | `push` | drag to aim and to choose power; release commits; the whole flight plays out; where it landed tells you what to change |
| A | `bend` | a mass off to the side curves the path after you have let go |
| B | `aim-away` | sometimes the direction that works points away from the thing you want |
| C | *new* | the same field can be used more than one way |
| capstone | `round-the-back` | pick a route, then fly it accurately |
| expert | — | *(see below: `orbit` should not go here)* |

`push` must stay conceptually empty. It is the only level whose job is the
controls, and the measurement says something useful about it: its basin is the
smallest in the game at 0.89%, and the blind search needs a median of 138 shots
— more than any other level. A human solves it immediately by aiming at the
visible flag. That gap is the clearest evidence that search cost is not human
difficulty, and it is worth keeping in mind for every number below.

---

## Does the proposed structure hold up?

Mostly. Two things the measurements contradict.

### `orbit` is the wrong level for the expert slot

| | `orbit` | rest of chapter 1 |
|---|---|---|
| angle tolerance | **±12.62°** | ±1.0–5.4° |
| basin | **2.79%** | 0.89–1.9% |
| median search | **32** | 45–138 |

`orbit` is the most forgiving level in the game to execute and the second
cheapest to find. Labelling it the expert challenge would tell the player
something false, and they would notice within a minute.

Its concept — that gravity can hold a path rather than merely bend one — is
genuinely new, and it is the theme of the next chapter. It belongs at the
**entry of Chapter 2**, where an easy-to-execute level teaching a new idea is
exactly what you want.

Chapter 1 should ship **without an expert**. The rule format already allows the
slot to be absent, and inventing a seventh level to fill a hole in a diagram is
how chapters get padded.

### `round-the-back` is a legitimate capstone, for a different reason than assumed

The original argument was "the target is shadowed, so it integrates". The
straight line from start to flag actually clears the planet by 74 px, so it is
not shadowed. What the measurements say instead:

```
round-the-back   1.9% basin   median 86 (2nd highest)   tolerance ±1.75°
                 3 distinct strategies
```

Grouping its winning launches into contiguous angle bands and describing what
each one does:

| band | share | flight | closest approach | character |
|---|---|---|---|---|
| 250–321° | 66% | 3.4 s | 138 px | over the top, quick |
| 0–52° | 19% | 6.9 s | 121 px | the slow way round, low power |
| 346–360° | 15% | 3.3 s | 64 px | a tight pass close in |

Three journeys that feel different, at the tightest tolerance in the chapter
(±1.75°, tied with `aim-away`) and the highest search cost. That is a capstone:
it demands the skill C teaches — there is a choice to make — and then it demands
that the chosen route be flown accurately.

One caveat worth recording. The ramp is not monotonic in precision: `bend` is
forgiving on one side (+5.38°), `aim-away` is tight (±1.75°), and the capstone is
tight but not tighter. The escalation is in *route choice under precision*, not
in precision alone. If that turns out to feel flat in playtest, the fix is a new
capstone, not a retuned `round-the-back`.

---

## The missing C: three candidates, measured

All three use only existing capabilities: one start, one flag, one planet, the
existing bounds and the existing feedback. No new control, body type, force,
collectible or timer.

### C1 — "over or under"

A single heavy blocker sitting **on** the line, larger than `aim-away`'s
(1.2e6 / r55 against 7e5 / r34), so the two ways past are visibly separate
rather than a hair either side of centre.

```
start [100,270]   flag [830,270] r34   planet(465,270, 1.2e6, 55)   maxP 300  maxT 10
```

| measured | |
|---|---|
| basin | 1.30% |
| strategies | 2, mirror-symmetric |
| median / p90 | 51 / 126 |
| tolerance | −1.0 / +1.62° |

**Rejected.** It is `aim-away` with a bigger planet: the same two mirror routes,
at a *tighter* tolerance than the level it would sit beside. Two of the three
parallel levels would be the same exercise, which is exactly the failure mode
the branch is supposed to avoid.

### C2 — "take it or leave it"

The mass sits well off the line. A hard flat shot ignores it; a slower lofted
one lets it curve you down onto the flag. The intended insight: *you can use the
field or refuse it.*

```
start [110,430]   flag [850,430] r32   planet(470,195, 1.4e6, 44)   maxP 300  maxT 10
```

| measured | |
|---|---|
| basin | 1.04% |
| strategies | **1** |
| median / p90 | 92 / 136 |
| tolerance | −1.25 / +3.13° |

**Rejected.** The idea does not survive measurement. The "ignore it" route
swallows the space and the gravity-assisted route never becomes a real option,
so the level has one strategy and the lowest basin of the three. A nice sentence
that the physics does not support.

### C3 — "the long way round"  ← recommended

The flag is up and to the right; the mass sits down and to the right of the
start. Go over the top, or fall past the planet and let it turn you up into the
flag.

```
start [140,300]   flag [510,130] r28   planet(430,335, 2.1e6, 46)   maxP 280  maxT 12
```

| measured | |
|---|---|
| basin | **2.52%** |
| strategies | **2, genuinely different** |
| median / p90 | **43 / 121** |
| tolerance | −1.87 / +2.25° |

| band | share | flight | closest | character |
|---|---|---|---|---|
| 237–333° | 76% | 2.4 s | 186 px | over the top, fast, wide |
| 28–105° | 24% | 5.4 s | 93 px | down past the mass and slung up |

Two journeys that take 2.4 s and 5.4 s and pass the planet at 186 px and 93 px.
A player who finds the obvious one and then notices the other has learned
something a mirror pair cannot teach.

**Against `bend`:** `bend` has one route and gravity is unavoidable — it happens
to you. Here it is a tool you choose to pick up.

**Against `aim-away`:** its two bands are mirror images — same flight time, same
closest approach, one idea used twice. C3's two bands are different journeys.

**Why before `round-the-back`:** C3 offers a choice between two routes that are
each individually forgiving (±2°). The capstone offers three routes at ±1.75°
with a median of 86. C3 teaches that choice exists; the capstone charges for it.

---

## Target versus measured, for C3

| | target | C3 measured |
|---|---|---|
| basin | 1.5–2.5% | 2.52% — marginally over |
| meaningful routes | several, not fragmented | 2 strategies, 4 grid regions |
| median search | 40–90 | 43 |
| p90 | < 130 | 121 |
| tolerance | moderate | ±2° |

The one miss is the basin, 0.02 points over the band, which is inside the noise
of the sampling. `two-planets` remains the warning boundary and C3 is nowhere
near it: 37 grid regions of which 3 are meaningful, against C3's 4 of which 2
are.

---

## Does "complete any 2" still mean anything?

| | strengths | weakness | who skips it |
|---|---|---|---|
| A `bend` | one idea, +5.38° of slack on the forgiving side | nothing to choose | someone who wants a decision to make |
| B `aim-away` | clear objective once seen | ±1.0/1.75°, the tightest in the chapter | someone who dislikes fine aiming |
| C `bend`-free route choice | two real routes, ±2° | you must notice the second route exists | someone who just wants to be told the answer |

Three different reasons to skip a different one. That is the test the branch has
to pass, and on the measured profiles it does.

---

## Chapters 2–4, theme only

```
Chapter 2 — ORBIT      hold a path instead of bending one; entry is `orbit`
Chapter 3 — TWO BODIES read a field with more than one source; `two-planets` lives here
Chapter 4 — ESCAPE     trade energy with something that is moving; `gravity-assist` is the capstone
```

No levels designed. `two-planets` and `gravity-assist` stay out of Chapter 1.

---

## What C3 must pass before it ships

In order. Any failure sends it back to geometry, not to the test.

1. **Level fingerprint** — added to `test/levels-fingerprint.mjs`, so its values
   are pinned from the first commit.
2. **Basin, at shipped density** — 360 × 120. Target 1.5–2.6%. Re-measure after
   any geometry edit; the number moved by 0.1 across every variant tried.
3. **Strategy count** — contiguous angle bands holding ≥3% of wins, each
   described by flight time and closest approach. Must be ≥2 bands that differ
   in *both*. Grid-region count alone is not evidence: it moved from 4 to 2 on
   the same level when power sampling went from 30 to 120.
4. **Search profile** — 40 seeded trials, budget 2000. Median 40–90, p90 < 130,
   **zero failures within budget**.
5. **Tolerance** — walked from the most interior winning sample, each direction
   separately. No direction below ±1.5°, or it is a precision level wearing an
   exploration badge.
6. **Solvable by the blind bot from every seed.** If a seeded restart cannot
   finish it, a player without the bot's patience certainly cannot.
7. **Readability, by eye, before any of the above counts.** Open it and check
   that a person can form the hypothesis "maybe I can go round the other side"
   from the opening frame. If the second route is invisible, the level has one
   route and a secret, and the measurements will not say so.
8. **Campaign rules unchanged until 1–7 pass.** The level ships as a module
   first and joins `PREREQUISITES` second, so a bad level can be deleted without
   a save migration.

---

## Honest limits of this analysis

- The bot has no notion of aiming at a visible target, so every level whose
  answer is "aim at the thing" reads as hard. `push` is the proof.
- The bot cannot measure whether a mechanic is counter-intuitive, which is most
  of what makes `aim-away` and `gravity-assist` interesting.
- Basin percentage is not a hit probability for a human. Players do not sample
  the circle uniformly; they start from plausible directions.
- Strategy bands are grouped by launch angle, which is a proxy. Two launches in
  the same band could in principle diverge; spot-checking the described flights
  is what catches that.
- None of this replaces one person playing it. The tools' job is to refuse the
  candidates that are unsolvable, trivial or chaotic before a person spends
  time on them.
