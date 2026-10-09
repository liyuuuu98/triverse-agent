import path from "node:path";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Capabilities } from "@triverse/protocol";

const run = promisify(execFile);
let cached: { expires: number; value: Promise<string[]> } | undefined;
export function runtimeCapabilities(): Promise<string[]> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = Promise.all([ ["runtime:ffmpeg", "ffmpeg"], ["runtime:blender", process.env.BLENDER_BIN || "blender"] ].map(async ([id, command]) => {
    try { await run(command, [command === "ffmpeg" ? "-version" : "--version"], { timeout: 2000, maxBuffer: 16000 }); return id; }
    catch { return undefined; }
  })).then((results) => results.filter((id): id is string => Boolean(id)));
  cached = { expires: Date.now() + 30_000, value }; return value;
}
export function skillStatus(skill: { name: string; description: string; filePath: string }, availableTools: readonly string[]): Capabilities["skills"][number] {
  const content=readFileSync(skill.filePath,"utf8"), front=content.split(/^---\s*$/m)[1] ?? "";
  const planning=/^\s+triverse-status:\s*planning\s*$/m.test(front);
  const raw=/^\s+triverse-requires:\s*(.*)$/m.exec(front)?.[1];
  let requires=""; if (raw) { try { requires=JSON.parse(raw); } catch { requires=raw; } }
  let catalogRequires: string[] = [];
  try { const catalog=JSON.parse(readFileSync(path.join(path.dirname(path.dirname(skill.filePath)), "catalog.json"),"utf8")); catalogRequires=catalog.skills.find((entry: any) => entry.name === skill.name)?.requiresTools ?? []; } catch { /* project-only skills can declare frontmatter requirements */ }
  const available=new Set(availableTools);
  const missingTools=[...catalogRequires, ...requires.split(",")].join(",").split(",").map((group)=>group.trim()).filter(Boolean).filter((group)=>!group.split("|").some((name)=>available.has(name.trim())));
  return { name: skill.name, description: skill.description, status: planning ? "planning" : missingTools.length ? "needs-tools" : "ready", missingTools };
}
