import {
  DEFAULT_MODEL,
  emptyScene,
  isModelId,
  type ChatMessage,
  type FileNode,
  type ModelId,
  type ProjectSummary,
  type SceneState,
  type TaskRecord,
  type VersionRecord,
  type ApprovalRequest,
} from "@triverse/protocol";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile, appendFile, access, rename } from "node:fs/promises";
import path from "node:path";
import { atomicJson, jsonFile, controlDir } from "./storage.js";
import { realInside, resolveInside } from "./paths.js";
import { syncSkills } from "./skill-catalog.js";
import { readScene, writeScene } from "./scene.js";

export const AGENT_RULES = `You are the Triverse 3D agent in this workspace. Chat is only the control channel.
Read scene/scene.json before you change the scene. "this" means selectedIds or activeAssetId.
Use only mcp__triverse__ tools for remote Triverse tasks, generation, assets, and exports. Direct Triverse API access is disabled; do not call it from bash or scripts.
Discover the actual MCP tool schemas and names.
Your current tool list and the MCP server section are authoritative. Do not infer capabilities from old chat messages, archived tool results, or configuration files.
If your current tool list includes any mcp__triverse__ tool, MCP is connected. Do not ask the user to sign in again or to start a new chat.
If MCP is not connected, ask the user to sign in through Capabilities → MCP. Never ask for a Triverse API key.
inspect_asset reads a glb already in this workspace and does not spend credits.
When the user asks for a picture, concept image, or illustration, call generate_image. It uses TeamoRouter gpt-image-2.5-sunburst at 1024x1024 and spends image credits. Do not call it for 3D models, and do not call it unless the user asked for an image.
Paid MCP calls quote first. For quote_* / create_* tools, take the quote receipt to request_creation_approval with complete create arguments (including prompt, explicit visibility, stable operation_id and max_credits). Wait for the user to approve; then use exactly those arguments once. For legacy tools with confirm, keep confirm false until approval.
An uncertain creation outcome is recovered with get_operation and the same operation_id, not a new create call.
Write status lines. Do not greet the user.
Do not request Hi3D or any host other than the tools you already have.
Do not write secrets into files.
Shell is available only when an operating-system sandbox can enforce workspace access, protect control files, and disable network access. Never use shell to bypass approval or remote tools.
Use read_scene, add_scene_asset and update_scene for scene changes. Positions use glTF meters; rotations use XYZ radians; scale must be positive. update_scene requires the version read before editing. The viewer executes camera presets and targets. Preserve existing objects and hierarchy.
Before changing an existing model, use save_asset_version. For delivery use inspect_asset and export_asset_pack; report failed budgets and incomplete topology checks. No local check certifies printability.
Images the user attaches are saved under refs/ and shown to you inline. Use those workspace paths for image input. Do not ask the user to upload the same image again.
`;

export interface ProjectPaths {
  id: string;
  root: string;
  workspace: string;
  metaFile: string;
  sceneFile: string;
  messagesFile: string;
  tasksFile: string;
  approvalsFile: string;
  versionsFile: string;
  terminalFile: string;
}

export interface StoredApproval extends ApprovalRequest {
  granted: boolean;
  used: boolean;
  arguments?: Record<string, unknown>;
  expiresAt?: string;
  schema?: Record<string, any>;
}

export function projectPaths(dataDir: string, id: string): ProjectPaths {
  const root = path.join(dataDir, "projects", id);
  const workspace = path.join(root, "workspace");
  return {
    id,
    root,
    workspace,
    metaFile: path.join(root, "meta.json"),
    sceneFile: path.join(workspace, "scene", "scene.json"),
    messagesFile: path.join(workspace, ".triverse", "messages.json"),
    tasksFile: path.join(controlDir(workspace), "tasks.json"),
    approvalsFile: path.join(controlDir(workspace), "approvals.json"),
    versionsFile: path.join(controlDir(workspace), "versions.json"),
    terminalFile: path.join(workspace, ".triverse", "terminal.log"),
  };
}

