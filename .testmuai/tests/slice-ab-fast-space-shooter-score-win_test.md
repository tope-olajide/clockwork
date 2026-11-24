---
mode: testing
max_steps: 32
timeout: 180
target: chrome
---

# Session: slice-ab-fast-space-shooter-score-win

## Step 1
Go to http://localhost:5173 and create a Space Shooter starter named Slice AB Fast Smoke. In the editor select Wave director. In its first Spawner behavior, set Min X and Max X to 640 so asteroids spawn in the player's firing lane; set the Countdown duration to 12000 ms. Open Play. After the first asteroid appears, press Space several times with short waits between shots. Verify SCORE is greater than 0. Then let the shortened timer expire and verify the Play status shows WON. Do not inspect the Console.
