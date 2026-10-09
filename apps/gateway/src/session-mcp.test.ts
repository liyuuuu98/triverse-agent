import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_MODEL } from "@triverse/protocol";

test("a project session connects its MCP server when it starts", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method ?? "GET"} ${req.url ?? "/"}`);
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_token" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test MCP server has no port");
  const previousUrl = process.env.TRIVERSE_MCP_URL;
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.TRIVERSE_MCP_URL = `http://127.0.0.1:${address.port}/mcp`;
  const dir = await mkdtemp(path.join(tmpdir(), "triverse-session-mcp-"));
  const projectId = "11111111-1111-4111-8111-111111111111";
  const { ensureSession, dropProject } = await import("./agent.js");
  try {
    await ensureSession({
      dataDir: dir,
      skillsDir: dir,
      projectId,
      model: DEFAULT_MODEL,
      text: "",
      emit: () => undefined,
      apiKey: "test",
      baseUrl: "http://127.0.0.1:9",
    });
    const started = Date.now();
    while (hits.length === 0 && Date.now() - started < 8_000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(hits.length > 0, "session start did not connect to the MCP server");
  } finally {
    await dropProject(projectId);
    if (previousUrl === undefined) delete process.env.TRIVERSE_MCP_URL;
    else process.env.TRIVERSE_MCP_URL = previousUrl;
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});
