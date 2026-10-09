import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { McpClient, StreamableHttpTransport, type Tool } from "@earendil-works/pi-mcp";
import { adaptOAuthProvider, authorizeMcp, McpOAuthProvider, OAuthCallbackServer, type McpOAuthState, type McpOAuthStateStore } from "@earendil-works/pi-mcp/oauth";

export const TRIVERSE_MCP_NAME = "triverse";
export const TRIVERSE_MCP_URL = process.env.TRIVERSE_MCP_URL || "https://dev-mcp.triverse.ai/mcp";
const CALLBACK_ID = createHash("sha256").update(TRIVERSE_MCP_URL).digest().subarray(0, 9).toString("base64url");
const CALLBACK_PATH = `/callback/${CALLBACK_ID}`;
const SCOPES = "tasks:read assets:read assets:export inputs:write generations:create";
const RESOURCE_METADATA = process.env.TRIVERSE_RESOURCE_METADATA_URL || new URL("/.well-known/oauth-protected-resource/mcp", TRIVERSE_MCP_URL).href;
const AUTH_METADATA = process.env.TRIVERSE_AUTH_METADATA_URL || "https://dev-api.triverse.ai/.well-known/oauth-authorization-server";
const CLIENT_ID = process.env.TRIVERSE_OAUTH_CLIENT_ID || "codex-dev-mcp";

export function agentDirFor(dataDir: string): string {
  return path.join(dataDir, ".pi");
}

export function bindAgentDir(dataDir: string): string {
  const dir = agentDirFor(dataDir);
  process.env.PI_CODING_AGENT_DIR = dir;
  return dir;
}

export function callbackPort(): number {
  const port = Number(process.env.MCP_CALLBACK_PORT || 8791);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MCP_CALLBACK_PORT is not a port");
  return port;
}

function callbackHost(): string {
  return process.env.MCP_CALLBACK_HOST || "127.0.0.1";
}

function redirectUrl(): string {
  const configured=process.env.MCP_CALLBACK_URL;
  if (configured) {const url=new URL(configured);if(url.protocol!=="https:" || url.search || url.hash || url.username || url.password) throw new Error("MCP_CALLBACK_URL must be a registered HTTPS callback without query parameters.");return url.href;}
  return `http://127.0.0.1:${callbackPort()}${CALLBACK_PATH}`;
}

function storeKey(): string {
  return `mcp__triverse|${TRIVERSE_MCP_URL}`;
}

function authFile(agentDir: string): string {
  return path.join(agentDir, "mcp-auth.json");
}

