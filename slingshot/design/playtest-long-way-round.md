# Playtest protocol — the long way round

**CANDIDATE UNDER EVALUATION — NOT PART OF THE CAMPAIGN.**

Candidate `long-way-round-r22`, fingerprint
`6db04ecc583dac83079464846b0ec19ee0c3a1e390ddc5deed2604435318f2e5`.
It passed the automated gates; this is the part a tool cannot answer.

**URL:** `https://tojestspacja.github.io/md-simulation/slingshot/playtest/`

Not linked from the arcade, the project wall or the game. Share it directly.

---

## Before they play

Say as little as possible:

> This is an experimental level. Drag back from the probe and let go. Play until
> you finish it or until you want to stop.

**Do not say any of these, in any wording:**

- that there is more than one route
- anything about going below, under or around the planet
- "fast route", "long route", "the obvious way"
- how many attempts it usually takes
- that the level is being evaluated for a particular role

The whole question is whether the geometry suggests the second route on its own.
Saying it out loud answers the question and wastes the session. The page itself
is checked for the same leaks by `test/playtest-smoke.mjs`.

Do not sit them down in front of an explanation of the physics either. A player
arriving at Chapter 1 slot C will have played `push` and at least one of `bend`
or `aim-away`, and nothing else.

## During play

Watch, do not coach. Note when something happens rather than what you think it
means:

- where the first shot goes
- whether they ever aim downward, and after how many attempts
- whether they watch the ghost trails or ignore them
- visible frustration, and at what
- anything said out loud

If they ask for a hint, say the level is meant to be figured out and let the
silence sit. If they give up, that is a result — record the attempt count.

## After play — the questions

Ask in this order. Let them answer before moving on; do not agree or correct.

1. Where did you aim on your first shot, and why?
2. At what point did you first think another route might work?
3. Did the geometry suggest that route, or did you discover it accidentally?
4. Do the two successful routes feel like genuinely different strategies?
5. If `bend`, `aim-away` and this level were three optional challenges and you
   only needed two, which would you skip and why?
6. Did any failure feel arbitrary or luck-based?
7. At any point did you know what you wanted to do but feel unable to execute it
   precisely enough?

Question 4 only makes sense if they found both routes. If they did not, ask
instead: *once you finished, did you wonder whether there was another way?*

Record answers verbatim where you can. Keep them in a separate file from the
exported JSON — the numbers say what happened, the answers say why, and mixing
them tempts us to read one as evidence for the other.

## The data

Press **Export playtest data** and keep the file. It contains:

```
candidate, candidateFingerprint, fingerprintVerified
sessionId            random per session, not per person
startedAt
attempts[]           levelId, attempt, angleDeg, power, outcome,
                     flightSeconds, closestApproach,
                     secondsFromLoad, secondsSincePrevious,
                     routeFamily on a win
completed, completedOnAttempt
discoveredRoutes     the families reached, e.g. ["A"] or ["A","B"]
```

No name, no email, no account, no address, no browser fingerprinting, and no
network call: the file is produced in the page and saved by the browser. The
session id exists so two exports from one machine can be told apart.

`routeFamily` is written into the export but never shown while playing.

**Reset session** clears the candidate's save and the session record. It cannot
touch a real player's progress — the two use separate keys and the test seeds
production progress, plays the candidate, resets it, and reads production back
byte-identical.

## What would count as success

Written down before anyone plays, so the bar cannot move afterwards.

| | what we are looking for |
|---|---|
| **discoverability** | at least some testers hypothesise the second route rather than only stumbling into it — question 3 distinguishes these, and the attempt log shows whether a downward aim came before or after a lot of flailing |
| **strategy distinction** | testers who fly both describe them as different things to do, not the same thing mirrored |
| **execution** | nobody describes it as pixel-hunting; question 7 is the one that catches an execution problem the gates missed |
| **branch value** | across testers, question 5 produces *different* answers. If everyone would skip the same level, the three-way branch is decoration |

This is a handful of people. It is qualitative design evidence and nothing more:
no percentage here is a measurement, and none of it should be reported as one.
A small sample can show that a problem exists; it cannot show that one does not.

## If it fails

- **second route never hypothesised** → the geometry does not suggest it.
  Redesign, do not add a hint.
- **described as fiddly** → execution is tighter in the hand than in the
  distribution. Re-measure, and consider whether the metric is looking at the
  wrong thing again.
- **everyone would skip the same one** → the trio needs a different C, not a
  retuned one.

Any of those returns the candidate to `REFINE` and it does not enter the
campaign.
