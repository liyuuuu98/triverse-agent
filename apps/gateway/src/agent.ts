import {
  createAgentSession,
  createBashToolDefinition,
  createLocalBashOperations,
  createEditToolDefinition,
  createMcpExtension,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  detectSupportedImageMimeTypeFromFile,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionFactory,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { MODELS, type AgentEvent, type ChatImage, type ModelId, type ToolRow } from "@triverse/protocol";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runtimeCapabilities, skillStatus } from "./skill-status.js";
import { bindAgentDir, discoverMcpTools, ensureMcpConfig } from "./mcp.js";
import { savedImagePath } from "./image-gen.js";
import { modelText } from "./images.js";
import { realInside, resolveInside } from "./paths.js";
import { AGENT_RULES, copySkills, ensureProjectStorage, projectPaths, type ProjectPaths } from "./projects.js";
import { prepareBash, shellAvailable } from "./sandbox.js";
import { createWorkflowTools } from "./workflow.js";
import { createImageTool, createLocalAssetTools } from "./tools.js";
import { createMcpApprovalExtension } from "./mcp-approval.js";
import { createSecretRedactionExtension, redactSecrets } from "./secrets.js";

interface LiveSession {
  model: ModelId;
  session: AgentSession;
  emit: (event: AgentEvent) => void;
  unsubscribe: () => void;
}

export interface PromptInput {
  dataDir: string;
  skillsDir: string;
  projectId: string;
  model: ModelId;
  text: string;
  images?: ChatImage[];
  emit: (event: AgentEvent) => void;
  apiKey: string;
  baseUrl: string;
}

const sessions = new Map<string, LiveSession>();

export function hasSession(projectId: string): boolean {
  return sessions.has(projectId);
}

export async function promptProject(input: PromptInput): Promise<void> {
  const live = await ensureSession(input);
  live.emit = input.emit;
  input.emit({ type: "status", phase: "Planning", label: "Planning" });
  const images = input.images ?? [];
  const paths = projectPaths(input.dataDir, input.projectId);
  const encoded = [];
  for (const image of images) {
    const absolute = await realInside(paths.workspace, resolveInside(paths.workspace, image.path));
    encoded.push({ type: "image" as const, data: (await readFile(absolute)).toString("base64"), mimeType: image.mimeType });
  }
  await live.session.prompt(modelText(input.text, images), encoded.length ? { images: encoded } : undefined);
}

export async function abortProject(projectId: string): Promise<void> {
  const live = sessions.get(projectId);
  if (live) await live.session.abort();
}

export async function dropProject(projectId: string): Promise<void> {
  const live = sessions.get(projectId);
  if (!live) return;
  sessions.delete(projectId);
  live.unsubscribe();
  await live.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
  live.session.dispose();
}

export async function dropAllProjects(): Promise<void> {
  await Promise.all([...sessions.keys()].map((projectId) => dropProject(projectId)));
}

function isClaudeModel(modelId: string): boolean {
  return modelId.startsWith("claude-");
}

export function providerForModel(modelId: string): "teamo" | "teamo-anthropic" {
  return isClaudeModel(modelId) ? "teamo-anthropic" : "teamo";
}

