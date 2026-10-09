import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { applyScenePatch, type AgentEvent, type VersionRecord } from "@triverse/protocol";
import { Type } from "typebox";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { zipSync } from "fflate";
import { generateImage } from "./image-gen.js";
import { inspectGlb } from "./inspect.js";
import { realInside, resolveInside } from "./paths.js";
import { exclusive, readScene, updateScene } from "./scene.js";
import { fileTree, readJson, writeJson } from "./projects.js";
import { controlDir } from "./storage.js";
import { createCreationApprovalTool } from "./mcp-approval.js";

interface Context { workspace: string; emit?: (event: AgentEvent) => void }
const vector = () => Type.Tuple([Type.Number(), Type.Number(), Type.Number()]);

export function createLocalAssetTools(ctx: Context): ToolDefinition[] {
  const sceneFile = path.join(ctx.workspace, "scene/scene.json");
  const projectId = path.basename(path.dirname(ctx.workspace));
  const emit = ctx.emit ?? (() => undefined);
  async function local(relative: string) { return realInside(ctx.workspace, resolveInside(ctx.workspace, relative)); }
  async function mesh(relative: string) {
    if (!relative.toLowerCase().endsWith(".glb")) throw new Error("Use a workspace GLB file.");
    const file = await local(relative);
    if ((await stat(file)).size > 200_000_000) throw new Error("GLB exceeds the 200 MB inspection limit.");
    const bytes = await readFile(file);
    return { file, bytes, report: inspectGlb(bytes) };
  }
  const tool = (name: string, description: string, parameters: any, execute: (params: any) => Promise<unknown>): ToolDefinition => defineTool({
    name, label: name, description, promptSnippet: description, executionMode: "sequential", parameters,
    execute: async (_id, params) => {
      try {
        const result = await execute(params), response = ok(JSON.stringify(result));
        if (name === "export_asset_pack" && result && typeof result === "object" && "path" in result) response.details = { text: JSON.stringify(result), filePath: result.path };
        return response;
      } catch (error) { return fail(error instanceof Error ? error.message : "tool failed"); }
    },
  });
  return [
    tool("inspect_asset", "Inspect a local GLB: counts, transformed bounds, UV/normals, animation names and bounded topology audit. This does not spend credits or certify printability.", Type.Object({ path: Type.String() }), async ({ path: relative }) => {
      const file = await local(relative);
      if ((await stat(file)).size > 200_000_000) throw new Error("File exceeds inspection limit.");
      const bytes = await readFile(file);
      if (bytes.subarray(0, 4).toString("utf8") !== "glTF") throw new Error(`not a mesh: ${bytes.length} bytes; provide a GLB`);
      return inspectGlb(bytes);
    }),
    tool("list_workspace_files", "List workspace files excluding internal metadata and dependencies. Use before choosing an existing local asset.", Type.Object({}), async () => fileTree(ctx.workspace)),
    tool("read_scene", "Read the current scene, selection and version before editing.", Type.Object({}), async () => readScene(sceneFile, projectId)),
    tool("update_scene", "Apply a scene patch with expectedVersion. Objects support position/rotation (radians)/scale, parentId, visibility and lights. Read first; preserve objects not being changed.", Type.Object({
      patch: Type.Object({ expectedVersion: Type.Integer({ minimum: 1 }), objects: Type.Optional(Type.Array(Type.Any())), selectedIds: Type.Optional(Type.Array(Type.String())), highlightedIds: Type.Optional(Type.Array(Type.String())), activeAssetId: Type.Optional(Type.Union([Type.String(), Type.Null()])), visibility: Type.Optional(Type.Record(Type.String(), Type.Boolean())), camera: Type.Optional(Type.Object({ target: Type.Optional(Type.String()), preset: Type.Optional(Type.Union([Type.Literal("default"), Type.Literal("front"), Type.Literal("back"), Type.Literal("left"), Type.Literal("right"), Type.Literal("top")])) })), mode: Type.Optional(Type.Union([Type.Literal("edit"), Type.Literal("inspect"), Type.Literal("render")])) }),
    }), async ({ patch }) => {
      if (patch.objects) for (const object of patch.objects) if (object.assetPath) await mesh(object.assetPath);
      const scene = await updateScene(sceneFile, projectId, (current) => applyScenePatch(current, patch));
      emit({ type: "scene", scene }); return scene;
    }),
    tool("add_scene_asset", "Add an existing GLB to the scene without changing the source file. A stable object id updates that existing object instead of duplicating it.", Type.Object({ path: Type.String(), name: Type.String(), id: Type.Optional(Type.String()), position: Type.Optional(vector()), rotation: Type.Optional(vector()), scale: Type.Optional(vector()) }), async (params) => {
      const asset = await mesh(params.path);
      const id = params.id ?? randomUUID();
      const scene = await updateScene(sceneFile, projectId, (current) => {
        const existing = current.objects.find((object) => object.id === id);
        const object = { ...existing, id, name: params.name, kind: existing?.kind ?? "prop" as const, assetPath: params.path, visible: existing?.visible ?? true,
          position: params.position ?? existing?.position ?? [0,0,0], rotation: params.rotation ?? existing?.rotation ?? [0,0,0], scale: params.scale ?? existing?.scale ?? [1,1,1] };
        return applyScenePatch(current, { objects: existing ? current.objects.map((item) => item.id === id ? object : item) : [...current.objects, object], selectedIds: [id], activeAssetId: id });
      });
      emit({ type: "scene", scene }); return { objectId: id, scene, report: asset.report };
    }),
    tool("save_asset_version", "Preserve an immutable GLB version and scene snapshot before changes. Returns a new path, hash and version id.", Type.Object({ path: Type.String(), note: Type.Optional(Type.String()) }), async ({ path: relative, note }) => {
      const asset = await mesh(relative), id = randomUUID();
      const destination = `versions/${id}/${path.basename(relative)}`;
      const file = await local(destination); await mkdir(path.dirname(file), { recursive: true }); await copyFile(asset.file, file);
      await writeFile(await local(`versions/${id}/scene.json`), JSON.stringify(await readScene(sceneFile, projectId), null, 2));
      const record: VersionRecord = { id, path: destination, sourcePath: relative, createdAt: new Date().toISOString(), note: note ?? "Asset snapshot", sha256: createHash("sha256").update(asset.bytes).digest("hex") };
      const history = path.join(controlDir(ctx.workspace), "versions.json");
      await mkdir(path.dirname(history), { recursive: true });
      await exclusive(history, async () => { const records = await readJson<VersionRecord[]>(history, []); records.push(record); await writeJson(history, records); });
      return { version: record, report: asset.report };
    }),
    tool("export_asset_pack", "Create a local ZIP with selected GLBs, scene.json and manifest.json containing counts, topology warnings and hashes. Keeps source files unchanged; no remote export or credits.", Type.Object({ paths: Type.Array(Type.String(), { minItems: 1, maxItems: 50 }), name: Type.Optional(Type.String()), triangle_budget: Type.Optional(Type.Integer({ minimum: 1 })) }), async (params) => {
      const files: Record<string, Uint8Array> = {}, assets = []; let totalBytes = 0;
      for (const relative of new Set<string>(params.paths)) {
        const asset = await mesh(relative); totalBytes += asset.bytes.length;
        if (totalBytes > 300_000_000) throw new Error("Asset pack exceeds the 300 MB uncompressed limit.");
        // Keep the scene's lexical path: realpath can expand /var to /private/var on macOS.
        const archivePath = path.relative(path.resolve(ctx.workspace), resolveInside(ctx.workspace, relative)).split(path.sep).join("/");
        if (archivePath === "scene.json" || archivePath === "manifest.json") throw new Error("reserved archive path");
        if (asset.report.warnings.some((warning) => /external|missing buffers/i.test(warning))) throw new Error(`${relative} has external dependencies; embed them before packing.`);
        files[archivePath] = asset.bytes;
        assets.push({ path: archivePath, sha256: createHash("sha256").update(asset.bytes).digest("hex"), report: asset.report, withinTriangleBudget: params.triangle_budget === undefined ? null : asset.report.triangles <= params.triangle_budget });
      }
      const sourceScene = await readScene(sceneFile, projectId), included = new Set(assets.map((asset) => asset.path));
      const packedPath = (value: string) => path.relative(path.resolve(ctx.workspace), resolveInside(ctx.workspace, value)).split(path.sep).join("/");
      const kept = new Set(sourceScene.objects.filter((object) => !object.assetPath || included.has(packedPath(object.assetPath))).map((object) => object.id));
      const byId = new Map(sourceScene.objects.map((object) => [object.id, object]));
      // Retain omitted parents as transform groups so children keep their world positions.
      for (const id of kept) {
        let parent = byId.get(id)?.parentId;
        while (parent) { kept.add(parent); parent = byId.get(parent)?.parentId; }
      }
      const objects = sourceScene.objects.filter((object) => kept.has(object.id)).map((object) => {
        if (!object.assetPath) return object;
        const assetPath = packedPath(object.assetPath);
        return included.has(assetPath) ? { ...object, assetPath } : { ...object, assetPath: undefined };
      });
      const ids = new Set(objects.map((object) => object.id));
      const packedScene = { ...sourceScene, objects: objects.map((object) => ids.has(object.parentId ?? "") ? object : { ...object, parentId: undefined }), selectedIds: sourceScene.selectedIds.filter((id) => ids.has(id)), highlightedIds: sourceScene.highlightedIds.filter((id) => ids.has(id)), activeAssetId: ids.has(sourceScene.activeAssetId ?? "") ? sourceScene.activeAssetId : undefined,
        visibility: Object.fromEntries(Object.entries(sourceScene.visibility).filter(([id]) => ids.has(id))), camera: ids.has(sourceScene.camera.target ?? "") ? sourceScene.camera : { preset: sourceScene.camera.preset } };
      const manifest = { formatVersion: 1, createdAt: new Date().toISOString(), assets, triangles: assets.reduce((sum, asset) => sum + asset.report.triangles, 0), bytes: totalBytes, triangleBudgetPerAsset: params.triangle_budget ?? null, printabilityVerified: false };
      files["manifest.json"] = Buffer.from(JSON.stringify(manifest,null,2)); files["scene.json"] = Buffer.from(JSON.stringify(packedScene,null,2));
      const stem = (params.name ?? "asset-pack").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,64) || "asset-pack";
      const destination = `exports/${stem}-${randomUUID()}.zip`, file = await local(destination); await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, zipSync(files, { level: 1 }));
      return { path: destination, manifest };
    }),
    defineTool(createCreationApprovalTool({ approvalsFile: path.join(controlDir(ctx.workspace), "approvals.json") }, emit)),
  ];
}
const IMAGE_TOOL_DESCRIPTION = "Generate one picture with TeamoRouter gpt-image-2.5-sunburst at 1024x1024 and save it under images/. Call this only when the user asks for a picture, concept image, or illustration. It spends image credits. Do not call it for a 3D model, mesh, or scene.";

