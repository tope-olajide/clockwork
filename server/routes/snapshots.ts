import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { MAX_SNAPSHOT_BYTES, validateSnapshotInput } from "../../shared/snapshot";
import { createSnapshot, deleteSnapshot, getSnapshot, snapshotCount } from "../snapshots/repository";

export const snapshotRoutes = new Hono();

snapshotRoutes.use(
  "*",
  bodyLimit({
    maxSize: MAX_SNAPSHOT_BYTES + 2 * 1024 * 1024,
    onError: (c) => c.json({ ok: false, error: "Snapshot is larger than 20 MB.", code: "payload-too-large" }, 413),
  }),
);

snapshotRoutes.get("/", (c) => c.json({ ok: true, count: snapshotCount() }));

snapshotRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body.", code: "bad-request" }, 400);
  }
  const validated = validateSnapshotInput(body);
  if (!validated.ok) return c.json({ ok: false, error: validated.error, code: "bad-request" }, 400);
  try {
    const stored = createSnapshot(validated.input.document, validated.input.assets, validated.input.ttlHours);
    const origin = new URL(c.req.url).origin;
    return c.json({
      ok: true,
      id: stored.id,
      url: `${origin}/s/${stored.id}`,
      expiresAt: stored.expiresAt,
    }, 201);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "Snapshot could not be saved.", code: "storage" }, 500);
  }
});

snapshotRoutes.get("/:id", (c) => {
  const stored = getSnapshot(c.req.param("id"));
  if (!stored) return c.json({ ok: false, error: "Snapshot not found or expired.", code: "not-found" }, 404);
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ ok: true, snapshot: stored.payload });
});

snapshotRoutes.delete("/:id", (c) => {
  const removed = deleteSnapshot(c.req.param("id"));
  if (!removed) return c.json({ ok: false, error: "Snapshot not found.", code: "not-found" }, 404);
  return c.json({ ok: true });
});
