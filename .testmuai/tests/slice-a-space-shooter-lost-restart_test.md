---
mode: testing
max_steps: 50
timeout: 300
target: chrome
---

# Session: slice-a-space-shooter-lost-restart

## Step 1
Go to http://localhost:5173 and create a Space Shooter starter named Slice A Lost Restart. Open Play and verify SCORE, HULL, TIME and the canvas. Let the game run until its normal LOST state appears. Immediately click the game canvas and press R. Verify the Play screen returns to RUNNING with SCORE 0, HULL 3, and TIME 60. Do not inspect the Console.
