import type { ChatMessage } from "@triverse/protocol";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export function turnDurationsFromSession(text: string): number[] {
  const durations: number[] = [];
  let start: number | null = null;
  let end: number | null = null;
  const finish = () => {
    if (start == null || end == null) return;
    durations.push(Math.max(0, end - start));
    start = null;
    end = null;
  };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!record || typeof record !== "object") continue;
    const row = record as { type?: unknown; timestamp?: unknown; message?: { role?: unknown } };
    if (row.type !== "message" || !row.message || typeof row.message.role !== "string") continue;
    if (row.message.role === "system") continue;
    const time = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : Number.NaN;
    if (!Number.isFinite(time)) continue;
    if (row.message.role === "user") {
      finish();
      start = time;
      end = time;
      continue;
    }
    if (start != null) end = time;
  }
  finish();
  return durations;
}

export function applyTurnDurations(messages: ChatMessage[], durations: number[]): ChatMessage[] {
  let turn = -1;
  return messages.map((message) => {
    if (message.role === "user") {
      turn += 1;
      return message;
    }
    if (typeof message.durationMs === "number") return message;
    const duration = durations[turn];
    if (duration == null) return message;
    return { ...message, durationMs: duration };
  });
}

export async function sessionTurnDurations(workspace: string): Promise<number[]> {
  const dir = path.join(workspace, ".triverse", "sessions");
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }
  const parts = await Promise.all(names.map((name) => readFile(path.join(dir, name), "utf8")));
  return turnDurationsFromSession(parts.join("\n"));
}
