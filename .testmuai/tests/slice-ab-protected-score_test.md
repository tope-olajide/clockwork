---
mode: testing
max_steps: 32
timeout: 180
target: chrome
---

# Session: slice-ab-protected-score

## Step 1
Go to http://localhost:5173 and create a Space Shooter starter named Slice AB Protected Score. In the Scene hierarchy select Player ship and set its Health behavior Max health to 99. Select Wave director and set the first Spawner Min X and Max X to 640 so asteroids spawn directly in the firing lane. Open Play. Fire Space repeatedly at the center-lane asteroids and verify the SCORE value becomes greater than 0. Stop as soon as the score increases; do not inspect the Console.
