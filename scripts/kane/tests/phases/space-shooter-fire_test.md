---
mode: testing
tags: [phase-replay, space-shooter]
---

# Space Shooter fire creates projectiles

Recorded from the approved Clockwork test plan phase
"fire-creates-projectile". Run it with `--url` pointing at the Test Mode
snapshot player for the approved revision and seed; the snapshot URL is
supplied per run, never hard-coded here. On the first run the agent authors
each step and saves recordings; every later run replays them.

## Hold SHOOT and advance frames

This is Clockwork Test Mode: control clicks only queue input, and time moves
only when STEP is clicked. Turn the SHOOT toggle on, set ADVANCE to 45, click
STEP once, then wait for the frame counter to settle. Stay within the frame
budget. Do not reload and do not press any gameplay buttons besides SHOOT.

## Record the observed values

Record exactly: shots fired as 'shots-fired'; live projectiles as
'projectiles'; accepted inputs as 'accepted_inputs'; the frame counter as
'frames_advanced'. Store every value, then end the run immediately with no
extra wait steps.
