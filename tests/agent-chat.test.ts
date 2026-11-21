import assert from "node:assert/strict";
import test from "node:test";
import type { AgentChatMessage, ChatAttachment } from "../shared/protocol";
import { attachmentManifest } from "../shared/attachments";
import { normalizeChatRecord, chatRecordId } from "../src/engine/persistence/indexeddb";
import {
  checkAttachmentFile,
  formatBytes,
  relativeTime,
  titleForMessages,
  type PendingAttachment,
} from "../src/features/agent/chat/chat-utils";

const attachment: ChatAttachment = {
  assetId: "asset_hero",
  name: "hero.png",
  kind: "image",
  mime: "image/png",
  size: 2048,
  width: 64,
  height: 64,
};

test("chat titles come from the first user message and stay bounded", () => {
  const messages: AgentChatMessage[] = [
    { id: "a", role: "assistant", content: "Hello", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", role: "user", content: "  Build a   tiny platformer with coins and a goal  ", createdAt: "2026-01-01T00:00:01.000Z" },
    { id: "c", role: "user", content: "Second message", createdAt: "2026-01-01T00:00:02.000Z" },
  ];
  assert.equal(titleForMessages(messages), "Build a tiny platformer with coins and a goal");
  assert.equal(titleForMessages([{ ...messages[1]!, content: "x".repeat(80) }]).length, 48);
  assert.equal(titleForMessages([]), "New chat");
});

test("attachment manifests carry names and asset ids but no local paths", () => {
  const manifest = attachmentManifest([attachment]);
  assert.match(manifest, /hero\.png/);
  assert.match(manifest, /64x64/);
  assert.match(manifest, /asset_id asset_hero/);
  assert.doesNotMatch(manifest, /blob:|C:\\|\/home\//);
  assert.equal(attachmentManifest([]), "");
});

test("attachment checks enforce the existing asset limits", () => {
  const valid = { name: "hero.png", type: "image/png", size: 2048 } as File;
  const unsupported = { name: "notes.txt", type: "text/plain", size: 2048 } as File;
  const huge = { name: "huge.png", type: "image/png", size: 21 * 1024 * 1024 } as File;
  assert.deepEqual(checkAttachmentFile(valid), { ok: true });
  assert.equal(checkAttachmentFile(unsupported).ok, false);
  assert.match(checkAttachmentFile(huge).error ?? "", /20 MB/);
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(relativeTime("2026-01-01T00:00:00.000Z", new Date("2026-01-01T00:05:00.000Z").getTime()), "5m ago");
});

test("legacy single-chat records migrate into a normal history session", () => {
  const legacy = normalizeChatRecord({
    id: "prj_1",
    messages: [{ id: "m1", role: "user", content: "Old chat", createdAt: "2026-01-01T00:00:00.000Z" }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }, "prj_1");
  assert.ok(legacy);
  assert.equal(legacy.sessionId, "legacy");
  assert.equal(legacy.title, "Previous chat");
  assert.equal(legacy.id, chatRecordId("prj_1", "legacy"));
  assert.equal(normalizeChatRecord({ id: "other", messages: [] }, "prj_1"), null);
});

test("normal chat records preserve title and timestamps", () => {
  const record = normalizeChatRecord({
    id: chatRecordId("prj_1", "session_2"),
    projectId: "prj_1",
    sessionId: "session_2",
    title: "Ship a boss fight",
    messages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  }, "prj_1");
  assert.equal(record?.title, "Ship a boss fight");
  assert.equal(record?.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(record?.updatedAt, "2026-01-02T00:00:00.000Z");
});

// Keep the pending attachment shape exercised so attachment UI refactors cannot
// silently drop preview/error metadata.
const pending: PendingAttachment = { id: "p1", file: { name: "hero.png", type: "image/png", size: 1 } as File };
assert.equal(pending.previewUrl, undefined);
