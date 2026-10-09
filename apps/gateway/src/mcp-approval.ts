import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { AgentEvent } from "@triverse/protocol";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import path from "node:path";
import { readJson, writeJson, type ProjectPaths, type StoredApproval } from "./projects.js";
import { validateSchema } from "./schema.js";
import { recordCreation } from "./workflow.js";
import { exclusive } from "./scene.js";

export const APPROVAL_TOOL = "request_creation_approval";
const prefix = "mcp__triverse__";
const paidFlows = new Set(["image_to_model", "text_to_model", "retexture"]);
type ApprovalPaths = Pick<ProjectPaths, "approvalsFile">;
interface QuoteReceipt {
  id: string; tool: string; arguments: Record<string, unknown>; quote: unknown; credits: number;
  createdAt: string; schema: Record<string, any>;
}
function quotesFile(paths: ApprovalPaths): string { return path.join(path.dirname(paths.approvalsFile), "quotes.json"); }
function quoteArguments(input: Record<string, unknown>): Record<string, unknown> {
  const { confirm: _confirm, ...args } = input;
  return args;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function defaults(value: unknown, schema: Record<string, any>, root = schema): any {
  if (schema.$ref) return defaults(value, root.$defs?.[schema.$ref.split("/").pop()] ?? {}, root);
  if (schema.anyOf) {
    const branch = schema.anyOf.find((s: any) => value === null ? s.type === "null" : s.type !== "null");
    return defaults(value, branch ?? {}, root);
  }
  if (value === undefined && "default" in schema) return schema.default;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...value };
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const item = defaults(result[key], child as Record<string, any>, root);
    if (item !== undefined) result[key] = item;
  }
  return result;
}
export async function consumeMcpApproval(paths: ApprovalPaths, tool: string, input: Record<string, unknown>): Promise<boolean> {
  return exclusive(paths.approvalsFile, async () => {
    const approvals = await readJson<StoredApproval[]>(paths.approvalsFile, []);
    const grant = approvals.find((item) => item.tool === tool && item.granted && !item.used && item.arguments && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()) && canonical(item.arguments) === canonical(defaults(quoteArguments(input), item.schema ?? {})));
    if (!grant) return false;
    if (tool.startsWith(`${prefix}create_`)) {
      if (!await recordCreation(paths.approvalsFile, tool, grant.arguments!)) return false;
    }
    grant.used = true;
    await writeJson(paths.approvalsFile, approvals);
    return true;
  });
}
export async function grantMcpApproval(paths: ApprovalPaths, id: string): Promise<StoredApproval> {
  return exclusive(paths.approvalsFile, async () => {
    const approvals = await readJson<StoredApproval[]>(paths.approvalsFile, []);
    const item = approvals.find((approval) => approval.id === id && !approval.used);
    if (!item || item.granted || (item.expiresAt && Date.parse(item.expiresAt) <= Date.now())) throw new Error("approval is no longer pending");
    item.granted = true;
    await writeJson(paths.approvalsFile, approvals);
    return item;
  });
}

export async function rejectMcpApproval(paths:ApprovalPaths,id:string):Promise<void> {
  await exclusive(paths.approvalsFile,async()=>{
    const approvals=await readJson<StoredApproval[]>(paths.approvalsFile,[]),item=approvals.find(item=>item.id===id && !item.used && !item.granted);
    if(!item) throw new Error("approval is no longer pending");
    item.used=true;await writeJson(paths.approvalsFile,approvals);
  });
}

export function createCreationApprovalTool(paths: ApprovalPaths, emit: (event: AgentEvent) => void = () => undefined) {
  return {
    name: APPROVAL_TOOL, label: "Review creation", description: "Present a successful MCP quote and the complete intended create_* arguments for user approval. Include prompt, visibility, operation_id and max_credits. This never creates a paid task.",
    promptSnippet: "Request approval for an exact paid creation", executionMode: "sequential" as const,
    parameters: Type.Object({ quote_id: Type.String(), arguments: Type.Record(Type.String(), Type.Unknown()) }),
    execute: async (_id: string, params: { quote_id: string; arguments: Record<string, unknown> }): Promise<AgentToolResult<{ approval?: StoredApproval }>> => {
      try {
        const receipt = (await readJson<QuoteReceipt[]>(quotesFile(paths), [])).find((item) => item.id === params.quote_id);
        if (!receipt || Date.now() - Date.parse(receipt.createdAt) > 30 * 60_000) throw new Error("Quote is missing or older than 30 minutes. Request a fresh quote.");
        const args = defaults(params.arguments, receipt.schema);
        for (const [key, value] of Object.entries(receipt.arguments)) if (canonical(args[key]) !== canonical(value)) throw new Error(`Create argument ${key} differs from the quote.`);
        if (!Number.isSafeInteger(args.max_credits) || args.max_credits !== receipt.credits) throw new Error("max_credits must equal the quoted credits_cost.");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.operation_id ?? "")) throw new Error("A stable operation_id UUID is required before approval.");
        if (!["public", "private"].includes(args.visibility)) throw new Error("Choose explicit public or private visibility before approval.");
        if (receipt.tool.endsWith("text_to_model") && (typeof args.prompt !== "string" || args.prompt.trim().length < 3)) throw new Error("The complete generation prompt is required before approval.");
        validateSchema(args, receipt.schema);
        const properties = receipt.schema.properties ?? {};
        for (const key of receipt.schema.required ?? []) if (args[key] === undefined) throw new Error(`Missing create argument: ${key}`);
        for (const key of Object.keys(args)) if (!(key in properties)) throw new Error(`Unknown create argument: ${key}`);
        const approval = await exclusive(paths.approvalsFile, async () => {
          const approvals = await readJson<StoredApproval[]>(paths.approvalsFile, []);
          const existing = approvals.find((item) => item.tool === receipt.tool && !item.used && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()) && canonical(item.arguments) === canonical(args));
          if (existing) return existing;
          const item: StoredApproval = { id: randomUUID(), tool: receipt.tool, summary: `${receipt.tool.slice(prefix.length)} · ${receipt.credits} credits · ${args.visibility}`, quote: { pricing: receipt.quote, creation: args }, arguments: args, expiresAt: new Date(Date.parse(receipt.createdAt) + 30 * 60_000).toISOString(), schema: receipt.schema, granted: false, used: false };
          approvals.push(item);
          await writeJson(paths.approvalsFile, approvals);
          return item;
        });
        if (!approval.granted) emit({ type: "approval", approval });
        return { content: [{ type: "text" as const, text: approval.granted ? `Already approved: ${approval.id}. Use the exact approved arguments.` : `Needs confirmation: ${approval.id}. Finish this turn and wait for the user to approve. Then call ${receipt.tool} with exactly these arguments: ${JSON.stringify(args)}` }], details: { approval } };
      } catch (error) { return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : "approval failed" }], details: {}, isError: true }; }
    },
  };
}

