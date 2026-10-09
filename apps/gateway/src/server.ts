import { createHash, randomUUID } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isModelId,
  MODELS,
  DEFAULT_MODEL,
  applyScenePatch,
  SceneConflictError,
  type AgentEvent,
  type ApprovalRequest,
  type ChatImage,
  type ChatMessage,
  type ModelId,
  type ProjectStatus,
  type ToolRow,
} from "@triverse/protocol";
import { abortProject, dropAllProjects, dropProject, hasSession, promptProject } from "./agent.js";
import { readIncomingImages, saveChatImages, type IncomingImage } from "./images.js";
import { applyTurnDurations, sessionTurnDurations } from "./turn-time.js";
import { acceptHostedCallback, hostedCallbackPath, beginMcpSignIn, bindAgentDir, ensureMcpConfig, mcpStatus, submitMcpRedirect } from "./mcp.js";
import { contentType, realInside, resolveInside } from "./paths.js";
import {
  createProject,
  ensureProjectStorage,
  fileTree,
  listProjects,
  projectPaths,
  readJson,
  readMeta,
  readTerminal,
  updateMeta,
  writeJson,
  type StoredApproval,
} from "./projects.js";
import { readScene as readSceneFile, updateScene } from "./scene.js";
import { readCapabilities } from "./capabilities.js";
import { workspaceAuth, validOrigin } from "./auth.js";
import { Workflow } from "./workflow.js";
import { grantMcpApproval, rejectMcpApproval } from "./mcp-approval.js";

const MAX_BODY = 1_000_000;
const MESSAGE_BODY = 34_000_000;
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ServerConfig {
  port: number;
  host?: string;
  accessToken?: string;
  dataDir: string;
  webDist: string;
  skillsDir: string;
  teamoKey: string;
  teamoBaseUrl: string;
}

interface TurnState {
  assistant: ChatMessage;
  sawApproval: boolean;
  failed: boolean;
}

const running = new Set<string>();

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = repoRoot();
  return {
    port: Number(env.PORT || 8080),
    host: env.HOST || "127.0.0.1",
    accessToken: env.WORKSPACE_ACCESS_TOKEN || "",
    dataDir: resolveEnvPath(env.DATA_DIR, path.join(root, "data")),
    webDist: resolveEnvPath(env.WEB_DIST, path.join(root, "apps", "web", "dist")),
    skillsDir: resolveEnvPath(env.SKILLS_DIR, path.join(root, "skills")),
    teamoKey: env.TEAMO_API_KEY ?? "",
    teamoBaseUrl: env.TEAMO_BASE_URL || "https://api.teamorouter.cn/v1",
  };
}

export function createServer(config: ServerConfig) {
  const agentDir = bindAgentDir(config.dataDir);
  ensureMcpConfig(agentDir);
  if (!["127.0.0.1", "localhost", "::1"].includes(config.host ?? "127.0.0.1") && !config.accessToken) throw new Error("External binding requires WORKSPACE_ACCESS_TOKEN.");
  const auth=workspaceAuth(config.accessToken ?? "");
  const server=createHttpServer((req, res) => {
    res.setHeader("x-content-type-options","nosniff");
    res.setHeader("referrer-policy","same-origin");
    res.setHeader("x-frame-options","DENY");
    void (async()=>{
      const pathname=new URL(req.url || "/", "http://127.0.0.1").pathname;
      if (!config.accessToken && pathname.startsWith("/api/")) {
        let hostname="";try {hostname=new URL(`http://${req.headers.host || "invalid"}`).hostname;} catch {}
        if(!["localhost","127.0.0.1","[::1]"].includes(hostname)) {sendJson(res,403,{error:"Local workspace requires a loopback Host"});return;}
      }
      if (!["GET","HEAD"].includes(req.method ?? "GET") && !validOrigin(req)) {sendJson(res,403,{error:"Request origin is not allowed"});return;}
      if (req.method==="GET" && hostedCallbackPath()===pathname) {
        try {acceptHostedCallback(req.url || "");res.writeHead(200,{"content-type":"text/plain"});res.end("Sign-in received. Return to the workspace.");} catch {sendJson(res,400,{error:"Invalid or expired OAuth callback"});}return;
      }
      if (pathname==="/api/auth/state") {sendJson(res,200,{authenticated:auth.authenticated(req),required:Boolean(config.accessToken)});return;}
      if (pathname==="/api/auth/login" && req.method==="POST") {const body=await readBody(req);sendJson(res,auth.login(req,res,stringField(body,"token")) ? 200 : 401,{authenticated:auth.authenticated(req)});return;}
      if (pathname.startsWith("/api/") && !auth.authenticated(req)) {sendJson(res,401,{error:"Workspace access key is required"});return;}
      await handle(config,req,res);
    })().catch((error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 500, { error: error instanceof Error ? error.message : "server error" });
    });
  });
  let busy=false,closed=false;
  const sync=async()=>{
    if (busy || closed) return; busy=true;
    try {for (const project of await listProjects(config.dataDir)) {if(closed) break;await new Workflow(projectPaths(config.dataDir,project.id).workspace).sync().catch(()=>undefined);}} finally {busy=false;}
  };
  const timer=setInterval(()=>void sync(),15_000);timer.unref();server.once("listening",()=>void sync());server.once("close",()=>{closed=true;clearInterval(timer);});
  return server;
}