function readStates(agentDir: string): Record<string, McpOAuthState> {
  try {
    const parsed = JSON.parse(readFileSync(authFile(agentDir), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, McpOAuthState>;
  } catch {
    return {};
  }
}

function writeStates(agentDir: string, states: Record<string, McpOAuthState>): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const temp=authFile(agentDir)+".tmp";
  writeFileSync(temp, `${JSON.stringify(states, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp,authFile(agentDir));
}

function fileStore(agentDir: string): McpOAuthStateStore {
  const key = storeKey();
  return {
    async load() {
      return readStates(agentDir)[key];
    },
    async save(state) {
      const states = readStates(agentDir);
      states[key] = state;
      writeStates(agentDir, states);
    },
  };
}

export function ensureMcpConfig(agentDir: string): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  const body = {
    autoEnableCodemode: false,
    mcpServers: {
      [TRIVERSE_MCP_NAME]: {
        url: process.env.TRIVERSE_MCP_URL || TRIVERSE_MCP_URL,
        timeout: 300,
        exposure: "direct",
        description: "Triverse tasks, assets, and generation.",
        oauth: {
          clientId: CLIENT_ID,
          callbackUrl: redirectUrl(),
          callbackPort: callbackPort(),
          scope: SCOPES,
          authServerMetadataUrl: AUTH_METADATA,
        },
      },
    },
  };
  writeFileSync(path.join(agentDir, "mcp.json"), `${JSON.stringify(body, null, 2)}\n`);
}

export interface McpServerStatus {
  name: string;
  url: string;
  status: "signed-in" | "signed-out" | "signing-in";
  authorizationUrl?: string;
  error?: string;
}

export function mcpStatus(agentDir: string): McpServerStatus {
  const state = readStates(agentDir)[storeKey()];
  const signedIn = Boolean(state?.tokens?.access_token || state?.tokens?.refresh_token);
  if (active && !signedIn) {
    return { name: TRIVERSE_MCP_NAME, url: TRIVERSE_MCP_URL, status: "signing-in", authorizationUrl: active.authorizationUrl, error: lastError || undefined };
  }
  return { name: TRIVERSE_MCP_NAME, url: TRIVERSE_MCP_URL, status: signedIn ? "signed-in" : "signed-out", error: signedIn ? undefined : lastError || undefined };
}

export interface McpCatalog { tools: Tool[]; connected: boolean; error?: string }
const catalogs = new Map<string, { expires: number; result: Promise<McpCatalog> }>();

export async function discoverMcpTools(agentDir: string): Promise<McpCatalog> {
  if (mcpStatus(agentDir).status !== "signed-in") return { tools: [], connected: false };
  const cached = catalogs.get(agentDir);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = readMcpTools(agentDir);
  catalogs.set(agentDir, { expires: Date.now() + 30_000, result });
  return result;
}

async function readMcpTools(agentDir: string): Promise<McpCatalog> {
  const provider = new McpOAuthProvider({
    serverUrl: TRIVERSE_MCP_URL,
    redirectUrl: redirectUrl(),
    clientMetadata: { client_name: "Triverse Agent", token_endpoint_auth_method: "none" },
    clientId: CLIENT_ID,
    store: fileStore(agentDir),
    onRedirect: () => { throw new Error("Sign in to Triverse again through Capabilities → MCP."); },
  });
  const client = new McpClient({ name: "triverse-capabilities", version: "0.1.0", requestTimeoutMs: 15_000 });
  try {
    await client.connect(new StreamableHttpTransport({
      url: TRIVERSE_MCP_URL,
      openGetStream: false,
      authProvider: adaptOAuthProvider(provider),
      fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }),
    }));
    return { tools: await client.listTools({ timeoutMs: 15_000 }), connected: true };
  } catch {
    return { tools: [], connected: false, error: "Could not connect to Triverse MCP. Check connectivity or sign in again." };
  } finally { await client.close().catch(() => undefined); }
}

interface ActiveSignIn {
  authorizationUrl?: string;
  authorizationUrlPromise: Promise<string | null>;
  accept?: (redirect: string) => void;
  finished: Promise<void>;
}

let active: ActiveSignIn | undefined;
let lastError = "";

export function beginMcpSignIn(agentDir: string): { authorizationUrl: Promise<string | null>; finished: Promise<void> } {
  if (active) return { authorizationUrl: active.authorizationUrlPromise, finished: active.finished };
  ensureMcpConfig(agentDir);
  catalogs.delete(agentDir);
  let resolveUrl: (url: string | null) => void = () => undefined;
  let rejectUrl: (error: unknown) => void = () => undefined;
  const authorizationUrlPromise = new Promise<string | null>((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });
  const current: ActiveSignIn = { authorizationUrlPromise, finished: Promise.resolve() };
  active = current;
  current.finished = runSignIn(agentDir, resolveUrl, rejectUrl);
  const clearActive = () => {
    if (active === current) active = undefined;
  };
  // Handle both outcomes without creating an unhandled rejected promise on timeout.
  void current.finished.then(clearActive, clearActive);
  return { authorizationUrl: authorizationUrlPromise, finished: current.finished };
}

export function submitMcpRedirect(raw: string): void {
  if (!active?.accept) throw new Error("No MCP sign-in is waiting for a redirect");
  active.accept(raw);
}

async function runSignIn(agentDir: string, resolveUrl: (url: string | null) => void, rejectUrl: (error: unknown) => void): Promise<void> {
  const redirect = redirectUrl();
  let callback: OAuthCallbackServer | undefined;
  let settled = false;
  const finishUrl = (url: string | null) => {
    if (settled) return;
    settled = true;
    resolveUrl(url);
  };
  try {
    if (!process.env.MCP_CALLBACK_URL) callback = await OAuthCallbackServer.listen({
      host: callbackHost(),
      redirectHost: "127.0.0.1",
      port: callbackPort(),
      path: CALLBACK_PATH,
      timeoutMs: 5 * 60_000,
    });
    const provider = new McpOAuthProvider({
      serverUrl: TRIVERSE_MCP_URL,
      redirectUrl: redirect,
      clientMetadata: { client_name: "Triverse Agent", token_endpoint_auth_method: "none" },
      clientId: CLIENT_ID,
      store: fileStore(agentDir),
      onRedirect: (url) => {
        if (active) active.authorizationUrl = url.href;
        finishUrl(url.href);
      },
    });
    const flow = {
      serverUrl: TRIVERSE_MCP_URL,
      scope: SCOPES,
      resourceMetadataUrl: new URL(RESOURCE_METADATA),
      authorizationServerMetadataUrl: new URL(AUTH_METADATA),
    };
    if ((await authorizeMcp(provider, { ...flow, signal: AbortSignal.timeout(20_000) })) === "AUTHORIZED") {
      lastError = "";
      finishUrl(null);
      return;
    }
    const state = await provider.state();
    let callbackTimeout: ReturnType<typeof setTimeout>;
    const delivered = await new Promise<{ code: string; iss?: string }>((resolve, reject) => {
      callbackTimeout=setTimeout(()=>reject(new Error("MCP sign-in callback timed out")),5*60_000);
      if (active) {
        active.accept = (raw) => {
          resolve(parseRedirect(raw, state));
        };
      }
      callback?.waitForCallback(state, CALLBACK_PATH).then(resolve, reject);
    }).finally(()=>clearTimeout(callbackTimeout));
    await authorizeMcp(provider, { ...flow, signal: AbortSignal.timeout(20_000), authorizationCode: delivered.code, iss: delivered.iss });
    lastError = "";
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP sign-in failed";
    lastError = message;
    if (!settled) rejectUrl(error);
    throw error;
  } finally {
    await callback?.close().catch(() => undefined);
  }
}

function parseRedirect(raw: string, state: string): { code: string; iss?: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Paste the full redirected address");
  }
  const expected=new URL(redirectUrl());
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) throw new Error("That address is not the MCP callback");
  if (url.searchParams.get("state") !== state) throw new Error("The sign-in state does not match. Start sign-in again.");
  const error = url.searchParams.get("error");
  if (error) throw new Error(url.searchParams.get("error_description") || error);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("The redirected address has no authorization code");
  const iss = url.searchParams.get("iss") ?? undefined;
  return { code, ...(iss ? { iss } : {}) };
}

/** Host-only MCP call. Paid creation stays behind the extension approval gate. */
export async function callMcpTool(agentDir: string, name: string, args: Record<string, unknown>): Promise<any> {
  if (!new Set(["start_image_input","get_image_input","prepare_local_upload","finalize_local_upload","get_operation","get_task","refresh_task","export_model","get_export"]).has(name)) throw new Error("Unsupported host MCP call");
  const provider=new McpOAuthProvider({serverUrl:TRIVERSE_MCP_URL,redirectUrl:redirectUrl(),clientMetadata:{client_name:"Triverse Agent",token_endpoint_auth_method:"none"},clientId:CLIENT_ID,store:fileStore(agentDir),onRedirect:()=>{throw new Error("Sign in through Capabilities → MCP.");}});
  const client=new McpClient({name:"triverse-workflow",version:"0.1.0",requestTimeoutMs:60_000});
  try {
    await client.connect(new StreamableHttpTransport({url:TRIVERSE_MCP_URL,openGetStream:false,authProvider:adaptOAuthProvider(provider)}));
    const result=await client.callTool(name,args,{timeoutMs:60_000});
    let envelope: any=result.structuredContent;
    if (!envelope) for (const part of result.content ?? []) if (part.type === "text") { try {envelope=JSON.parse(part.text);break;} catch {} }
    if (result.isError || !envelope || envelope.error) throw new Error(`MCP ${name} failed; query the persisted intent to recover.`);
    return envelope.data ?? envelope;
  } finally {await client.close().catch(()=>undefined);}
}

export function hostedCallbackPath(): string | undefined {return process.env.MCP_CALLBACK_URL ? new URL(redirectUrl()).pathname : undefined;}
export function acceptHostedCallback(requestUrl: string): void {const configured=process.env.MCP_CALLBACK_URL;if(!configured) throw new Error("Hosted callback is not configured");const incoming=new URL(requestUrl,"https://callback.invalid");const callback=new URL(configured);callback.search=incoming.search;submitMcpRedirect(callback.href);}
