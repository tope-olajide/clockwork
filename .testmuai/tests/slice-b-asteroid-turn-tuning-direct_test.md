---
mode: testing
max_steps: 50
timeout: 300
target: chrome
---

# Session: slice-b-asteroid-turn-tuning-direct

## Step 1
Go to http://localhost:5173/project/prj_g6RnQ5gXRQ, the existing Asteroid Field project. Select Pilot in the Hierarchy. In the Rotate and thrust behavior, set Turn speed to 0 and verify the field shows 0. Open Play, immediately click the canvas and briefly press D. Verify the game is still RUNNING and the pilot ship still points upward, showing that the edited zero turn speed affects Play. Do not inspect the Console.
