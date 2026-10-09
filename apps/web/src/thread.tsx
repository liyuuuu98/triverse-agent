import { useComposerAddAttachment } from "@assistant-ui/core/react";
import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useMessageTiming,
  type TextMessagePartComponent,
  type ThreadMessageLike,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import type { ApprovalRequest, ChatMessage } from "@triverse/protocol";
import { useEffect, useState, type DragEvent, type FC, type ReactNode } from "react";
import { fileUrl } from "./api";
import { Markdown } from "./markdown";

export function toThreadMessage(message: ChatMessage, live: boolean, projectId: string): ThreadMessageLike {
  if (message.role === "user") {
    const content: Array<Exclude<ThreadMessageLike["content"], string>[number]> = (message.images ?? []).map((image) => ({
      type: "image" as const,
      image: fileUrl(projectId, image.path),
      filename: image.name,
    }));
    if (message.text || content.length === 0) content.push({ type: "text", text: message.text });
    return {
      id: message.id,
      role: "user",
      content,
      createdAt: new Date(message.createdAt),
    };
  }
  const content: Array<Exclude<ThreadMessageLike["content"], string>[number]> = message.tools.map((tool) => {
    const imageUrl = generatedImageUrl(projectId, tool.imagePath);
    const downloadUrl = tool.filePath && /^exports\/[a-zA-Z0-9_-]+\.zip$/.test(tool.filePath) ? fileUrl(projectId,tool.filePath) : undefined;
    return {
      type: "tool-call" as const,
      toolCallId: tool.id,
      toolName: tool.name,
      argsText: tool.summary,
      args: { summary: tool.summary, state: tool.state, ...(imageUrl ? { imageUrl } : {}), ...(downloadUrl ? { downloadUrl } : {}) },
      ...(tool.state === "running" ? {} : { result: tool.summary, isError: tool.state === "error" }),
    };
  });
  if (message.text || content.length === 0) content.push({ type: "text", text: message.text });
  return {
    id: message.id,
    role: "assistant",
    content,
    createdAt: new Date(message.createdAt),
    status: live ? { type: "running" } : { type: "complete", reason: "stop" },
    ...(typeof message.durationMs === "number"
      ? { metadata: { timing: { streamStartTime: Date.parse(message.createdAt), totalStreamTime: message.durationMs, totalChunks: 0, toolCallCount: message.tools.length } } }
      : {}),
  };
}

