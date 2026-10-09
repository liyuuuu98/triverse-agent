import { AssistantRuntimeProvider, MessageNotSentError, SimpleImageAttachmentAdapter, useExternalStoreRuntime } from "@assistant-ui/react";
import { DEFAULT_MODEL, MODELS, type AgentEvent, type ApprovalRequest, type ChatMessage, type ProjectSummary, type SceneState, type ScenePatch, type ToolRow, type TaskRecord, type VersionRecord } from "@triverse/protocol";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { AgentThread, ImageIcon, toThreadMessage } from "./thread";
import { AgentWordmark, Brand, Icon } from "./brand";
import { CapabilitiesPanel } from "./capabilities";
import { ProjectCard } from "./project-card";
import { modelDisplayName } from "./models";
import { SceneInspector } from "./scene-inspector";

const Viewport = lazy(() => import("./viewport").then((module) => ({ default: module.Viewport })));

export function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();
  const [initialImages, setInitialImages] = useState<api.ChatImageUpload[] | undefined>();
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  function openProject(id: string, prompt?: string, images?: api.ChatImageUpload[]) {
    setInitialPrompt(prompt);
    setInitialImages(images?.length ? images : undefined);
    setProjectId(id);
  }
  return <>
    {projectId ? <Workspace key={projectId} projectId={projectId} initialPrompt={initialPrompt} initialImages={initialImages} onBack={() => setProjectId(null)} onCapabilities={() => setCapabilitiesOpen(true)} /> : <ProjectList onOpen={openProject} onCapabilities={() => setCapabilitiesOpen(true)} />}
    {capabilitiesOpen ? <CapabilitiesPanel projectId={projectId ?? undefined} onClose={() => setCapabilitiesOpen(false)} /> : null}
  </>;
}

