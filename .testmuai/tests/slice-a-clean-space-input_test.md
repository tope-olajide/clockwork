---
mode: testing
max_steps: 20
timeout: 240
target: chrome
---

# Session: slice-a-clean-space-input

## Step 1
Go to http://localhost:5173. Create a Space Shooter starter named Slice A Clean Input. In the editor set the Player ship Max health to 99, and set Wave director Spawner Min X and Max X both to 640. Enter Play, click the center of the game canvas to focus it, then use explicit individual Space key presses (not a hold) to fire at the central spawn lane. Wait briefly. Verify the visible SCORE value is greater than 0. Stop immediately after that assertion; do not open the console or continue to other checks. If SCORE stays 0, report failure.