export function listen(config: ServerConfig): Promise<ReturnType<typeof createServer>> {
  const server = createServer(config);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host ?? "127.0.0.1", () => resolve(server));
  });
}

async function handle(config: ServerConfig, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = url.pathname;
  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && pathname === "/api/models") {
    sendJson(res, 200, { models: MODELS, defaultModel: DEFAULT_MODEL });
    return;
  }
  if (req.method === "GET" && pathname === "/api/mcp") {
    sendJson(res, 200, { server: mcpStatus(bindAgentDir(config.dataDir)) });
    return;
  }
  if (req.method === "POST" && pathname === "/api/mcp/login") {
    try {
      const signIn = beginMcpSignIn(bindAgentDir(config.dataDir));
      void signIn.finished.then(() => dropAllProjects()).catch(() => undefined);
      const authorizationUrl = await signIn.authorizationUrl;
      sendJson(res, 200, authorizationUrl ? { authorizationUrl } : { status: "signed-in" });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : "MCP sign-in failed" });
    }
    return;
  }
  if (req.method === "POST" && pathname === "/api/mcp/redirect") {
    const body = await readBody(req);
    try {
      submitMcpRedirect(stringField(body, "url"));
      sendJson(res, 202, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Could not use that redirect" });
    }
    return;
  }
  if (req.method === "GET" && pathname === "/api/capabilities") {
    const projectId = url.searchParams.get("projectId") ?? undefined;
    if (projectId && (!PROJECT_ID.test(projectId) || !await readMeta(config.dataDir, projectId))) {
      sendJson(res, 404, { error: "project not found" });
      return;
    }
    sendJson(res, 200, await readCapabilities(config, projectId));
    return;
  }
  if (req.method === "GET" && pathname === "/api/projects") {
    sendJson(res, 200, { projects: await listProjects(config.dataDir) });
    return;
  }
  if (req.method === "POST" && pathname === "/api/projects") {
    const body = await readBody(req);
    const name = stringField(body, "name");
    const project = await createProject(config.dataDir, config.skillsDir, name);
    sendJson(res, 201, { project });
    return;
  }
  const match = /^\/api\/projects\/([^/]+)(.*)$/.exec(pathname);
  if (!match || !match[1] || !PROJECT_ID.test(match[1])) {
    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    await serveStatic(config.webDist, pathname, req, res);
    return;
  }
  const id = match[1];
  const rest = match[2] || "";
  const project = await reconcile(config, id);
  if (!project) {
    sendJson(res, 404, { error: "project not found" });
    return;
  }
  const paths = projectPaths(config.dataDir, id);
  await ensureProjectStorage(config.dataDir,id);
  if (req.method === "GET" && rest === "") {
    const scene = await readSceneFile(paths.sceneFile, id);
    sendJson(res, 200, { project, scene, pendingApproval: await pendingApproval(paths.approvalsFile) });
    return;
  }
  if (req.method === "PATCH" && rest === "") {
    if (running.has(id)) {
      sendJson(res, 409, { error: "project is running" });
      return;
    }
    const body = await readBody(req);
    const model = stringField(body, "model");
    if (!isModelId(model)) {
      sendJson(res, 400, { error: "unknown model" });
      return;
    }
    await dropProject(id);
    sendJson(res, 200, { project: await updateMeta(config.dataDir, id, { model }) });
    return;
  }
  if (req.method === "GET" && rest === "/messages") {
    const stored = await readJson<ChatMessage[]>(paths.messagesFile, []);
    sendJson(res, 200, { messages: applyTurnDurations(stored, await sessionTurnDurations(paths.workspace)) });
    return;
  }
  if (req.method === "GET" && rest === "/scene") {
    sendJson(res, 200, await readSceneFile(paths.sceneFile, id));
    return;
  }
  if (req.method === "PUT" && rest === "/scene") {
    const body = await readBody(req);
    try {
      const scene = await updateScene(paths.sceneFile, id, (current) => applyScenePatch(current, body));
      sendJson(res, 200, scene);
    } catch (error) {
      sendJson(res, error instanceof SceneConflictError ? 409 : 400, { error: error instanceof Error ? error.message : "invalid scene" });
    }
    return;
  }
  if (req.method === "GET" && rest === "/tree") {
    sendJson(res, 200, await fileTree(paths.workspace));
    return;
  }
  if (req.method === "GET" && rest === "/file") {
    await sendFile(paths.workspace, url.searchParams.get("path") || "", res);
    return;
  }
  if (req.method === "GET" && rest === "/terminal") {
    sendJson(res, 200, { lines: await readTerminal(paths.terminalFile) });
    return;
  }
  if (req.method === "GET" && rest === "/tasks") {
    sendJson(res, 200, { tasks: await readJson(paths.tasksFile, []) });
    return;
  }
  if (req.method === "GET" && rest === "/history") {
    sendJson(res, 200, { versions: await readJson(paths.versionsFile, []) });
    return;
  }
  if (req.method === "POST" && rest === "/stop") {
    await abortProject(id);
    const next = await updateMeta(config.dataDir, id, { status: "idle" });
    sendJson(res, 200, { ok: true, project: next });
    return;
  }
  if(req.method === "POST" && rest === "/reject") {
    const body=await readBody(req);
    try {await rejectMcpApproval(paths,stringField(body,"approvalId"));sendJson(res,200,{ok:true});} catch {sendJson(res,409,{error:"approval is no longer pending"});}
    return;
  }
  if (req.method === "POST" && rest === "/approve") {
    if (running.has(id)) {
      sendJson(res, 409, { error: "Wait for the current turn to finish before approving." });
      return;
    }
    const body = await readBody(req);
    const approvalId = stringField(body, "approvalId");
    let approval: StoredApproval;
    try { approval = await grantMcpApproval(paths, approvalId); }
    catch {
      sendJson(res, 409, { error: "approval is no longer pending" });
      return;
    }
    sendJson(res, 200, { ok: true });
    if (approval.tool === "deliver_asset") {
      void new Workflow(paths.workspace).approveExport(String(approval.arguments?.export_id)).catch(()=>undefined);
      return;
    }
    if (!config.teamoKey) return;
    const legacy = !approval.tool.startsWith("mcp__triverse__create_");
    void runTurn(config, id, project.model, `Approved ${approvalId}. Call ${approval.tool} exactly once with these approved arguments: ${JSON.stringify({ ...approval.arguments, ...(legacy ? { confirm: true } : {}) })}. If a prior creation outcome is uncertain, query the original operation before any retry.`, [], null).catch(() => undefined);
    return;
  }
  if (req.method === "POST" && rest === "/messages") {
    if (!config.teamoKey) {
      sendJson(res, 503, { error: "TEAMO_API_KEY is not set" });
      return;
    }
    if (running.has(id)) {
      sendJson(res, 409, { error: "project is running" });
      return;
    }
    let body: unknown;
    try {
      body = await readBody(req, MESSAGE_BODY);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid request" });
      return;
    }
    let images: IncomingImage[];
    try {
      images = readIncomingImages(body);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid image" });
      return;
    }
    const text = stringField(body, "text").trim();
    if (!text && images.length === 0) {
      sendJson(res, 400, { error: "text is required" });
      return;
    }
    const paths = projectPaths(config.dataDir, id);
    let saved;
    try {
      saved = await saveChatImages(paths.workspace, images);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid image" });
      return;
    }
    await runTurn(config, id, project.model, text, saved, res);
    return;
  }
  sendJson(res, 404, { error: "not found" });
}

