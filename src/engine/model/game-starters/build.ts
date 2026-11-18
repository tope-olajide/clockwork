import type { ProjectDocument } from "../schema";
import type { GameStarterId } from "./catalog";
import { spaceShooterTemplate } from "./space-shooter";
import { spaceInvadersTemplate } from "./space-invaders";
import { asteroidFieldTemplate } from "./asteroid-field";
import { pingPongTemplate } from "./ping-pong";
import { brickBreakerTemplate } from "./brick-breaker";
import { flappyFlyerTemplate } from "./flappy-flyer";

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
  }
}
