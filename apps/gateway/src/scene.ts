import { emptyScene, normalizeScene, type SceneState } from "@triverse/protocol";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const chains = new Map<string, Promise<unknown>>();

export function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled=run.then(()=>undefined,()=>undefined);
  chains.set(key,settled);
  void settled.then(()=>{if(chains.get(key)===settled) chains.delete(key);});
  return run;
}

export async function readScene(file: string, projectId: string): Promise<SceneState> {
  try {
    return normalizeScene(JSON.parse(await readFile(file, "utf8")), projectId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyScene(projectId);
    throw error;
  }
}

export function writeScene(file: string, projectId: string, scene: SceneState): Promise<void> {
  return exclusive(projectId, async () => {
    await persistScene(file, normalizeScene(scene, projectId));
  });
}

export function updateScene(
  file: string,
  projectId: string,
  mutate: (scene: SceneState) => Promise<SceneState> | SceneState,
): Promise<SceneState> {
  return exclusive(projectId, async () => {
    const next = normalizeScene(await mutate(await readScene(file, projectId)), projectId);
    await persistScene(file, next);
    return next;
  });
}

async function persistScene(file: string, scene: SceneState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(scene, null, 2)}\n`);
  await rename(temp, file);
}
