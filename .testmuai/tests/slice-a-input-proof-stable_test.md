---
mode: testing
max_steps: 40
timeout: 300
target: chrome
---

# Session: slice-a-input-proof-stable

## Step 1
Go to http://localhost:5173 and create a Space Shooter starter named Slice A Input Proof Stable. When the editor opens, immediately click Skip on the walkthrough if visible. Select Player ship and set Health Max health to 99. Select Wave director and set the first Spawner Min X and Max X both to 640. Click Play. Before sending any key, verify the game status is PLAYING; if it is LOST, stop and report failure without continuing. Click the center of the game canvas, press Space six separate times, wait briefly, and verify visible SCORE is greater than 0. Stop immediately after this score assertion. Do not open the console or ask the user to press keys.
