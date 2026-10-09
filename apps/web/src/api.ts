import type {
  AgentEvent,
  Capabilities,
  ApprovalRequest,
  ChatMessage,
  FileNode,
  ProjectSummary,
  SceneState,
  ScenePatch,
  TaskRecord,
  VersionRecord,
} from "@triverse/protocol";

export async function getCapabilities(projectId?: string): Promise<Capabilities> {
  return request(`/api/capabilities${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`);
}

export async function getMcp(): Promise<{ server: { name: string; url: string; status: "signed-in" | "signed-out" | "signing-in"; authorizationUrl?: string; error?: string } }> {
  return request("/api/mcp");
}

export async function startMcpLogin(): Promise<{ authorizationUrl?: string; status?: string }> {
  return request("/api/mcp/login", { method: "POST", body: "{}" });
}

export async function submitMcpRedirect(url: string): Promise<void> {
  await request("/api/mcp/redirect", { method: "POST", body: JSON.stringify({ url }) });
}

export async function getModels(): Promise<{ models: { id: string; label: string }[]; defaultModel: string }> {
  return request("/api/models");
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const body = await request<{ projects: ProjectSummary[] }>("/api/projects");
  return body.projects;
}

export async function createProject(name: string): Promise<ProjectSummary> {
  const body = await request<{ project: ProjectSummary }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return body.project;
}

export async function getProject(id: string): Promise<{ project: ProjectSummary; scene: SceneState; pendingApproval: ApprovalRequest | null }> {
  return request(`/api/projects/${id}`);
}

export async function patchModel(id: string, model: string): Promise<ProjectSummary> {
  const body = await request<{ project: ProjectSummary }>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ model }),
  });
  return body.project;
}

export async function getMessages(id: string): Promise<ChatMessage[]> {
  const body = await request<{ messages: ChatMessage[] }>(`/api/projects/${id}/messages`);
  return body.messages;
}

export async function putScene(id: string, body: ScenePatch): Promise<SceneState> {
  return request(`/api/projects/${id}/scene`, { method: "PUT", body: JSON.stringify(body) });
}

export async function getTree(id: string): Promise<FileNode> {
  return request(`/api/projects/${id}/tree`);
}

export function fileUrl(id: string, filePath: string, version?: number): string {
  const versionQuery = version === undefined ? "" : `&v=${version}`;
  return `/api/projects/${id}/file?path=${encodeURIComponent(filePath)}${versionQuery}`;
}

export async function getTerminal(id: string): Promise<string[]> {
  const body = await request<{ lines: string[] }>(`/api/projects/${id}/terminal`);
  return body.lines;
}

export async function getTasks(id: string): Promise<TaskRecord[]> {
  const body = await request<{ tasks: TaskRecord[] }>(`/api/projects/${id}/tasks`);
  return body.tasks;
}

export async function getHistory(id: string): Promise<VersionRecord[]> {
  const body = await request<{ versions: VersionRecord[] }>(`/api/projects/${id}/history`);
  return body.versions;
}

export async function stopProject(id: string): Promise<void> {
  await request(`/api/projects/${id}/stop`, { method: "POST", body: "{}" });
}

export async function approve(id: string, approvalId: string): Promise<void> {
  await request(`/api/projects/${id}/approve`, { method: "POST", body: JSON.stringify({ approvalId }) });
}

export async function rejectApproval(id:string,approvalId:string):Promise<void> {
  await request(`/api/projects/${id}/reject`,{method:"POST",body:JSON.stringify({approvalId})});
}

export interface ChatImageUpload {
  name: string;
  mimeType: string;
  data: string;
}

export async function streamMessage(id: string, text: string, onEvent: (event: AgentEvent) => void, images: ChatImageUpload[] = []): Promise<void> {
  const response = await fetch(`/api/projects/${id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, images }),
  });
  if (!response.ok || !response.body) {
    throw new Error(await errorMessage(response));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const records = buffer.split("\n\n");
    buffer = records.pop() ?? "";
    for (const record of records) parseRecord(record, onEvent);
  }
  if (buffer.trim()) parseRecord(buffer, onEvent);
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || !("text" in part)) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    return response.statusText;
  }
  return response.statusText;
}

function parseRecord(record: string, onEvent: (event: AgentEvent) => void): void {
  const dataLine = record
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  if (!dataLine) return;
  onEvent(JSON.parse(dataLine.slice(5).trim()) as AgentEvent);
}