function ProjectList({ onOpen, onCapabilities }: { onOpen: (id: string, prompt?: string, images?: api.ChatImageUpload[]) => void; onCapabilities: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<DraftImage[]>([]);
  const [dropping, setDropping] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [models, setModels] = useState<{ id: string; label: string }[]>([...MODELS]);
  const draftsRef = useRef<DraftImage[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  draftsRef.current = drafts;

  useEffect(() => {
    void api.listProjects().then(setProjects).catch((reason: unknown) => setError(messageOf(reason))).finally(() => setLoading(false));
    void api.getModels().then((body) => setModels(body.models)).catch(() => undefined);
  }, []);

  useEffect(() => () => {
    for (const image of draftsRef.current) URL.revokeObjectURL(image.url);
  }, []);

  async function addDraftImages(files: File[]) {
    if (creating || files.length === 0) return;
    const room = MAX_DRAFT_IMAGES - draftsRef.current.length;
    if (room <= 0 || files.length > room) setError("Attach at most 4 images");
    const next: DraftImage[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        next.push(await readDraftImage(file));
      } catch (reason) {
        setError(messageOf(reason));
      }
    }
    if (next.length) setDrafts((current) => [...current, ...next].slice(0, MAX_DRAFT_IMAGES));
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const image = current.find((item) => item.id === id);
      if (image) URL.revokeObjectURL(image.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function create() {
    const text = prompt.trim();
    if (creating || (!text && drafts.length === 0)) return;
    setCreating(true);
    setError("");
    try {
      const titleSource = text || drafts[0]?.name.replace(/\.[^.]+$/, "") || "Image";
      const title = titleSource.replace(/\s+/g, " ");
      const project = await api.createProject(title.length > 60 ? `${title.slice(0, 57)}…` : title);
      if (project.model !== model) await api.patchModel(project.id, model);
      onOpen(project.id, text, drafts.map(({ name, mimeType, data }) => ({ name, mimeType, data })));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="home">
      <header className="home-nav">
        <div className="brand-lockup"><Brand /><AgentWordmark /></div>
        <button className="capabilities-trigger" type="button" onClick={onCapabilities}><Icon name="layers" size={16} /> Capabilities</button>
      </header>
      <main className="home-content gallery-home">
      <section className="home-hero gallery-hero surrounding-hero">
      <div className="hero-copy">
        <h1 className="hero-slogan"><span className="slogan-opening">Where ideas take shape.</span><span className="slogan-main">Create with your <strong>3D AI Agent.</strong></span></h1>
        <p className="hero-description">A spark of inspiration. A world in 3D.</p>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <img className="hero-model model-house" src="/brand/model-2.png" alt="" fetchPriority="high" />
        <img className="hero-model model-golem" src="/brand/model-0.png" alt="" />
        <img className="hero-model model-rock" src="/brand/model-4.png" alt="" />
      </div>
        <form className={dropping ? "home-composer is-dropping" : "home-composer"} onSubmit={(event) => { event.preventDefault(); void create(); }} onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }} onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
        }} onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropping(false);
        }} onDrop={(event) => {
          event.preventDefault();
          setDropping(false);
          void addDraftImages(Array.from(event.dataTransfer.files));
        }}>
          <span className="composer-shine" aria-hidden="true"><span className="composer-shine-light" /></span>
          <input ref={fileRef} className="home-file" type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void addDraftImages(files);
          }} />
          {drafts.length ? <div className="home-draft-images">{drafts.map((image) => <div className="image-chip" key={image.id}><img src={image.url} alt="" /><button type="button" className="image-chip-remove" aria-label="Remove image" onClick={() => removeDraft(image.id)}><Icon name="close" size={12} /></button></div>)}</div> : null}
          <textarea aria-label="Describe your idea" placeholder="What would you like to create?" value={prompt} disabled={creating} rows={2} onChange={(event) => setPrompt(event.target.value)} onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (!files.some(isDraftImage)) return;
            event.preventDefault();
            void addDraftImages(files);
          }} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
          <div className="home-composer-toolbar"><div className="home-composer-tools"><button type="button" className="home-attach" aria-label="Add image" title="Add image" disabled={creating} onClick={() => fileRef.current?.click()}><ImageIcon /></button><div className="home-model-picker"><Icon name="spark" size={13} /><span className="model-select-fit"><span aria-hidden="true">{modelDisplayName(models.find((item) => item.id === model) ?? models[0] ?? { id: model, label: model })}</span><select className="model-select" aria-label="Model for new creation" value={model} disabled={creating} onChange={(event) => setModel(event.target.value)}>{models.map((item) => <option key={item.id} value={item.id}>{modelDisplayName(item)}</option>)}</select></span></div></div><button type="submit" aria-label="Send idea" disabled={creating || (!prompt.trim() && drafts.length === 0)}>{creating ? <span className="pulse" /> : <Icon name="arrow" size={18} />}</button></div>
        </form>
      </section>
      <section className="projects-section gallery-section" aria-labelledby="projects-heading">
        <div className="section-heading"><h2 id="projects-heading">Recent creations</h2></div>
        {error ? <p className="banner error gallery-error" role="alert">{error}</p> : null}
        <div className="project-list gallery-list" aria-busy={loading || creating}>
          {projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpen} />)}
          {loading ? <div className="gallery-loading" role="status"><span className="pulse" /> Loading projects…</div> : null}
        </div>
      </section>
      </main>
    </div>
  );
}