async function runTurn(config:ServerConfig,id:string,model:ModelId,text:string,images:ChatImage[],res:ServerResponse|null):Promise<void> {
  if(running.has(id)) return;
  running.add(id);
  try {await executeTurn(config,id,model,text,images,res);}
  finally {running.delete(id);}
}

async function executeTurn(
  config: ServerConfig,
  id: string,
  model: ModelId,
  text: string,
  images: ChatImage[],
  res: ServerResponse | null,
): Promise<void> {
  const startedAt = Date.now();
  const paths = projectPaths(config.dataDir, id);
  const messages = await readJson<ChatMessage[]>(paths.messagesFile, []);
  const user: ChatMessage = { id: randomUUID(), role: "user", text, tools: [], createdAt: new Date().toISOString(), ...(images.length ? { images } : {}) };
  messages.push(user);
  await writeJson(paths.messagesFile, messages);
  await updateMeta(config.dataDir, id, { status: "running" });
  const turn: TurnState = {
    assistant: { id: randomUUID(), role: "assistant", text: "", tools: [], createdAt: new Date().toISOString() },
    sawApproval: false,
    failed: false,
  };
  if (res) startSse(res);
  let messageWrites = Promise.resolve();
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let latestSnapshot: ChatMessage[] = messages;
  const persistSnapshot=()=>{
    writeTimer=undefined;
    const snapshot=latestSnapshot;
    messageWrites=messageWrites.then(()=>writeJson(paths.messagesFile,snapshot));
    void messageWrites.catch(()=>undefined);
  };
  const emit = (event: AgentEvent) => {
    applyEvent(turn, event);
    const snapshot = structuredClone(turn.assistant.text || turn.assistant.tools.length > 0 ? [...messages, turn.assistant] : messages);
    latestSnapshot=snapshot;
    if (!writeTimer) writeTimer=setTimeout(persistSnapshot,250);
    if (res && !res.destroyed) writeSse(res, event);
  };
  emit({ type: "message", message: user });
  let status: ProjectStatus = "idle";
  try {
    await promptProject({
      dataDir: config.dataDir,
      skillsDir: config.skillsDir,
      projectId: id,
      model,
      text,
      images,
      emit,
      apiKey: config.teamoKey,
      baseUrl: config.teamoBaseUrl,
    });
    emit({ type: "scene", scene: await readSceneFile(paths.sceneFile, id) });
    status = turn.failed ? "error" : await pendingApproval(paths.approvalsFile) ? "awaiting_approval" : "idle";
  } catch (error) {
    turn.failed = true;
    const message = error instanceof Error ? error.message : "agent failed";
    emit({ type: "error", message });
    status = "error";
  } finally {
    turn.assistant.durationMs = Math.max(0, Date.now() - startedAt);
    if (turn.assistant.text || turn.assistant.tools.length > 0) messages.push(turn.assistant);
    try {
    if(writeTimer) {clearTimeout(writeTimer);writeTimer=undefined;}
    await messageWrites;
    await writeJson(paths.messagesFile, messages);
    await updateMeta(config.dataDir, id, { status });
    if (res && !res.destroyed) {
      writeSse(res, { type: "done", status });
      if (turn.assistant.text || turn.assistant.tools.length > 0) writeSse(res, { type: "message", message: turn.assistant });
      res.end();
    }
    } finally {running.delete(id); if(res && !res.writableEnded) res.end();}
  }
}