export function createMcpApprovalExtension(paths: ProjectPaths, emit: (event: AgentEvent) => void): ExtensionFactory {
  return (pi) => {
    const quotes = new Map<string, "legacy" | "split">();
    pi.on("tool_call", async (event) => {
      if (!event.toolName.startsWith(prefix)) return;
      const input = event.input as Record<string, unknown>;
      const name = event.toolName.slice(prefix.length);
      if (["prepare_local_upload", "finalize_local_upload", "export_model"].includes(name)) return { block: true, reason: "Use upload_reference or deliver_asset. The host protects upload leases and persists export intent before sending.", terminate: false };
      if (name.startsWith("create_") || input.confirm === true) {
        if (name.startsWith("create_") && !paidFlows.has(name.slice("create_".length))) return { block: true, reason: "This creation flow has no supported quote review. Do not spend credits.", terminate: true };
        if (!await consumeMcpApproval(paths, event.toolName, input)) return { block: true, reason: "No matching user-approved creation. Request a quote, then use request_creation_approval with complete create arguments. If a previous creation outcome is uncertain, query its original operation_id instead of retrying.", terminate: true };
        return;
      }
      if (name.startsWith("quote_") && paidFlows.has(name.slice("quote_".length))) { quotes.set(event.toolCallId, "split"); return; }
      const tool = pi.getAllTools().find((item) => item.name === event.toolName);
      const properties = (tool?.parameters as { properties?: Record<string, unknown> } | undefined)?.properties;
      if (properties && "confirm" in properties) { input.confirm = false; quotes.set(event.toolCallId, "legacy"); }
    });
    pi.on("tool_result", async (event) => {
      const kind = quotes.get(event.toolCallId);
      quotes.delete(event.toolCallId);
      if (!kind || event.isError) return;
      let quote: any = event.structuredContent;
      if (!quote) {
        for (const part of event.content) if (part.type === "text") { try { quote = JSON.parse(part.text); break; } catch { /* not structured JSON */ } }
      }
      if (quote?.error || quote?.isError) return;
      const args = quoteArguments(event.input);
      if (kind === "split") {
        const credits = quote?.data?.credits_cost ?? quote?.credits_cost;
        if (!Number.isSafeInteger(credits) || credits < 0) return { content: [...event.content, { type: "text", text: "Quote has no concrete credits_cost. Do not create a task; obtain a usable quote first." }] };
        const tool = event.toolName.replace(`${prefix}quote_`, `${prefix}create_`);
        const all = pi.getAllTools();
        const schema = all.find((item) => item.name === tool)?.parameters as Record<string, any> | undefined;
        const quoteSchema = all.find((item) => item.name === event.toolName)?.parameters as Record<string, any> | undefined;
        if (!schema) return;
        const receipt: QuoteReceipt = { id: randomUUID(), tool, arguments: defaults(args, quoteSchema ?? {}), quote, credits, schema, createdAt: new Date().toISOString() };
        await exclusive(quotesFile(paths), async () => {
          const records = (await readJson<QuoteReceipt[]>(quotesFile(paths), [])).filter((item) => Date.now() - Date.parse(item.createdAt) < 30 * 60_000);
          records.push(receipt);
          await writeJson(quotesFile(paths), records);
        });
        return { content: [...event.content, { type: "text", text: `Quote receipt: ${receipt.id}. Before ${tool}, call request_creation_approval with this quote_id and complete create arguments, including max_credits=${credits}, explicit visibility and a stable operation_id.` }], structuredContent: event.structuredContent };
      }
      const approval = await exclusive(paths.approvalsFile, async () => {
        const approvals = await readJson<StoredApproval[]>(paths.approvalsFile, []);
        let item = approvals.find((item) => item.tool === event.toolName && !item.used && item.arguments && canonical(item.arguments) === canonical(args));
        if (item) return item;
        item = { id: randomUUID(), tool: event.toolName, summary: event.toolName.slice(prefix.length), quote: event.structuredContent ?? event.content, arguments: args, granted: false, used: false };
        approvals.push(item);
        await writeJson(paths.approvalsFile, approvals);
        return item;
      });
      emit({ type: "approval", approval });
      return { content: [...event.content, { type: "text", text: `Needs confirmation: ${approval.id}. Wait for approval, then call the same tool with the same arguments and confirm true.` }], structuredContent: event.structuredContent };
    });
  };
}
