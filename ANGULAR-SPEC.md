# PRECESS — specification

**Status: plan only. Nothing built.**

> Push it up, and it goes sideways.

The second of the trilogy. Where SLINGSHOT is gravity, this one is **angular
momentum** — and unlike the NMR attempts, it does not need you to know that
nuclear spin is the same equation.

---

## 1. Why this is the strongest idea in the set

Almost all physics in games is *linear*: push a thing, it goes the way you
pushed. Angular momentum is the famous exception. Push on a spinning wheel and
it moves **ninety degrees away from where you pushed**.

That is:

- **visible** — you can see the thing spinning, and see it go the wrong way;
- **deterministic** — exactly 90°, every time, given by `dL/dt = τ`;
- **steerable** — torque is your input, and mastering the offset is the skill;
- **famous and astonishing** — it is why a bicycle stays up, why a spinning top
  does not fall over, why a gyroscope holds a heading. Most people have felt it
  in their hands holding a bike wheel and never understood it.

And it is a **novel control scheme**, which is rare. Every player's first ten
seconds are "I pushed up and it went right — what?" That confusion resolving
into mastery *is* the game.

Nuclear spin precessing in a magnetic field is the identical equation. Nobody
playing needs to be told.

---

## 2. The physics

A spinning body with angular momentum **L** along its axis, given a torque **τ**
perpendicular to it, does not tip — its axis sweeps around:

```
dL/dt = tau            the axis moves in the direction of the torque,
                       which is perpendicular to the force you applied

precession rate  Omega = tau / L
```

Two consequences that become the whole difficulty curve:

1. **Your input acts at 90°.** Push "up" and the axis goes "right".
2. **Spin faster and it responds *less*.** `Omega = tau/L`, so a fast top is
   stiff and sluggish; a slow one is twitchy and falls over. **Spin rate is a
   difficulty dial the player controls themselves**, which is an unusually
   elegant thing to get for free from real physics.

Everything else — nutation, the wobble a real top shows when you hit it — falls
out of integrating the rigid-body equations rather than being added.

---

## 3. The verb

**Hold a direction.** That is all. Arrow keys, or a thumb on a phone.

The catch is that holding "up" does not move you up. There is no second control,
no jump, no button. The entire game is in one 90° rotation between what you press
and what happens.

---

## 4. What you are

A spinning top making its way across a surface — leaning to steer, because
leaning is the only way a spinning thing *can* steer.

**Theme is deliberately unresolved.** Following the note from last time: observe
before designing. BGG's dexterity and spinning-top shelf (Klask, PitchCar,
Crokinole, Beyblade) is worth a proper look before committing, because those are
games where the fun is in *indirect* control, which is exactly this.

---

## 5. Level progression

Each level forces one discovery. Same rule as SLINGSHOT: the naive play must fail.

| # | Setup | What it forces |
|---|---|---|
| 1 | wide open, one target | **your input comes out sideways** |
| 2 | a corridor | you cannot correct late; you must lead the turn |
| 3 | a spin-up pad, and a tight gate | **spinning faster makes you steadier but less responsive** |
| 4 | a slow zone where spin bleeds off | the same push now swings you much further — `Omega = tau/L` felt directly |
| 5 | a circuit you must hold a line around | steady precession is a *curve*, not a wobble |
| 6 | knock another top out of the ring | your momentum is a thing you can spend |
| 7 | finale — a gate that only a nearly-stopped top fits through, in a place only a fast top can reach | the two ends of the dial in one problem |

---

## 6. What must be proved before building

Exactly as with SLINGSHOT — a harness first, no drawing:

1. **Is the 90° offset legible, or just confusing?** Simulate a player who holds
   one direction and measure the resulting track. If it curves predictably, the
   mechanic reads; if it spirals chaotically, the idea dies here.
2. **Is the miss landscape a funnel?** Sweep hold-direction and hold-duration
   against distance-to-target and check it is walkable.
3. **Does the spin dial behave?** Confirm `Omega = tau/L` over the intended range,
   and that fast/slow feel meaningfully different without either being unusable.
4. **Is level 7's gate provably closed to a fast top and its location provably
   unreachable by a slow one?** The same standard as the escape ring — a proof,
   not a playtest.
5. **Integrator check:** a frictionless top must precess at constant rate
   indefinitely with no energy drift.

If (1) fails, stop. Everything else depends on the offset being learnable.

---

## 7. Open risks

- **The offset may be too disorienting** for a general audience. Mitigation: level
  1 is wide open with no failure state, and a faint arrow shows the direction you
  are pressing next to the direction the top actually moves, until you turn it off.
- **A spinning top is hard to read at a glance.** The axis has to be unmistakable
  — a long, bright, clearly tilted spindle, not a blurry disc.
- **Top-down or perspective?** Precession is a 3-D fact; a flat top-down view may
  flatten the effect out of existence. Probably needs a shallow 3/4 view, which is
  more drawing work than SLINGSHOT needed. Worth a mockup before committing.

---

## 8. Where it sits

| | Game | Physics | Shape | Status |
|---|---|---|---|---|
| 1 | **SLINGSHOT** | gravity | aim and release | built |
| 2 | **PRECESS** | angular momentum | hold a direction | this spec |
| 3 | *(unnamed)* | resonance — driven oscillator | timing | sketch only |

Together they are the physics underneath magnetic resonance, taken apart. Each
stands alone and none of them mentions it.
