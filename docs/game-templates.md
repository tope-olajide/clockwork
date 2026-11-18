# Built-in game starter templates

All twelve starter implementations are documented here. Combined local validation passes (30/30 tests, typecheck, build and repository check). Browser gameplay, editor-to-Play tuning, reset and console gates remain open; do not treat local runtime tests as browser evidence.

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

## Arena Survival

- **Controls:** WASD or arrows move; E or click attacks; R restarts.
- **Goal:** defeat chasers for score and survive the 60-second countdown. Contact damage consumes hull; losing all lives ends the run.
- **Objects:** bounded arena, sentinel player, chaser prefab/initial example, and a director that spawns a capped number of enemies.
- **Runtime:** `top-down-controller` moves the player; `melee` damages the nearest enemy in range on an action press; enemy `follow` pursues the player; `health` applies contact damage, invulnerability, lives and score-on-death; `countdown` ends the survival round.
- **Variables/HUD:** `score`, `health`, `lives`, `timeLeft`, `won`, and `lost`.
- **Editor tuning:** adjust player speed, attack range/damage/cooldown, enemy health/speed, spawn interval/cap and timer duration.
- **Reset:** R restores the player, three lives, zero score and the initial chaser.

## Falling Objects

- **Controls:** A/D or Left/Right moves along the catch lane; R restarts.
- **Goal:** dodge meteors, catch bonus stars, and survive the 60-second storm.
- **Objects:** fixed-lane catcher, meteor/bonus prefabs, initial examples, ground-lane art, and a capped spawn director.
- **Runtime:** the top-down controller locks Y movement; `mover` advances falling objects; `health` consumes lives on meteor contact; `collectible` awards ten points for a star; `countdown` wins when time expires.
- **Variables/HUD:** `score`, `lives`, `health`, `timeLeft`, `won`, and `lost`.
- **Editor tuning:** adjust player speed, hazard/bonus intervals and caps, fall speeds/lifetimes, and countdown duration.
- **Reset:** R clears score, restores three lives and resets spawned objects and the timer.

## Maze Escape

- **Controls:** WASD or arrows move; R restarts.
- **Goal:** collect all fifteen dots, unlock the gate, then reach the exit. The warden uses grid routing around walls; contact ends the run.
- **Objects:** 20×12 cell maze, solid boundary and interior walls, fifteen dots, player, one warden and a solid threshold gate.
- **Runtime:** `top-down-controller` handles movement; grid-aware `follow` routes around `wall` tags; `collectible` tracks dots; `exit-gate` removes the gate collider and changes its colour at fifteen; the win rule requires both an open gate and exit overlap.
- **Variables/HUD:** `dots`, `health`, `lives`, `exitOpen`, `won`, and `lost`.
- **Editor tuning:** adjust player/warden speed, follow cell size, dot threshold, and the gate's opening colour.
- **Reset:** R restores all dots, the locked gate, player and warden positions.

## Snake

- **Controls:** WASD or arrow keys turn; R restarts.
- **Goal:** grow from length three to 100 points without hitting a wall or the snake's body.
- **Objects:** 20×15 grid board, snake head, two prefab-backed starting body segments, one food item and boundary walls.
- **Runtime:** `snake` advances on a fixed interval, queues perpendicular turns while rejecting reversals, moves prefab segments, grows on food, relocates food to an unoccupied cell using the seeded RNG, and sets real win/loss states.
- **Variables/HUD:** `score`, `length`, `won`, and `lost`; each food adds ten points and one body segment.
- **Editor tuning:** change grid dimensions/origin/cell size, move interval, starting length, body prefab, food score, win score and wall/self-loss toggles.
- **Reset:** R clears score, restores length three, returns head/food/body state and resets the deterministic random sequence.
