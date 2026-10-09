import type { SceneObject, SceneState, Vec3 } from "./index.js";

export class SceneConflictError extends Error {}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function vector(value: unknown, fallback: Vec3, label: string, positive = false): Vec3 {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === "number" && Number.isFinite(n) && (!positive || n > 0))) throw new Error(`${label} must contain three ${positive ? "positive " : ""}finite numbers`);
  return [...value] as Vec3;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024) throw new Error(`${label} must be a nonempty string`);
  return value;
}
function ids(value: unknown, known: Set<string>, label: string): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && known.has(id))) throw new Error(`${label} contains an unknown object`);
  return [...new Set(value)] as string[];
}

export function normalizeScene(value: unknown, projectId: string): SceneState {
  const source = record(value, "scene");
  if (!Array.isArray(source.objects) || source.objects.length > 1000) throw new Error("scene.objects must be an array of at most 1000 objects");
  let legacyIndex = 0;
  const objects: SceneObject[] = source.objects.map((raw) => {
    const item = record(raw, "scene object");
    if (!["environment", "prop", "light", "camera"].includes(String(item.kind))) throw new Error("unknown object kind");
    if (typeof item.visible !== "boolean") throw new Error("object.visible must be boolean");
    const assetPath = item.assetPath === undefined ? undefined : text(item.assetPath, "assetPath");
    if (assetPath && (assetPath.startsWith("/") || /^[A-Za-z]:/.test(assetPath) || assetPath.split(/[\\/]/).includes("..") || assetPath.includes("\0"))) throw new Error("assetPath must stay inside the workspace");
    const legacyPosition: Vec3 = [item.visible && assetPath?.toLowerCase().endsWith(".glb") ? legacyIndex++ * 1.6 : 0, 0, 0];
    const light = item.light === undefined ? undefined : record(item.light, "light");
    if (light && (typeof light.color !== "string" || !/^#[0-9a-f]{6}$/i.test(light.color) || typeof light.intensity !== "number" || !Number.isFinite(light.intensity) || light.intensity < 0 || light.intensity > 100)) throw new Error("light requires a hex color and intensity between 0 and 100");
    return {
      id: text(item.id, "id"), name: text(item.name, "name"), kind: item.kind as SceneObject["kind"], visible: item.visible,
      ...(assetPath ? { assetPath } : {}), ...(item.parentId === undefined ? {} : { parentId: text(item.parentId, "parentId") }),
      position: vector(item.position, legacyPosition, "position"), rotation: vector(item.rotation, [0, 0, 0], "rotation (radians)"), scale: vector(item.scale, [1, 1, 1], "scale", true),
      ...(light ? { light: { color: light.color as string, intensity: light.intensity as number } } : {}),
    };
  });
  const byId = new Map(objects.map((object) => [object.id, object]));
  if (byId.size !== objects.length) throw new Error("duplicate object ID");
  for (const object of objects) {
    const visited = new Set([object.id]);
    let parent = object.parentId;
    while (parent !== undefined) {
      if (!byId.has(parent)) throw new Error("unknown parent object");
      if (visited.has(parent)) throw new Error("cyclic object hierarchy");
      visited.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  const known = new Set(byId.keys());
  const camera = record(source.camera ?? { preset: "default" }, "camera");
  if (camera.preset !== undefined && !["default", "front", "back", "left", "right", "top"].includes(String(camera.preset))) throw new Error("unknown camera preset");
  if (camera.target !== undefined && !known.has(String(camera.target))) throw new Error("unknown camera target");
  const visibility = record(source.visibility ?? {}, "visibility");
  for (const [id, visible] of Object.entries(visibility)) if (!known.has(id) || typeof visible !== "boolean") throw new Error("invalid visibility override");
  if (!["edit", "inspect", "render"].includes(String(source.mode))) throw new Error("unknown mode");
  if (!Number.isSafeInteger(source.version) || (source.version as number) < 1) throw new Error("invalid scene version");
  if (source.activeAssetId !== undefined && !known.has(String(source.activeAssetId))) throw new Error("unknown active asset");
  return {
    projectId, objects, selectedIds: ids(source.selectedIds ?? [], known, "selectedIds"), highlightedIds: ids(source.highlightedIds ?? [], known, "highlightedIds"),
    ...(source.activeAssetId === undefined ? {} : { activeAssetId: source.activeAssetId as string }),
    visibility: { ...visibility } as Record<string, boolean>, camera: { ...camera } as SceneState["camera"], mode: source.mode as SceneState["mode"], version: source.version as number,
  };
}

export function applyScenePatch(scene: SceneState, raw: unknown): SceneState {
  const patch = record(raw, "scene patch");
  const allowed = new Set(["objects", "selectedIds", "highlightedIds", "activeAssetId", "visibility", "camera", "mode", "expectedVersion"]);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new Error(`unknown scene patch field: ${key}`);
  if (patch.expectedVersion !== undefined && patch.expectedVersion !== scene.version) throw new SceneConflictError("The scene changed. Reload it before applying this edit.");
  const { expectedVersion: _expected, ...changes } = patch;
  const merged: Record<string, unknown> = { ...scene, ...changes, version: scene.version + 1 };
  if (changes.camera) merged.camera = { ...scene.camera, ...record(changes.camera, "camera") };
  if (changes.activeAssetId === null) delete merged.activeAssetId;
  return normalizeScene(merged, scene.projectId);
}