export function AgentThread({
  pending,
  error,
  onApprove,
  onReject,
  modelControl,
}: {
  pending: ApprovalRequest | null;
  error: string;
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  modelControl: ReactNode;
}) {
  const isEmpty = useAuiState((state) => state.thread.messages.length === 0);
  return (
    <ThreadPrimitive.Root className="aui-thread">
      <ThreadPrimitive.Viewport className="aui-viewport">
        <div className={isEmpty ? "aui-column is-empty" : "aui-column"}>
          <AuiIf condition={(state) => state.thread.messages.length === 0}>
            <div className="welcome">
              <h2>What will you create?</h2>
            </div>
          </AuiIf>
          <div className="aui-messages">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>
          <ThreadPrimitive.ViewportFooter className={isEmpty ? "aui-footer" : "aui-footer is-docked"}>
            <ThreadPrimitive.ScrollToBottom className="jump" aria-label="Scroll to bottom">
              <ArrowDownIcon />
            </ThreadPrimitive.ScrollToBottom>
            {error ? <p className="banner error">{error}</p> : null}
            {pending ? (
              <div className="approval">
                <p>{pending.summary}</p>
                <details open><summary>Review exact request and pricing</summary><pre className="approval-details">{JSON.stringify(pending.quote,null,2)}</pre></details>
                <button type="button" className="confirm" onClick={() => onApprove(pending.id)}>
                  Confirm
                </button>
                <button type="button" onClick={()=>onReject(pending.id)}>Decline</button>
              </div>
            ) : null}
            <Composer modelControl={modelControl} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function ThreadMessage() {
  const role = useAuiState((state) => state.message.role);
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
}

const UserText: TextMessagePartComponent = ({ text }) => <span className="user-text">{text}</span>;

function UserMessage() {
  const content = useAuiState((state) => state.message.content);
  const images = content.filter((part) => part.type === "image");
  const hasText = content.some((part) => part.type === "text" && part.text.trim().length > 0);
  return (
    <MessagePrimitive.Root className="user-message" data-role="user">
      <div className="user-stack">
        {images.length ? (
          <div className="user-image-cards">
            {images.map((part) => (
              <div className="user-image-card" key={part.image}>
                <img src={part.image} alt={part.filename || "Attached image"} />
              </div>
            ))}
          </div>
        ) : null}
        {hasText ? (
          <div className="user-bubble-wrap">
            <div className="user-bubble">
              <MessagePrimitive.Parts components={{ Text: UserText, Image: () => null }} />
            </div>
            <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="user-actions">
              <CopyButton />
            </ActionBarPrimitive.Root>
          </div>
        ) : null}
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const running = useAuiState((state) => state.message.status?.type === "running");
  const hasText = useAuiState((state) => state.message.content.some((part) => part.type === "text" && part.text.trim().length > 0));
  return (
    <MessagePrimitive.Root className={running ? "assistant-message is-streaming" : "assistant-message"} data-role="assistant">
      <div className="assistant-body">
        <MessagePrimitive.Parts
          components={{
            Text: AssistantText,
            tools: { Fallback: ToolRow },
          }}
        />
        {running && !hasText ? (
          <span className="thinking" role="status" aria-label="Assistant is working"><i /><i /><i /></span>
        ) : null}
      </div>
      <div className="assistant-footer">
        <TurnTime />
        <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="assistant-actions">
          <CopyButton />
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

const AssistantText: TextMessagePartComponent = ({ text }) => (text ? <Markdown text={text} /> : null);

function TurnTime() {
  const running = useAuiState((state) => state.message.status?.type === "running");
  const createdAt = useAuiState((state) => state.message.createdAt);
  const timing = useMessageTiming();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  const elapsed = running ? Math.max(0, now - createdAt.getTime()) : timing?.totalStreamTime;
  if (elapsed == null) return null;
  const label = formatDuration(elapsed);
  return <span className="turn-time" title={`This reply took ${label}`}>{label}</span>;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${seconds}s`;
}

const ToolRow: ToolCallMessagePartComponent = ({ toolName, args, argsText, isError }) => {
  const state = toolState(args, isError);
  const summary = typeof argsText === "string" && argsText ? argsText : summaryOf(args);
  const body = formatSummary(summary);
  const caption = state === "running" && body === summary ? oneLine(summary) : "";
  const imageUrl = safeGeneratedUrl(isRecord(args) ? args.imageUrl : undefined);
  const downloadUrl = safePackUrl(isRecord(args) ? args.downloadUrl : undefined);
  const details = (
    <details className={`tool tool-${state}`}>
      <summary>
        <span className="tool-line">
          <ToolMark state={state} />
          <strong>{toolLabel(toolName)}</strong>
          {caption ? <span className="tool-caption">{caption}</span> : null}
        </span>
      </summary>
      {body ? <pre className="tool-summary">{body}</pre> : null}
      {downloadUrl ? <a href={downloadUrl} download>Download asset pack</a> : null}
    </details>
  );
  if (!imageUrl) return details;
  return (
    <div className="generated-image">
      <div className="user-image-card">
        <img src={imageUrl} alt="Generated image" />
      </div>
      {details}
    </div>
  );
};

function safePackUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/api/projects/")) return "";
  try { return /^exports\/[a-zA-Z0-9_-]+\.zip$/.test(new URL(value,"http://local").searchParams.get("path") ?? "") ? value : ""; }
  catch { return ""; }
}

function generatedImageUrl(projectId: string, imagePath: string | undefined): string | undefined {
  if (!imagePath || !GENERATED_IMAGE.test(imagePath)) return undefined;
  return fileUrl(projectId, imagePath);
}

function safeGeneratedUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/api/projects/")) return "";
  try {
    const filePath = new URL(value, "http://local").searchParams.get("path") ?? "";
    return GENERATED_IMAGE.test(filePath) ? value : "";
  } catch {
    return "";
  }
}

const GENERATED_IMAGE = /^images\/[0-9a-f-]+\.(png|jpg|webp)$/;

function toolLabel(name: string): string {
  const bare = name.replace(/^mcp__triverse__/, "");
  if (bare === "bash") return "Shell";
  if (bare === "read") return "Read file";
  if (bare === "generate_image") return "Image";
  return bare;
}

function oneLine(text: string): string {
  const line = text.split("\n").find((item) => item.trim())?.trim() ?? "";
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

function formatSummary(summary: string): string {
  const line = summary.trim();
  if ((!line.startsWith("{") && !line.startsWith("[")) || line.includes("\n")) return summary;
  try {
    return JSON.stringify(JSON.parse(line), null, 2);
  } catch {
    return line.replaceAll(", ", ",\n");
  }
}

function Composer({ modelControl }: { modelControl: ReactNode }) {
  const { addAttachment, disabled } = useComposerAddAttachment();
  const [dropping, setDropping] = useState(false);
  const addImages = (files: File[]) => {
    if (disabled) return;
    for (const file of files) {
      if (!isChatImage(file)) continue;
      void addAttachment(file).catch(() => undefined);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropping(false);
    addImages(Array.from(event.dataTransfer.files));
  };
  return (
    <ComposerPrimitive.Root className="composer">
      <div
        className={dropping ? "composer-shell is-dropping" : "composer-shell"}
        onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDropping(false);
        }}
        onDrop={onDrop}
      >
        <ComposerPrimitive.Attachments>
          {() => <ComposerImage />}
        </ComposerPrimitive.Attachments>
        <ComposerPrimitive.Input placeholder="Send a message…" className="composer-input" rows={1} autoFocus aria-label="Message input" />
        <div className="composer-actions">
          <div className="composer-tools">
            <AuiIf condition={(state) => !state.composer.canCancel}>
              <ComposerPrimitive.AddAttachment className="attach" aria-label="Add image" multiple>
                <ImageIcon />
              </ComposerPrimitive.AddAttachment>
            </AuiIf>
            {modelControl}
          </div>
          <AuiIf condition={(state) => !state.composer.canCancel}>
            <ComposerPrimitive.Send className="send" aria-label="Send message">
              <ArrowUpIcon />
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.composer.canCancel}>
            <ComposerPrimitive.Cancel className="send cancel" aria-label="Stop generating">
              <StopIcon />
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
      <span className="composer-hint">Enter to send · paste or drop an image</span>
    </ComposerPrimitive.Root>
  );
}

function ComposerImage() {
  const file = useAuiState((state) => state.attachment.file);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <AttachmentPrimitive.Root className="image-chip">
      {url ? <img src={url} alt="" /> : null}
      <AttachmentPrimitive.Remove className="image-chip-remove" aria-label="Remove image">
        <CloseIcon />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function CopyButton() {
  return (
    <ActionBarPrimitive.Copy className="icon-button" aria-label="Copy">
      <AuiIf condition={(state) => state.message.isCopied}>
        <span className="icon-swap"><CheckIcon /></span>
      </AuiIf>
      <AuiIf condition={(state) => !state.message.isCopied}>
        <span className="icon-swap"><CopyIcon /></span>
      </AuiIf>
    </ActionBarPrimitive.Copy>
  );
}

function toolState(args: unknown, isError: boolean | undefined): string {
  if (isRecord(args) && typeof args.state === "string") return args.state;
  if (isError) return "error";
  return "running";
}

function summaryOf(args: unknown): string {
  if (isRecord(args) && typeof args.summary === "string") return args.summary;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const CHAT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

function isChatImage(file: File): boolean {
  return CHAT_IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

export const ImageIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="16" height="16">
    <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
    <path d="m7 16 3.2-3.2a1 1 0 0 1 1.4 0L17 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="12" height="12">
    <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ArrowUpIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="16" height="16">
    <path d="M12 5v14M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowDownIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="16" height="16">
    <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StopIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="12" height="12">
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
  </svg>
);

const CopyIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="15" height="15">
    <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const CheckIcon: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden width="15" height="15">
    <path d="m5 12 5 5L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function ToolMark({ state }: { state: string }) {
  if (state === "done") return <span className="tool-mark">✓</span>;
  if (state === "error") return <span className="tool-mark">!</span>;
  if (state === "needs_confirmation") return <span className="tool-mark">?</span>;
  return <span className="tool-mark pulse" />;
}
