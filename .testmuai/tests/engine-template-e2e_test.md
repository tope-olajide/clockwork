---
mode: testing
max_steps: 50
timeout: 480
code_export: false
tags: [engine, e2e, template]
target: chrome
---

# Session: engine-template-e2e

## Step 1

Go to http://localhost:5173 and create a project from the Platform Jumper game starter named "Engine E2E Platformer". The project opens directly in the editor; if a coach-tour card is visible, click Skip.

Verify the scene canvas and Scene hierarchy are visible. The Inspector is collapsed until an object is selected, so do not require it yet.

In the Scene hierarchy select the row named "Jumper" that is marked Play (not a delete button). Record the Object Y value shown in the Inspector. Press ArrowUp twice, then press Control+Z twice, and verify Object Y returned to the recorded value.

Press Play. Verify the Play screen shows the game canvas and the HUD labels CORES and LIVES, with LIVES reading 3. Press Space once without clicking the canvas. Verify the HUD labels CORES and LIVES are still visible and LIVES still reads 3. Press R to restart and verify the HUD labels are visible with LIVES reading 3.

Return to the editor and verify the "Engine E2E Platformer" project is still open with its canvas and hierarchy. Do not open or inspect the browser Console.
