import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { aiRoutes } from "./routes/ai";
import { env } from "./env";

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ ok: false, error: "Request body is too large.", code: "payload-too-large" }, 413),
  }),
);

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
app.use("/api/ai/*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}:${c.req.path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    bucket.count += 1;
    if (bucket.count > 60) {
      return c.json({ ok: false, error: "Too many requests. Try again shortly.", code: "rate-limit" }, 429);
    }
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true, service: "clockwork" }));
app.route("/api/ai", aiRoutes);

if (env.nodeEnv === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[clockwork] server listening on http://localhost:${info.port}`);
});

export default app;
