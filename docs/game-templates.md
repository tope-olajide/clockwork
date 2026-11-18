# Built-in game starter templates

This reference is being filled in as starter implementations are added. Slices C and D are documented here. Slice A/B browser gates and all Slice C/D validation remain open; do not treat these implementations as verified.

## Ping Pong

- **Controls:** W/S or Up/Down moves the player paddle; R restarts.
- **Goal:** score five points before the computer. A ball past the left edge awards the computer a point; past the right edge awards the player a point.
- **Objects:** player paddle, computer paddle, ball, top/bottom walls, center-line decoration.
- **Runtime:** `paddle` moves and clamps the player's paddle. `ai-paddle` follows the ball with configurable reaction time, error and speed. `ball` serves automatically, reflects from paddles/walls, and angles paddle returns by impact offset.
- **Variables/HUD:** `leftScore`, `rightScore`; first to five sets `won` or `lost`.
- **Editor tuning:** change paddle `speed`; adjust AI `speed`, `error` and `reactionMs`; tune ball `speed`, `bounceAngle` and `maxSpeed`.
- **Reset:** R restores the initial score and automatic serve delay.

## Brick Breaker

- **Controls:** A/D or Left/Right moves the paddle; Space serves; R restarts.
- **Goal:** destroy all 50 bricks before losing three balls.
- **Objects:** 50 health-bearing bricks in five rows, player paddle and ball. The top and side playfield boundaries are handled by the ball runtime.
- **Runtime:** the ball attaches to the paddle while ready, serves on jump input, sweeps and reflects from solid bodies, damages objects tagged `brick`, and increases speed every four hits up to its cap. Bricks in the first two rows take two hits.
- **Variables/HUD:** `score`, `lives`, `bricks`; clearing the field sets `won`, and zero lives sets `lost`.
- **Editor tuning:** change brick health/score, ball `speed`, `speedUpEvery`, `speedUpBy` or `maxSpeed`, and paddle `speed`.
- **Reset:** R restores all brick health, three lives, zero score and the attached serve state.

## Flappy Flyer

- **Controls:** Space, W or click/tap flaps; R restarts.
- **Goal:** fly through moving gate gaps to score; hitting a gate, ceiling or ground sets `lost`.
- **Objects:** player flyer, ground, scrolling gate prefabs, sky decorations and a spawn director. Each gate prefab contains a scoring marker and two moving pipe colliders around a 190-pixel gap.
- **Runtime:** `flap` applies an impulse and gravity with a fall-speed cap and collision/loss checks. The gate spawner chooses gap height from a bounded range. Its marker uses `mover.passX` to award one point after the flyer passes.
- **Variables/HUD:** `score`; this is an endless score challenge, so no win threshold is authored.
- **Editor tuning:** change flap `impulse`, `gravityScale` and `maxFallSpeed`; edit the spawner's `intervalMs`/height range and gate mover speed/gap size.
- **Reset:** R clears the score, removes spawned gates and resets the flyer and spawn timer.

## Platform Jumper

- **Controls:** A/D or Left/Right moves; Space or W jumps; R restarts.
- **Goal:** collect all five cores, then touch the relay. Spikes and the lower death zone consume lives; the player respawns while lives remain.
- **Objects:** three ground sections, one-way ledges, a patrol-driven kinematic platform, two spike patches, five cores, a gated relay, and a death zone.
- **Runtime:** `platformer-controller` handles movement and grounded jumping; `patrol` moves the kinematic platform; `collectible` increments `coins`; `health` applies invulnerability, life loss and respawn.
- **Variables/HUD:** `coins`, `lives`, `health`, `won`, and `lost`.
- **Editor tuning:** change player speed/jump, project gravity, platform patrol distance/speed, or health invulnerability.
- **Limitation:** kinematic moving platforms do not carry the player.
- **Reset:** R restores three lives, clears cores and returns the player to the starting position.

## Endless Runner

- **Controls:** Space or W jumps; Down or S ducks; R restarts.
- **Goal:** survive an accelerating stream of cones and collect bonus cores. Each passed cone scores one point; a bonus core adds five.
- **Objects:** fixed-lane runner, track, obstacle/core prefabs, initial examples, and a director with bounded live counts.
- **Runtime:** `platformer-controller` provides jumping, `duck` shortens the collider and visual while Down is held, `spawner` ramps obstacle frequency to a minimum interval, `mover` scrolls objects and scores passed cones, and `health` handles three lives and respawn.
- **Variables/HUD:** `score`, `lives`, `health`, and `lost`.
- **Editor tuning:** change jump strength, gravity, duck collider height, obstacle interval/decay/floor, and prefab speed/lifetime.
- **Reset:** R clears score/lives and restores the initial obstacle/core examples and spawn timers.