function applyEvent(turn: TurnState, event: AgentEvent): void {
  if (event.type === "text") turn.assistant.text += event.delta;
  if (event.type === "tool") upsertTool(turn.assistant.tools, event.tool);
  if (event.type === "approval") turn.sawApproval = true;
  if (event.type === "error") {
    turn.failed = true;
    turn.assistant.text = turn.assistant.text ? `${turn.assistant.text}\n${event.message}` : event.message;
  }
}

function upsertTool(tools: ToolRow[], tool: ToolRow): void {
  const index = tools.findIndex((item) => item.id === tool.id);
  if (index >= 0) tools[index] = tool;
  else tools.push(tool);
}

async function reconcile(config: ServerConfig, id: string) {
  const project = await readMeta(config.dataDir, id);
  if (!project) return null;
  if (project.status === "awaiting_approval" && !running.has(id) && !await pendingApproval(projectPaths(config.dataDir,id).approvalsFile)) return updateMeta(config.dataDir,id,{status:"idle"});
  if (project.status === "running" && !running.has(id) && !hasSession(id)) {
    return updateMeta(config.dataDir, id, { status: "idle" });
  }
  return project;
}

async function pendingApproval(file: string): Promise<ApprovalRequest | null> {
  const items = await readJson<StoredApproval[]>(file, []);
  const pending = [...items].reverse().find((item) => !item.granted && !item.used && (!item.expiresAt || Date.parse(item.expiresAt)>Date.now()));
  if (!pending) return null;
  return { id: pending.id, tool: pending.tool, summary: pending.summary, quote: pending.quote };
}