export function createImageTool(input: { workspace: string; apiKey: string; baseUrl: string; fetchImpl?: typeof fetch }): ToolDefinition {
  return defineTool({
    name: "generate_image",
    label: "generate_image",
    description: IMAGE_TOOL_DESCRIPTION,
    promptSnippet: "Generate a picture with gpt-image-2.5-sunburst",
    executionMode: "sequential",
    parameters: Type.Object({ prompt: Type.String({ description: "What the picture should show." }) }),
    execute: async (_id, params: { prompt?: string }) => {
      if (!input.apiKey) return fail("TEAMO_API_KEY is not set");
      try {
        const image = await generateImage({ baseUrl: input.baseUrl, apiKey: input.apiKey, prompt: params.prompt ?? "", fetchImpl: input.fetchImpl });
        const relative = `images/${randomUUID()}.${image.extension}`;
        const file = await realInside(input.workspace, resolveInside(input.workspace, relative));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, image.bytes);
        return { content: [{ type: "text", text: `Saved ${relative}` }], details: { imagePath: relative } };
      } catch (error) {
        return fail(error instanceof Error ? error.message : "image generation failed");
      }
    },
  });
}

function ok(text: string): AgentToolResult<unknown> { return { content: [{ type: "text", text }], details: { text } }; }
function fail(text: string): AgentToolResult<unknown> { return { content: [{ type: "text", text }], details: { text }, isError: true }; }
