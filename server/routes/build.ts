import { Hono } from "hono";
import { build } from "esbuild";
import { join } from "node:path";

export const buildRoutes = new Hono();

let playerBundle: Promise<string> | null = null;

async function getPlayerBundle(): Promise<string> {
  if (!playerBundle) {
    const pending = build({
      entryPoints: [join(process.cwd(), "src", "play", "player.ts")],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      legalComments: "none",
      define: { "process.env.NODE_ENV": '"production"' },
    }).then((result) => {
      const output = result.outputFiles?.[0]?.text;
      if (!output) throw new Error("Player bundle was empty.");
      return output;
    }).catch((error: unknown) => {
      playerBundle = null;
      throw error;
    });
    playerBundle = pending;
  }
  return playerBundle;
}

buildRoutes.get("/player.js", async (c) => {
  try {
    const script = await getPlayerBundle();
    c.header("Content-Type", "application/javascript; charset=utf-8");
    c.header("Cache-Control", "public, max-age=300");
    return c.body(script);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "Player bundle failed.", code: "build" }, 500);
  }
});
