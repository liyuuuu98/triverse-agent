import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@triverse/protocol";
import { applyTurnDurations, turnDurationsFromSession } from "./turn-time.js";

const session = [
  JSON.stringify({ type: "message", timestamp: "2026-10-09T07:04:52.900Z", message: { role: "system" } }),
  JSON.stringify({ type: "message", timestamp: "2026-10-09T07:04:52.900Z", message: { role: "user" } }),
  JSON.stringify({ type: "message", timestamp: "2026-10-09T07:05:07.067Z", message: { role: "assistant" } }),
  "not json",
  JSON.stringify({ type: "message", timestamp: "2026-10-09T07:22:05.774Z", message: { role: "user" } }),
  JSON.stringify({ type: "message", timestamp: "2026-10-09T07:23:01.580Z", message: { role: "toolResult" } }),
].join("\n");

test("session timestamps measure each user turn through its last event", () => {
  assert.deepEqual(turnDurationsFromSession(session), [14167, 55806]);
});

test("stored durations stay, and missing ones follow the session turn order", () => {
  const messages: ChatMessage[] = [
    { id: "u1", role: "user", text: "a", tools: [], createdAt: "2026-10-09T07:04:52.833Z" },
    { id: "a1", role: "assistant", text: "b", tools: [], createdAt: "2026-10-09T07:04:52.833Z" },
    { id: "u2", role: "user", text: "c", tools: [], createdAt: "2026-10-09T07:22:05.774Z" },
    { id: "a2", role: "assistant", text: "d", tools: [], createdAt: "2026-10-09T07:22:05.774Z", durationMs: 1200 },
  ];
  const [first, reply, , stored] = applyTurnDurations(messages, turnDurationsFromSession(session));
  assert.equal(first?.role, "user");
  assert.equal(reply?.durationMs, 14167);
  assert.equal(stored?.durationMs, 1200);
});