/** Anthropic SDKs append `/v1/messages`. The OpenAI base URL already ends in `/v1`. */
export function anthropicBaseUrl(openAiBaseUrl: string): string {
  return openAiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function catalogModel(model: { id: string; label: string }, protocol: "openai" | "anthropic") {
  const entry = {
    id: model.id,
    name: model.label,
    reasoning: false,
    input: ["text", "image"] as const,
    contextWindow: 200000,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  if (protocol === "anthropic") return entry;
  return {
    ...entry,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens" as const,
    },
  };
}

export async function writeModelCatalog(file: string, baseUrl: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const claude = MODELS.filter((model) => isClaudeModel(model.id));
  const openai = MODELS.filter((model) => !isClaudeModel(model.id));
  const body = {
    providers: {
      teamo: {
        baseUrl,
        api: "openai-completions",
        apiKey: "${TEAMO_API_KEY}",
        models: openai.map((model) => catalogModel(model, "openai")),
      },
      "teamo-anthropic": {
        baseUrl: anthropicBaseUrl(baseUrl),
        api: "anthropic-messages",
        apiKey: "${TEAMO_API_KEY}",
        models: claude.map((model) => catalogModel(model, "anthropic")),
      },
    },
  };
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`);
}

export async function ensureSession(input: PromptInput): Promise<LiveSession> {
  const existing = sessions.get(input.projectId);
  if (existing?.model === input.model) return existing;
  if (existing) await dropProject(input.projectId);
  const paths = projectPaths(input.dataDir, input.projectId);
  await mkdir(paths.workspace,{recursive:true});
  await ensureProjectStorage(input.dataDir, input.projectId);
  await copySkills(input.skillsDir, paths.workspace);
  const agentDir = bindAgentDir(input.dataDir);
  ensureMcpConfig(agentDir);
  await mkdir(agentDir, { recursive: true });
  await mkdir(path.join(paths.workspace, ".triverse", "sessions"), { recursive: true });
  const catalog = path.join(agentDir, "models.json");
  await writeModelCatalog(catalog, input.baseUrl);
  const authPath = path.join(agentDir, "auth.json");
  await readFile(authPath).catch(() => writeFile(authPath, "{}\n"));
  const runtime = await ModelRuntime.create({
    authPath,
    modelsPath: catalog,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const provider = providerForModel(input.model);
  const model = runtime.getModel(provider, input.model);
  if (!model) throw new Error(`model not in ${provider} catalog`);
  const settingsManager = SettingsManager.create(paths.workspace, agentDir);
  const cell: { emit: (event: AgentEvent) => void } = { emit: () => undefined };
  const discovered = await discoverMcpTools(agentDir);
  const availableTools = [...createAgentTools({ workspace: paths.workspace }).map((tool) => tool.name), ...discovered.tools.map((tool) => `mcp__triverse__${tool.name}`), ...await runtimeCapabilities()];
  const loader = createWorkspaceLoader({
    workspace: paths.workspace,
    agentDir,
    skillsDir: input.skillsDir,
    settingsManager,
    approval: createMcpApprovalExtension(paths, (event) => cell.emit(event)),
    availableTools,
  });
  await loader.reload();
  const tools = createAgentTools({
    workspace: paths.workspace,
    emit: (event) => cell.emit(event),
    imageApi: { apiKey: input.apiKey, baseUrl: input.baseUrl },
  });
  const { session } = await createAgentSession({
    cwd: paths.workspace,
    agentDir,
    modelRuntime: runtime,
    model,
    thinkingLevel: "off",
    noTools: "builtin",
    tools: [...tools.map((tool) => tool.name), "mcp__triverse__*"],
    customTools: tools,
    resourceLoader: loader,
    sessionManager: await openProjectSession(paths),
    settingsManager,
  });
  const live: LiveSession = {
    model: input.model,
    session,
    emit: input.emit,
    unsubscribe: () => undefined,
  };
  cell.emit = (event) => live.emit(event);
  live.unsubscribe = session.subscribe((event) => {
    translate(event, (next) => live.emit(next), paths);
  });
  try {
    // MCP servers connect on session_start. createAgentSession does not emit it.
    await session.bindExtensions({});
  } catch (error) {
    live.unsubscribe();
    session.dispose();
    throw error;
  }
  sessions.set(input.projectId, live);
  return live;
}

export function createWorkspaceLoader(input: {
  workspace: string;
  agentDir: string;
  skillsDir: string;
  settingsManager: SettingsManager;
  approval: ExtensionFactory;
  availableTools?: string[];
}): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: input.workspace,
    agentDir: input.agentDir,
    settingsManager: input.settingsManager,
    noSkills: true,
    additionalSkillPaths: [path.join(input.workspace, ".triverse", "skills")],
    skillsOverride: (base) => ({ ...base, skills: base.skills.map((skill) => ({ ...skill, disableModelInvocation: skill.disableModelInvocation || skillStatus(skill, input.availableTools ?? []).status !== "ready" })) }),
    appendSystemPrompt: [AGENT_RULES],
    extensionFactories: [
      { name: "mcp", factory: createMcpExtension({ startupWaitMs: 20_000 }), builtin: true },
      createSecretRedactionExtension,
      input.approval,
    ],
    additionalExtensionPaths: ["builtin:mcp"],
    noExtensions: true,
  });
}

export function createAgentTools(context: {
  workspace: string;
  emit?: (event: AgentEvent) => void;
  imageApi?: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch };
}): ToolDefinition[] {
  return [
    ...fileTools(context.workspace),
    ...createLocalAssetTools(context),
    ...createWorkflowTools(context.workspace, context.emit),
    createImageTool({
      workspace: context.workspace,
      apiKey: context.imageApi?.apiKey ?? "",
      baseUrl: context.imageApi?.baseUrl ?? "",
      fetchImpl: context.imageApi?.fetchImpl,
    }),
  ] as ToolDefinition[];
}

export async function openProjectSession(paths: ProjectPaths): Promise<SessionManager> {
  const sessionsDir = path.join(paths.workspace, ".triverse", "sessions");
  return SessionManager.continueRecent(paths.workspace, sessionsDir);
}

function workspaceBash(workspace: string) {
  const operations = createLocalBashOperations();
  return createBashToolDefinition(workspace, {
    exposeSessionEnvironment: false,
    spawnHook: (call) => prepareBash(workspace, call),
    operations: { exec: (command, cwd, options) => operations.exec(command, cwd, { ...options, timeout: Math.min(options.timeout ?? 60, 60) }) },
  });
}

function fileTools(workspace: string) {
  const guard = (file: string) => realInside(workspace, file);
  const writable = async (file: string) => {
    const target = await guard(file), relative = path.relative(await realInside(workspace, workspace), target);
    if ([".triverse", "versions", "assets/generated", "AGENTS.md", "scene/scene.json"].some(prefix => relative === prefix || relative.startsWith(prefix + path.sep))) throw new Error("Protected workspace metadata; use the dedicated scene/version tools.");
    return target;
  };
  return [
    createReadToolDefinition(workspace, {
      operations: {
        readFile: async (file) => readFile(await guard(file)),
        access: async (file) => {
          await access(await guard(file), constants.R_OK);
        },
        detectImageMimeType: async (file) => detectSupportedImageMimeTypeFromFile(await guard(file)),
      },
    }),
    createWriteToolDefinition(workspace, {
      operations: {
        writeFile: async (file, content) => {
          const target = await writable(file);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, content, "utf8");
        },
        mkdir: async (dir) => {
          await mkdir(await writable(dir), { recursive: true });
        },
      },
    }),
    createEditToolDefinition(workspace, {
      operations: {
        readFile: async (file) => readFile(await guard(file)),
        writeFile: async (file, content) => {
          await writeFile(await writable(file), content, "utf8");
        },
        access: async (file) => {
          await access(await guard(file), constants.R_OK | constants.W_OK);
        },
      },
    }),
    ...(shellAvailable(workspace) ? [workspaceBash(workspace)] : []),
  ];
}

export function modelFailure(messages: readonly { role: string; stopReason?: string; errorMessage?: string }[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (message.stopReason !== "error") return undefined;
    return readableProviderError(message.errorMessage);
  }
  return undefined;
}

export function readableProviderError(errorMessage: string | undefined): string {
  const raw = errorMessage?.trim() ?? "";
  const start = raw.indexOf("{");
  let detail = raw;
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { error?: { message?: unknown } };
      if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) detail = parsed.error.message.trim();
    } catch {
      // The provider text is not JSON.
    }
  }
  if (!detail) return "The model did not respond.";
  if (detail.length > 500) detail = `${detail.slice(0, 500)}…`;
  return detail.startsWith("The model did not respond") ? detail : `The model did not respond. ${detail}`;
}

function translate(event: AgentSessionEvent, emit: (event: AgentEvent) => void, paths: ProjectPaths): void {
  if (event.type === "agent_end" && !event.willRetry) {
    const failure = modelFailure(event.messages);
    if (failure) emit({ type: "error", message: failure });
    return;
  }
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    emit({ type: "text", delta: event.assistantMessageEvent.delta });
    return;
  }
  if (event.type === "tool_execution_start") {
    emit({ type: "status", phase: phaseFor(event.toolName), label: event.toolName });
    emit({
      type: "tool",
      tool: { id: event.toolCallId, name: event.toolName, state: "running", summary: summarize(event.args) },
    });
    return;
  }
  if (event.type === "tool_execution_end") {
    emit({ type: "tool", tool: finishedTool(event) });
    return;
  }
  if (event.type === "bash_execution_update") {
    for (const line of event.delta.split("\n")) {
      const trimmed = redactSecrets(line.trimEnd());
      if (!trimmed) continue;
      emit({ type: "terminal", line: trimmed.slice(0, 2000) });
      void appendLine(paths.terminalFile, trimmed.slice(0, 2000));
    }
  }
}

async function appendLine(file: string, line: string): Promise<void> {
  const { appendTerminal } = await import("./projects.js");
  await appendTerminal(file, line);
}

export function finishedTool(event: { toolCallId: string; toolName: string; isError: boolean; result: unknown }): ToolRow {
  const summary = redactSecrets(resultText(event.result)).slice(0, 400);
  const imagePath = event.isError ? undefined : savedImagePath(event.result);
  const candidate = (event.result as { details?: { filePath?: unknown } } | null)?.details?.filePath;
  const filePath = !event.isError && event.toolName === "export_asset_pack" && typeof candidate === "string" && /^exports\/[a-zA-Z0-9_-]+\.zip$/.test(candidate) ? candidate : undefined;
  return {
    id: event.toolCallId,
    name: event.toolName,
    state: event.isError ? "error" : summary.startsWith("Needs confirmation") ? "needs_confirmation" : "done",
    summary,
    ...(imagePath ? { imagePath } : {}),
    ...(filePath ? { filePath } : {}),
  };
}

function phaseFor(name: string): string {
  if (name === "inspect_asset") return "Inspect";
  if (name === "generate_image") return "Image";
  if (name === "bash") return "Shell";
  if (name.startsWith("mcp__")) return "Triverse";
  return "Work";
}

function summarize(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const prompt = record.prompt ?? record.path ?? record.command ?? record.task_id;
  return typeof prompt === "string" ? prompt.slice(0, 160) : "";
}

function resultText(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
    .join("");
}