export async function createProject(dataDir: string, skillsDir: string, name: string): Promise<ProjectSummary> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error("name is required");
  const id = randomUUID();
  const paths = projectPaths(dataDir, id);
  const dirs = ["scene", "assets", "assets/generated", "textures", "refs", "renders", "images", "scripts", "notes", "versions", ".triverse/skills", ".triverse/sessions"];
  await Promise.all(dirs.map((dir) => mkdir(path.join(paths.workspace, dir), { recursive: true })));
  await mkdir(controlDir(paths.workspace), { recursive: true, mode: 0o700 });
  const now = new Date().toISOString();
  const meta: ProjectSummary = { id, name: trimmed, model: DEFAULT_MODEL, status: "idle", updatedAt: now };

  await writeFile(path.join(paths.workspace, "project.triverse.json"), `${JSON.stringify({ id, name: trimmed, createdAt: now }, null, 2)}\n`);
  await writeFile(path.join(paths.workspace, "AGENTS.md"), AGENT_RULES);
  await writeFile(path.join(paths.workspace, ".triverse", "agent.md"), AGENT_RULES);
  await writeScene(paths.sceneFile, id, emptyScene(id));
  await writeFile(paths.messagesFile, "[]\n");
  await writeFile(paths.tasksFile, "[]\n");
  await writeFile(paths.approvalsFile, "[]\n");
  await writeFile(paths.versionsFile, "[]\n");
  await writeFile(paths.terminalFile, "");
  await copySkills(skillsDir, paths.workspace);
  await atomicJson(paths.metaFile,meta);
  return meta;
}

export async function copySkills(skillsDir: string, workspace: string): Promise<void> {
  await syncSkills(skillsDir, workspace);
}

export async function listProjects(dataDir: string): Promise<ProjectSummary[]> {
  let names: string[] = [];
  try {
    names = await readdir(path.join(dataDir, "projects"));
  } catch {
    return [];
  }
  const projects = await Promise.all(names.map(async (id) => readMeta(dataDir, id)));
  return projects.filter((item): item is ProjectSummary => item !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readMeta(dataDir: string, id: string): Promise<ProjectSummary | null> {
  try {
    const meta = JSON.parse(await readFile(projectPaths(dataDir, id).metaFile, "utf8")) as ProjectSummary;
    if (!isModelId(meta.model)) return null;
    return meta;
  } catch {
    return null;
  }
}

export async function updateMeta(dataDir: string, id: string, patch: Partial<ProjectSummary>): Promise<ProjectSummary> {
  const current = await readMeta(dataDir, id);
  if (!current) throw new Error("project not found");
  const next = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  if (patch.model && !isModelId(patch.model)) throw new Error("unknown model");
  await atomicJson(projectPaths(dataDir, id).metaFile, next);
  return next;
}

export const readJson = jsonFile;
export const writeJson = atomicJson;

export async function appendTerminal(file: string, line: string): Promise<void> {
  await appendFile(file, `${new Date().toISOString()} ${line}\n`);
}

export async function readTerminal(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).slice(-200);
}

export async function fileTree(workspace: string): Promise<FileNode> {
  return walk(workspace, workspace);
}

async function walk(workspace: string, directory: string): Promise<FileNode> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children: FileNode[] = [];
  for (const entry of entries) {
    if (["node_modules", ".triverse", "AGENTS.md"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const relative = path.relative(workspace, full);
    if (entry.isDirectory()) {
      children.push(await walk(workspace, full));
    } else if (entry.isFile()) {
      const info = await stat(full);
      children.push({ path: relative, name: entry.name, kind: "file", size: info.size });
    }
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  return { path: path.relative(workspace, directory), name: path.basename(directory), kind: "dir", children };
}

export type { ChatMessage, ModelId, SceneState, TaskRecord, VersionRecord };

/** Upgrade old project storage without carrying untrusted approval grants forward. */
export async function ensureProjectStorage(dataDir:string,id:string):Promise<void> {
  const paths=projectPaths(dataDir,id);
  await mkdir(controlDir(paths.workspace),{recursive:true,mode:0o700});
  for(const directory of ["versions","assets/generated"]) await mkdir(await realInside(paths.workspace,path.join(paths.workspace,directory)),{recursive:true});
  try {await access(paths.versionsFile);} catch(error) {
    if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error;
    const legacy=await jsonFile<VersionRecord[]>(path.join(paths.workspace,".triverse/versions.json"),[]);
    const versions:VersionRecord[]=[];
    for (const item of legacy) {
      try {const file=await realInside(paths.workspace,resolveInside(paths.workspace,item.path));await access(file);versions.push({id:item.id,path:item.path,createdAt:item.createdAt,note:`Legacy snapshot (unverified): ${item.note || item.path}`});}catch {/* retain only readable in-workspace historical assets */}
    }
    await atomicJson(paths.versionsFile,versions);
  }
  const rules=await realInside(paths.workspace,path.join(paths.workspace,"AGENTS.md"));
  if (await readFile(rules,"utf8").catch(()=>"") !== AGENT_RULES) {
    const temporary=path.join(controlDir(paths.workspace),`rules-${randomUUID()}.tmp`);
    await writeFile(temporary,AGENT_RULES,{mode:0o600});await rename(temporary,rules);
  }
}
