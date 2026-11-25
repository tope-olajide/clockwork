import type { ProjectDocument } from "../schema";
import type { GameStarterId } from "./catalog";
import { spaceShooterTemplate } from "./space-shooter";
import { spaceInvadersTemplate } from "./space-invaders";
import { asteroidFieldTemplate } from "./asteroid-field";
import { pingPongTemplate } from "./ping-pong";
import { brickBreakerTemplate } from "./brick-breaker";
import { flappyFlyerTemplate } from "./flappy-flyer";
import { platformJumperTemplate } from "./platform-jumper";
import { meadowRunTemplate } from "./meadow-run";
import { meadowSandboxTemplate } from "./meadow-sandbox";
import { endlessRunnerTemplate } from "./endless-runner";
import { arenaSurvivalTemplate } from "./arena-survival";
import { fallingObjectsTemplate } from "./falling-objects";
import { mazeEscapeTemplate } from "./maze-escape";
import { snakeTemplate } from "./snake";

export function createGameStarterDocument(id: GameStarterId, name: string): ProjectDocument {
  switch (id) {
    case "space-shooter":
      return spaceShooterTemplate(name);
    case "space-invaders":
      return spaceInvadersTemplate(name);
    case "asteroid-field":
      return asteroidFieldTemplate(name);
    case "ping-pong":
      return pingPongTemplate(name);
    case "brick-breaker":
      return brickBreakerTemplate(name);
    case "flappy-flyer":
      return flappyFlyerTemplate(name);
    case "platform-jumper":
      return platformJumperTemplate(name);
    case "meadow-run":
      return meadowRunTemplate(name);
    case "meadow-sandbox":
      return meadowSandboxTemplate(name);
    case "endless-runner":
      return endlessRunnerTemplate(name);
    case "arena-survival":
      return arenaSurvivalTemplate(name);
    case "falling-objects":
      return fallingObjectsTemplate(name);
    case "maze-escape":
      return mazeEscapeTemplate(name);
    case "snake":
      return snakeTemplate(name);
  }
}
