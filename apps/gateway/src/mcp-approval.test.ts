import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { consumeMcpApproval, createMcpApprovalExtension, rejectMcpApproval, grantMcpApproval } from "./mcp-approval.js";
import { projectPaths, readJson, writeJson, type StoredApproval } from "./projects.js";

test("MCP quotes reach the approval UI and confirmation requires the exact quoted arguments", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "triverse-mcp-approval-"));
  try {
    const paths = projectPaths(dir, "fixture");
    await mkdir(path.dirname(paths.approvalsFile), { recursive: true });
    const handlers = new Map<string, (event: any) => any>();
    const events: unknown[] = [];
    const toolName = "mcp__triverse__text_to_model";
    const pi = {
      on: (name: string, handler: (event: any) => any) => handlers.set(name, handler),
      getAllTools: () => [{ name: toolName, parameters: { properties: { confirm: { type: "boolean" } } } }],
    };
    await createMcpApprovalExtension(paths, (event) => events.push(event))(pi as unknown as ExtensionAPI);
    const input = { prompt: "crate" } as Record<string, unknown>;
    const call = handlers.get("tool_call")!;
    assert.equal((await call({ toolName, toolCallId: "unapproved", input: { ...input, confirm: true } })).block, true);
    await call({ toolName, toolCallId: "quote", input });
    assert.equal(input.confirm, false);
    await handlers.get("tool_result")!({ toolName, toolCallId: "quote", input, isError: false, content: [{ type: "text", text: "12 credits" }], structuredContent: { credits: 12 } });
    const approvals = await readJson<StoredApproval[]>(paths.approvalsFile, []);
    assert.equal(approvals.length, 1);
    assert.deepEqual(approvals[0].quote, { credits: 12 });
    assert.equal((events[0] as { type: string }).type, "approval");
    approvals[0].granted = true;
    await writeJson(paths.approvalsFile, approvals);
    assert.equal((await call({ toolName, toolCallId: "different", input: { prompt: "car", confirm: true } })).block, true);
    assert.equal(await call({ toolName, toolCallId: "approved", input: { prompt: "crate", confirm: true } }), undefined);
    assert.equal((await call({ toolName, toolCallId: "reused", input: { prompt: "crate", confirm: true } })).block, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a single MCP grant cannot authorize two simultaneous calls", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "triverse-mcp-grant-"));
  try {
    const paths = projectPaths(dir, "fixture");
    await mkdir(path.dirname(paths.approvalsFile), { recursive: true });
    await writeJson(paths.approvalsFile, [{ id: "grant", tool: "mcp__triverse__text_to_model", summary: "Generate", quote: {}, arguments: { prompt: "crate" }, granted: true, used: false }]);
    const results = await Promise.all([1, 2].map(() => consumeMcpApproval(paths, "mcp__triverse__text_to_model", { confirm: true, prompt: "crate" })));
    assert.equal(results.filter(Boolean).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("declined approvals cannot be granted or consumed",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"triverse-decline-"));
 try {
  const paths=projectPaths(dir,"fixture");
  await writeJson(paths.approvalsFile,[{id:"declined",tool:"mcp__triverse__text_to_model",arguments:{prompt:"crate"},granted:false,used:false}]);
  await rejectMcpApproval(paths,"declined");
  await assert.rejects(grantMcpApproval(paths,"declined"),/no longer pending/);
  assert.equal(await consumeMcpApproval(paths,"mcp__triverse__text_to_model",{prompt:"crate",confirm:true}),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