function Workspace({ projectId, initialPrompt, initialImages, onBack, onCapabilities }: { projectId: string; initialPrompt?: string; initialImages?: api.ChatImageUpload[]; onBack: () => void; onCapabilities: () => void }) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [scene, setScene] = useState<SceneState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ApprovalRequest | null>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>(MODELS.map((model) => ({ id: model.id, label: model.label })));
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const initialPromptSent = useRef(false);
  const [tasks,setTasks]=useState<TaskRecord[]>([]),[versions,setVersions]=useState<VersionRecord[]>([]);
  const [comparison,setComparison]=useState<VersionRecord | null>(null);

  const refresh = useCallback(async () => {
    const [loaded, nextMessages, nextTasks, nextVersions] = await Promise.all([
      api.getProject(projectId),
      api.getMessages(projectId),
      api.getTasks(projectId),
      api.getHistory(projectId),
    ]);
    setTasks(nextTasks); setVersions(nextVersions);
    setProject(loaded.project);
    setScene(loaded.scene);
    setPending(loaded.pendingApproval);
    setMessages(nextMessages);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(messageOf(reason)));
    void api.getModels().then((body) => setModels(body.models)).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (streaming) return;

    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [project?.status, refresh, streaming]);

  function apply(event: AgentEvent) {
    if (event.type === "status") setProject((current) => (current ? { ...current, status: "running" } : current));
    if (event.type === "text") appendText(event.delta);
    if (event.type === "message") {
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === event.message.id);
        if (index < 0) return [...current, event.message];
        const next = [...current];
        next[index] = event.message;
        return next;
      });
    }
    if (event.type === "tool") upsertTool(event.tool);
    if (event.type === "approval") {
      setPending(event.approval);
      setProject((current) => (current ? { ...current, status: "awaiting_approval" } : current));
    }
    if (event.type === "scene") setScene(event.scene);
    if (event.type === "done") setProject((current) => (current ? { ...current, status: event.status } : current));
    if (event.type === "error") {
      appendText(event.message);
      setProject((current) => (current ? { ...current, status: "error" } : current));
    }
  }

  function appendText(delta: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (!last || last.role !== "assistant") {
        next.push({ id: createId(), role: "assistant", text: delta, tools: [], createdAt: new Date().toISOString() });
        return next;
      }
      next[next.length - 1] = { ...last, text: last.text + delta };
      return next;
    });
  }

  function upsertTool(tool: ToolRow) {
    setMessages((current) => {
      const next = [...current];
      let last = next[next.length - 1];
      if (!last || last.role !== "assistant") {
        last = { id: createId(), role: "assistant", text: "", tools: [tool], createdAt: new Date().toISOString() };
        next.push(last);
        return next;
      }
      const tools = [...last.tools];
      const index = tools.findIndex((item) => item.id === tool.id);
      if (index >= 0) tools[index] = tool;
      else tools.push(tool);
      next[next.length - 1] = { ...last, tools };
      return next;
    });
  }

  async function selectObject(id: string) {
    if (!scene) return;
    const next = await api.putScene(projectId, { expectedVersion: scene.version, selectedIds: [id], activeAssetId: id, camera: { ...scene.camera, target: id } });
    setScene(next);
  }

  async function patchScene(patch: ScenePatch) {
    if (!scene) return;
    try { setScene(await api.putScene(projectId, { ...patch, expectedVersion: scene.version })); }
    catch (reason) { await refresh(); throw reason; }
  }

  const live = streaming || project?.status === "running";
  async function sendMessage(text: string, images: api.ChatImageUpload[] = []) {
    if (!text.trim() && images.length === 0) return false;
    setStreaming(true);
    setError("");
    let started = false;
    try {
      await api.streamMessage(projectId, text, (event) => {
        started = true;
        apply(event);
      }, images);
      await refresh();
      return true;
    } catch (reason) {
      setError(messageOf(reason));
      return started;
    } finally {
      setStreaming(false);
    }
  }

  useEffect(() => {
    if (!project || initialPromptSent.current) return;
    if (!initialPrompt && !initialImages?.length) return;
    initialPromptSent.current = true;
    void sendMessage(initialPrompt ?? "", initialImages ?? []);
  }, [project, initialPrompt, initialImages]);

  const threadMessages = useMemo(
    () => messages.map((item, index) => toThreadMessage(item, live && index === messages.length - 1 && item.role === "assistant", projectId)),
    [live, messages, projectId],
  );
  const attachments = useMemo(() => new ChatImageAdapter(), []);

  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    isRunning: live,
    convertMessage: (message) => message,
    onCancel: async () => {
      await api.stopProject(projectId);
      await refresh();
    },
    adapters: { attachments },
    onNew: async (message) => {
      const text = api.messageText(message.content).trim();
      const attached = message.attachments ?? [];
      const images = uploadsFrom(attached);
      const imageCount = attached.filter((attachment) => attachment.type === "image").length;
      if (imageCount > 4) {
        setError("Attach at most 4 images");
        throw new MessageNotSentError("Attach at most 4 images");
      }
      if (imageCount > 0 && images.length !== imageCount) {
        setError("Could not read that image");
        throw new MessageNotSentError("Could not read that image");
      }
      const started = await sendMessage(text, images);
      if (!started) throw new MessageNotSentError();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="workspace">
        <header className="topbar">
          <button className="brand-lockup brand-home" type="button" onClick={onBack} aria-label="Back to home" title="Back to home"><Brand compact /><AgentWordmark /></button>
          <span className="topbar-divider" />
          <span className="project-name" title={project?.name}><Icon name="cube" size={15} /><span>{project?.name ?? "Untitled creation"}</span></span>
          <span className="spacer" />
          <button className="capabilities-trigger" type="button" onClick={onCapabilities}><Icon name="layers" size={15} /><span>Capabilities</span></button>
        </header>
        <div className="stage">
          <section className="thread-pane" aria-label="Conversation">
            <div className="pane-heading"><span><Icon name="spark" size={16} /> Conversation</span>{project && project.status !== "idle" ? <span className={`status status-${project.status}`} role="status">{statusLabel(project.status)}</span> : null}</div>
            <AgentThread
              pending={pending}
              error={error}
              modelControl={<ConversationModel models={models} value={project?.model ?? models[0]?.id ?? ""} disabled={!project || live || project.status === "awaiting_approval"} onChange={(modelId) => {
                void api.patchModel(projectId, modelId).then(setProject).catch((reason: unknown) => setError(messageOf(reason)));
              }} />}
              onReject={(approvalId)=>{void api.rejectApproval(projectId,approvalId).then(()=>refresh()).catch((reason)=>setError(messageOf(reason)));}}
              onApprove={(approvalId) => {
                void api.approve(projectId, approvalId).then(() => refresh()).catch((reason: unknown) => setError(messageOf(reason)));
              }}
            />
          </section>
          <section className="inspector">
            {scene ? (
              <Suspense fallback={<div className="viewport"><div className="empty" role="status"><span className="pulse" /><p>Preparing your canvas…</p></div></div>}>
                <div className="scene-workspace"><Viewport projectId={projectId} scene={scene} onSelect={(id) => void selectObject(id).catch((reason: unknown) => { setError(messageOf(reason)); void refresh(); })} onCamera={(preset) => void patchScene({ camera: { ...scene.camera, preset } }).catch((reason) => setError(messageOf(reason)))} /><SceneInspector scene={scene} onPatch={patchScene} onSelect={(id) => void selectObject(id).catch((reason) => setError(messageOf(reason)))} /></div>
              </Suspense>
            ) : (
              <div className="viewport" />
            )}
            <div className="delivery-panel" aria-label="Tasks and deliveries">
              {tasks.map(task=><div key={task.operationId ?? task.id}><strong>{task.flow}</strong> · {task.status}{task.billing ? ` · ${task.billing.status} (${task.billing.credits_amount ?? "pending"} credits)` : ""}{task.assetPath ? <> · <a href={api.fileUrl(projectId,task.assetPath)} download>Download GLB</a></> : null}{task.error ? <p role="alert">{task.error}</p> : null}</div>)}
              {versions.length ? <details><summary>Asset history ({versions.length})</summary>{versions.map(version=><div key={version.id}>{version.note} · <a href={api.fileUrl(projectId,version.path)} download>Download</a> <button type="button" onClick={()=>setComparison(version)}>Compare</button></div>)}</details> : null}
            </div>
          </section>
        </div>
        {comparison && scene ? <div className="comparison-modal" role="dialog" aria-modal="true" aria-label="Asset comparison"><button type="button" onClick={()=>setComparison(null)}>Close comparison</button><div className="comparison-views"><div><h3>Current scene</h3><Suspense fallback={<p>Loading…</p>}><Viewport projectId={projectId} scene={scene} onSelect={()=>{}} onCamera={()=>{}} /></Suspense></div><div><h3>{comparison.note}</h3><Suspense fallback={<p>Loading…</p>}><Viewport projectId={projectId} scene={{...scene,objects:[{id:comparison.id,name:comparison.note,kind:"prop",assetPath:comparison.path,visible:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}],selectedIds:[],highlightedIds:[],visibility:{},camera:{preset:"default"},activeAssetId:comparison.id}} onSelect={()=>{}} onCamera={()=>{}} /></Suspense></div></div></div> : null}
      </div>
    </AssistantRuntimeProvider>
  );
}

