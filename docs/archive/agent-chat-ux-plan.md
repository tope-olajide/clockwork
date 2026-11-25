# Agent chat UX redesign

Status: implemented (2026-11-19). All four slices are in the working tree; local
verification passes. This document remains the source of truth for the chat
redesign.

## Problem

The agent drawer is a narrow utility panel with plain-text messages. It has no
Markdown, message actions, attachment path, searchable history or mobile
treatment, and "New chat" deletes the only saved conversation.

## Goals

- Make the drawer feel like a modern assistant workspace (ChatGPT/Gemini class)
  while staying inside the existing editor shell.
- Let users attach a sprite or an audio file from the composer and have it become
  a real project asset the agent can use.
- Preserve honest behavior: no silent project edits, no fake upload states, no
  binaries stored in chat records.

## Visual direction

- 460–480px desktop drawer; full-screen sheet below tablet width.
- Layered surfaces, soft borders, one accent, uncluttered header and composer.
- Assistant messages full-width with a small Clockwork mark; user messages remain
  right-aligned bubbles.
- Tool calls become a compact, expandable activity timeline.
- Empty state includes project-aware suggestions and a drag/drop hint.
- Respect `prefers-reduced-motion`.

### Header

- Agent title and live status.
- Model picker, history, New chat and Close.
- Project/scene/selection collapse into one Context pill with a popover.

### Conversation

- Safe Markdown with GFM tables, lists, inline code and code blocks with Copy.
  Raw HTML stays disabled.
- Copy and Regenerate actions for the latest assistant response; existing Retry
  remains for errors.
- Timestamps on hover/focus.
- Consecutive tool calls group into one collapsible activity group.
- Existing change-preview and error cards stay, restyled.
- Jump-to-latest remains and gains a new-message hint while scrolled up.

### Composer

- Rounded, elevated composer with auto-growing input (about 44–200px).
- Attach button, mode selector and Send/Stop.
- Drag/drop anywhere over the drawer shows a drop overlay; pasted images attach.
- Attachment tray above the input with preview, size, state, remove and errors.
- Draft text persists per chat.
- Slash presets support Up/Down/Enter/Escape.
- Composer stays above the keyboard on mobile.

## Attachments

Reuse project asset rules:

- Images: PNG, JPEG, WebP, GIF, SVG.
- Audio: MP3, WAV, OGG, WebM.
- 20 MB per file, six files per message.
- Duplicate files reuse the existing asset by hash.

Flow:

1. Select, drop or paste files.
2. Validate locally and show chips with previews. Nothing is written yet.
3. On Send, import atomically with `importAssetFile` and `asset.add`.
4. If an import fails, roll back assets created by that attempt. Do not send a
   message that claims a failed attachment was added.
5. Successful attachments are saved to the project and shown as asset cards.
6. Chat records store metadata only: asset id, name, kind, MIME, size,
   dimensions and optional thumbnail. Blobs stay in IndexedDB.

Agent awareness:

- Extend `AgentChatMessage` with optional attachment metadata.
- The wire message appends a concise manifest, for example
  `[Attached: hero.png — image/png, 96x96, asset_id asset_123]`.
- No binary is sent to the model in v1. The model can reference the new asset id
  through existing asset context and tools.
- Vision input for image attachments is explicitly deferred.

Attachment quick actions prefill the composer, never edit the project:

- Use as player sprite
- Use as background
- Add as collectible
- Use as music
- Use as sound effect

## Conversation history

Replace the single-chat key with multiple sessions per project.

```ts
ChatRecord {
  id: `${projectId}:${sessionId}`
  projectId
  sessionId
  title
  messages
  createdAt
  updatedAt
}
```

- Header History popover shows recent chats with auto-title, relative date and
  message count.
- Auto-title comes from the first user message; no extra model call.
- New chat creates a session instead of deleting the old one.
- Rename and delete individual chats.
- Migrate the existing single chat into a "Previous chat" session.
- Cap history at 30 sessions per project and prune oldest.
- Deleting a chat does not delete project assets; scenes may reference them.

## Architecture

New components under `src/features/agent/chat/`:

- `ChatHeader.tsx`
- `ChatHistoryMenu.tsx`
- `ChatMessage.tsx`
- `MarkdownMessage.tsx`
- `ToolActivity.tsx`
- `ChatComposer.tsx`
- `AttachmentTray.tsx`
- `AttachmentCard.tsx`
- `EmptyState.tsx`
- `chat-utils.ts`

Other changes:

- `shared/protocol.ts`: attachment metadata and `ChatAttachment`.
- `src/engine/ai/transport.ts`: attachment manifest on the wire.
- `src/features/agent/useAgentSession.ts`: send-with-attachments, regenerate,
  history session load/create/delete.
- `src/engine/persistence/indexeddb.ts`: multi-chat records and migration.
- `src/engine/assets/asset-store.ts`: reusable validation result.
- `src/design/base.css`: drawer, message, composer and attachment styles.

One new dependency: `react-markdown` + `remark-gfm`, raw HTML disabled.

## Implementation slices

### Slice 1 — Conversation shell and message quality

- Header, context popover, empty state, responsive shell.
- Markdown rendering, code-copy, grouping, timestamps, copy/regenerate.
- Restyled tool activity, error and preview cards.
- Composer shell with auto-grow and draft persistence.

Checkpoint: modern chat UI without attachments or history. **Done.** Markdown,
actions, grouped tool activity, context popover, responsive shell and persistent
drafts are implemented.

### Slice 2 — Attachments

- Picker, drag/drop, paste.
- Validation, chips, thumbnails and audio previews.
- Atomic import on send with rollback.
- Attachment cards and wire manifest.
- Quick-action chips.
- Tests for validation, manifest and metadata.

Checkpoint: attach a sprite or track, send it, use it in a game. **Done.** Files
are validated before import, imported atomically on send, displayed as asset
cards, and sent to the model as an asset-id manifest. Vision binaries remain out
of scope.

### Slice 3 — Chat history

- Multi-session storage and migration.
- History popover, auto-title, rename/delete and New chat behavior.
- Active-session restore and per-session drafts.
- Tests for title generation and migration helpers.

Checkpoint: multiple chats survive reload. **Done.** Sessions auto-title, rename,
delete, restore, migrate the legacy single chat, and cap at 30 per project.

### Slice 4 — Polish and verification

**Done.** Paste-to-attach, slash keyboard navigation, outside-click history
handling, reduced-motion styles, focused tests and all repository gates pass.

- Slash-menu keyboard handling.
- Focus states, ARIA live announcements and reduced motion.
- Empty/loading/error and attachment rollback edge cases.
- Desktop and narrow-width checks.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run check:repo`.

## Out of scope

- Voice input, video/model uploads, cloud chat sync, AI image generation.
- Sending arbitrary binary data to the model.
- Reworking Kane or the AI Testing panel.
- Auto-applying edits from attachment quick actions.
