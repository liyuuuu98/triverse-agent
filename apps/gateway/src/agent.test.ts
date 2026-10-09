import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { shellAvailable, prepareBash } from "./sandbox.js";
import { MODELS } from "@triverse/protocol";
import { anthropicBaseUrl, createAgentTools, finishedTool, modelFailure, providerForModel, readableProviderError, writeModelCatalog } from "./agent.js";

test("the model catalog stores an env reference, not a key", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-catalog-"));
  try {
    const file = path.join(dir, "models.json");
    await writeModelCatalog(file, "https://api.teamorouter.cn/v1");
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text) as {
      providers: {
        teamo: { apiKey: string; api: string; baseUrl: string; models: Array<{ id: string }> };
        "teamo-anthropic": { apiKey: string; api: string; baseUrl: string; models: Array<{ id: string }> };
      };
    };
    const claude = MODELS.filter((model) => model.id.startsWith("claude-")).map((model) => model.id);
    const openai = MODELS.filter((model) => !model.id.startsWith("claude-")).map((model) => model.id);
    assert.equal(parsed.providers.teamo.apiKey, "${TEAMO_API_KEY}");
    assert.equal(parsed.providers.teamo.api, "openai-completions");
    assert.equal(parsed.providers.teamo.baseUrl, "https://api.teamorouter.cn/v1");
    assert.deepEqual(parsed.providers.teamo.models.map((model) => model.id), openai);
    assert.equal(parsed.providers["teamo-anthropic"].apiKey, "${TEAMO_API_KEY}");
    assert.equal(parsed.providers["teamo-anthropic"].api, "anthropic-messages");
    assert.equal(parsed.providers["teamo-anthropic"].baseUrl, "https://api.teamorouter.cn");
    assert.deepEqual(parsed.providers["teamo-anthropic"].models.map((model) => model.id), claude);
    assert.equal(text.includes("sk-"), false);
    assert.equal(providerForModel("claude-haiku-5-5"), "teamo-anthropic");
    assert.equal(providerForModel("gpt-6.1-sol"), "teamo");
    assert.equal(anthropicBaseUrl("https://api.teamorouter.cn/v1/"), "https://api.teamorouter.cn");
    const authPath = path.join(dir, "auth.json");
    await writeFile(authPath, "{}\n");
    const runtime = await ModelRuntime.create({ authPath, modelsPath: file, allowModelNetwork: false, refreshOnCreate: false });
    assert.equal(runtime.getModel("teamo-anthropic", "claude-haiku-5-5")?.api, "anthropic-messages");
    assert.equal(runtime.getModel("teamo-anthropic", "claude-haiku-5-5")?.baseUrl, "https://api.teamorouter.cn");
    assert.equal(runtime.getModel("teamo", "gpt-6.1-sol")?.api, "openai-completions");
    assert.equal(runtime.getModel("teamo", "claude-haiku-5-5"), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed model turn becomes a visible reply", () => {
  const raw = "503 {\"error\":{\"message\":\"The requested model is temporarily unavailable. Please retry.\",\"type\":\"upstream_model_error\",\"code\":503}}";
  assert.equal(modelFailure([
    { role: "user" },
    { role: "assistant", stopReason: "error", errorMessage: raw },
  ]), "The model did not respond. The requested model is temporarily unavailable. Please retry.");
  assert.equal(modelFailure([
    { role: "assistant", stopReason: "error", errorMessage: raw },
    { role: "assistant", stopReason: "stop", errorMessage: undefined },
  ]), undefined);
  assert.equal(readableProviderError(""), "The model did not respond.");
});

test("a saved image path is kept on the tool row", () => {
  const imagePath = "images/11111111-1111-4111-8111-111111111111.png";
  const done = finishedTool({
    toolCallId: "call-1",
    toolName: "generate_image",
    isError: false,
    result: { content: [{ type: "text", text: `Saved ${imagePath}` }], details: { imagePath } },
  });
  assert.equal(done.state, "done");
  assert.equal(done.imagePath, imagePath);
  const failed = finishedTool({
    toolCallId: "call-2",
    toolName: "generate_image",
    isError: true,
    result: { content: [{ type: "text", text: "image generation failed (402)" }], details: { imagePath } },
  });
  assert.equal(failed.imagePath, undefined);
  assert.equal(failed.state, "error");
  const other = finishedTool({
    toolCallId: "call-3",
    toolName: "read",
    isError: false,
    result: { content: [{ type: "text", text: "Needs confirmation before writing" }], details: { imagePath: "refs/secret.png" } },
  });
  assert.equal(other.state, "needs_confirmation");
  assert.equal(other.imagePath, undefined);
  const pack=finishedTool({toolCallId:"pack",toolName:"export_asset_pack",isError:false,result:{content:[{type:"text",text:"Pack created"}],details:{filePath:"exports/asset-pack-123.zip"}}});
  assert.equal(pack.filePath,"exports/asset-pack-123.zip");
  const escaped=finishedTool({toolCallId:"escape",toolName:"export_asset_pack",isError:false,result:{content:[],details:{filePath:"exports/../../control/approvals.json"}}});
  assert.equal(escaped.filePath,undefined);
});

test("workspace shell works on macOS without a timeout executable and reports failures", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-shell-"));
  try {
    const shell = createAgentTools({ workspace: dir }).find((tool) => tool.name === "bash");
    if (!shellAvailable(dir)) { assert.equal(shell, undefined, "unisolated shell must not be exposed"); return; }
    assert.ok(shell);
    const result = await shell.execute("shell-ok", { command: "printf portable-shell" }, undefined, undefined, undefined as never);
    assert.match(JSON.stringify(result.content), /portable-shell/);
    assert.doesNotMatch(JSON.stringify(result.content), /timeout: command not found/);
    const failed = await shell.execute("shell-fail", { command: "exit 7" }, undefined, undefined, undefined as never);
    assert.equal(failed.isError, true);
    assert.match(JSON.stringify(failed.content), /code 7/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