function statusLabel(status: ProjectSummary["status"] | undefined): string {
  if (status === "running") return "Running";
  if (status === "error") return "Error";
  if (status === "awaiting_approval") return "Needs confirmation";
  return "Idle";
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : "request failed";
}

function createId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
const MAX_DRAFT_IMAGES = 4;
const MAX_DRAFT_BYTES = 6_000_000;

interface DraftImage extends api.ChatImageUpload {
  id: string;
  url: string;
}

function isDraftImage(file: File): boolean {
  return /^(image\/png|image\/jpeg|image\/jpg|image\/webp|image\/gif)$/i.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

function readDraftImage(file: File): Promise<DraftImage> {
  return new Promise((resolve, reject) => {
    if (!isDraftImage(file)) {
      reject(new Error("Use a PNG, JPEG, WebP, or GIF"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      try {
        const result = typeof reader.result === "string" ? reader.result : "";
        const matched = /^data:([^;,]+);base64,([\s\S]+)$/.exec(result);
        if (!matched?.[1] || !matched[2]) {
          reject(new Error("Could not read that image"));
          return;
        }
        const bytes = Math.floor((matched[2].length * 3) / 4);
        if (bytes > MAX_DRAFT_BYTES) {
          reject(new Error("That image is too large"));
          return;
        }
        const mimeType = matched[1].toLowerCase() === "image/jpg" ? "image/jpeg" : matched[1].toLowerCase();
        resolve({ id: createId(), name: file.name || "image", mimeType, data: matched[2], url: URL.createObjectURL(file) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not read that image"));
      }
    };
    reader.readAsDataURL(file);
  });
}

function ConversationModel({ models, value, disabled, onChange }: { models: { id: string; label: string }[]; value: string; disabled: boolean; onChange: (modelId: string) => void }) {
  const current = models.find((model) => model.id === value) ?? models[0];
  const label = current ? modelDisplayName(current) : "";
  return (
    <div className="conversation-model">
      <Icon name="spark" size={13} />
      <span className="model-select-fit">
        <span aria-hidden="true">{label}</span>
        <select className="model-select" aria-label="Conversation model" title="Conversation model" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {models.map((model) => <option key={model.id} value={model.id}>{modelDisplayName(model)}</option>)}
        </select>
      </span>
    </div>
  );
}

class ChatImageAdapter extends SimpleImageAttachmentAdapter {
  accept = "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
}

function uploadsFrom(attachments: readonly { type: string; name: string; content?: readonly { readonly type: string; readonly image?: string }[] }[] | undefined): api.ChatImageUpload[] {
  const images: api.ChatImageUpload[] = [];
  for (const attachment of attachments ?? []) {
    if (attachment.type !== "image") continue;
    const part = attachment.content?.find((item) => item.type === "image" && typeof item.image === "string");
    const matched = typeof part?.image === "string" ? /^data:([^;,]+);base64,([\s\S]+)$/.exec(part.image) : null;
    if (!matched?.[1] || !matched[2]) continue;
    const mimeType = matched[1].toLowerCase() === "image/jpg" ? "image/jpeg" : matched[1].toLowerCase();
    images.push({ name: attachment.name || "image", mimeType, data: matched[2] });
  }
  return images;
}
