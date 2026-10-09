export const MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet" },
  { id: "claude-opus-5-5", label: "Claude Opus" },
  { id: "claude-haiku-5-5", label: "Claude Haiku" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
  { id: "deepseek-flash", label: "DeepSeek V4.1 Flash" },
  { id: "glm-5.3-flash", label: "GLM 5.3 Flash" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-haiku-5-5";

export function isModelId(value: string): value is ModelId {
  return MODELS.some((model) => model.id === value);
}

export type ProjectStatus = "idle" | "running" | "awaiting_approval" | "error";

export interface ProjectSummary {
  id: string;
  name: string;
  model: ModelId;
  status: ProjectStatus;
  updatedAt: string;
}

export interface Capabilities {
  skills: { name: string; description: string; status?: "ready" | "needs-tools" | "planning"; missingTools?: string[] }[];
  tools: { name: string; description: string; category: "workspace" | "triverse"; configured: boolean }[];
  services: { name: string; configured: boolean }[];
  mcpServers: { name: string; status: "signed-in" | "signed-out" | "signing-in"; connected?: boolean; toolCount?: number; error?: string }[];
}

export type SceneObjectKind = "environment" | "prop" | "light" | "camera";
export type Vec3 = [number, number, number];
export type CameraPreset = "default" | "front" | "back" | "left" | "right" | "top";

export interface SceneObject {
  id: string;
  name: string;
  kind: SceneObjectKind;
  assetPath?: string;
  visible: boolean;
  parentId?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  light?: { color: string; intensity: number };
}

export interface SceneState {
  projectId: string;
  objects: SceneObject[];
  selectedIds: string[];
  highlightedIds: string[];
  activeAssetId?: string;
  visibility: Record<string, boolean>;
  camera: {
    target?: string;
    preset?: CameraPreset;
  };
  mode: "edit" | "inspect" | "render";
  version: number;
}

export interface ToolRow {
  id: string;
  name: string;
  state: "running" | "done" | "error" | "needs_confirmation";
  summary: string;
  imagePath?: string;
  filePath?: string;
}

export interface ChatImage {
  name: string;
  mimeType: string;
  path: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolRow[];
  createdAt: string;
  images?: ChatImage[];
  durationMs?: number;
}

export interface FileNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

export interface ApprovalRequest {
  id: string;
  tool: string;
  summary: string;
  quote: unknown;
}

export interface TerminalLine {
  at: string;
  line: string;
}

export interface TaskRecord {
  id: string;
  flow: string;
  status: string;
  assetPath?: string;
  operationId?: string;
  billing?: { status: string; credits_amount?: number | null };
  recoveryAction?: string;
  results?: { task_id: string; asset_id: string; item_id: string }[];
  error?: string;
  updatedAt: string;
}

export interface VersionRecord {
  id: string;
  path: string;
  createdAt: string;
  note: string;
  sourcePath?: string;
  sha256?: string;
}

export type ScenePatch = Partial<Pick<SceneState, "objects" | "selectedIds" | "highlightedIds" | "visibility" | "camera" | "mode">> & { activeAssetId?: string | null; expectedVersion?: number };

export { normalizeScene, applyScenePatch, SceneConflictError } from "./scene.js";

export type AgentEvent =
  | { type: "status"; phase: string; label: string; progress?: number }
  | { type: "text"; delta: string }
  | { type: "message"; message: ChatMessage }
  | { type: "tool"; tool: ToolRow }
  | { type: "approval"; approval: ApprovalRequest }
  | { type: "scene"; scene: SceneState }
  | { type: "terminal"; line: string }
  | { type: "done"; status: ProjectStatus }
  | { type: "error"; message: string };

export function emptyScene(projectId: string): SceneState {
  return {
    projectId,
    objects: [],
    selectedIds: [],
    highlightedIds: [],
    visibility: {},
    camera: { preset: "default" },
    mode: "edit",
    version: 1,
  };
}
