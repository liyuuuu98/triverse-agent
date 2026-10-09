import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAgentTools, createWorkspaceLoader } from "./agent.js";
import { agentDirFor, ensureMcpConfig, TRIVERSE_MCP_URL } from "./mcp.js";
import { shellAvailable } from "./sandbox.js";

test("the explicit MCP extension loads while unrelated extensions remain disabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "triverse-mcp-config-"));
  try {
    const agentDir = agentDirFor(dir);
    ensureMcpConfig(agentDir);
    const config = JSON.parse(await readFile(path.join(agentDir, "mcp.json"), "utf8"));
    assert.equal(config.mcpServers.triverse.url, TRIVERSE_MCP_URL);
    assert.equal(config.mcpServers.triverse.exposure, "direct");
    assert.equal(config.mcpServers.triverse.oauth.callbackPort, 8791);
    const loader = createWorkspaceLoader({ workspace: dir, agentDir, skillsDir: dir, settingsManager: SettingsManager.create(dir, agentDir), approval: () => undefined });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.ok(loader.getExtensions().extensions.some((extension) => extension.path.includes("mcp")));
    const shell = shellAvailable(dir) ? ["bash"] : [];
    assert.deepEqual(createAgentTools({ workspace: dir }).map((tool) => tool.name), ["read", "write", "edit", ...shell, "inspect_asset", "list_workspace_files", "read_scene", "update_scene", "add_scene_asset", "save_asset_version", "export_asset_pack", "request_creation_approval", "upload_reference", "sync_tasks", "deliver_asset", "generate_image"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