async function sendFile(workspace: string, relative: string, res: ServerResponse): Promise<void> {
  try {
    const lexical = resolveInside(workspace, relative);
    if (relative === "AGENTS.md" || relative.startsWith(".triverse/") || relative === ".triverse") throw new Error("private workspace metadata");
    const absolute = await realInside(workspace, lexical);
    const resolvedRelative=path.relative(await realInside(workspace,workspace),absolute);
    if (resolvedRelative==="AGENTS.md" || resolvedRelative===".triverse" || resolvedRelative.startsWith(".triverse"+path.sep)) throw new Error("private metadata");
    const bytes = await readFile(absolute);
    res.writeHead(200, {
      "content-type": contentType(absolute),
      "content-length": bytes.length,
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": `${/\.(html?|svg|[cm]?js|zip)$/i.test(absolute) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.basename(absolute)).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    });
    res.end(bytes);
  } catch {
    sendJson(res, 400, { error: "path is not available" });
  }
}

const compress=promisify(gzip);
const staticCache=new Map<string,{mtime:number;size:number;etag:string;bytes:Buffer;compressed?:Buffer}>();
async function staticFile(file:string,req:IncomingMessage,res:ServerResponse):Promise<void> {
  const info=await stat(file);
  let entry=staticCache.get(file);
  if(!entry || entry.mtime!==info.mtimeMs || entry.size!==info.size) {
    const bytes=await readFile(file);
    entry={mtime:info.mtimeMs,size:bytes.length,etag:`"${createHash("sha256").update(bytes).digest("hex")}"`,bytes};
    if(bytes.length>1000 && bytes.length<5_000_000 && /\.(?:js|css|json|svg|html)$/i.test(file)) entry.compressed=await compress(bytes);
    if(staticCache.size>=32) staticCache.delete(staticCache.keys().next().value!);
    if(bytes.length<5_000_000) staticCache.set(file,entry);
  }
  const immutable=/[\/]assets[\/].+-[a-zA-Z0-9_-]+\.(?:js|css)$/.test(file);
  const headers={"content-type":contentType(file),"cache-control":immutable ? "public, max-age=31536000, immutable" : "no-cache",etag:entry.etag,vary:"Accept-Encoding"};
  if(req.headers["if-none-match"]===entry.etag) {res.writeHead(304,headers);res.end();return;}
  const compressed=entry.compressed && /(?:^|,)\s*gzip(?:\s*;\s*q=(?!0(?:\.0*)?(?:,|$))[^,]+)?(?:,|$)/i.test(req.headers["accept-encoding"] ?? "");
  const bytes=compressed ? entry.compressed! : entry.bytes;
  res.writeHead(200,{...headers,"content-length":bytes.length,...(compressed ? {"content-encoding":"gzip"} : {})});res.end(bytes);
}
async function serveStatic(webDist:string,pathname:string,req:IncomingMessage,res:ServerResponse):Promise<void> {
  const relative=pathname==="/" ? "index.html" : pathname.replace(/^\/+/,"");
  try {await staticFile(await realInside(webDist,resolveInside(webDist,relative)),req,res);return;} catch {}
  try {await staticFile(await realInside(webDist,resolveInside(webDist,"index.html")),req,res);} catch {sendJson(res,404,{error:"web bundle is not built"});}
}

function startSse(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
}

function writeSse(res: ServerResponse, event: AgentEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  res.end(data);
}

function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text) as unknown);
      } catch {
        reject(new Error("invalid json"));
      }
    });
  });
}

function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function stringArray(body: unknown, key: string): string[] {
  if (!body || typeof body !== "object") return [];
  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return [];
  return value as string[];
}

function resolveEnvPath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return path.resolve(value);
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  const config = configFromEnv();
  listen(config).then((server) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : config.port;
    console.log(`triverse-pi listening on ${port}`);
  });
}
