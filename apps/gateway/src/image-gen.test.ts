import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateImage, imageGenerationsUrl, savedImagePath } from "./image-gen.js";
import { createImageTool } from "./tools.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("image generation uses the configured /v1 base", () => {
  assert.equal(imageGenerationsUrl("https://api.teamorouter.cn/v1"), "https://api.teamorouter.cn/v1/images/generations");
  assert.equal(imageGenerationsUrl("https://api.teamorouter.cn/v1/"), "https://api.teamorouter.cn/v1/images/generations");
  assert.equal(imageGenerationsUrl("https://api.teamorouter.com"), "https://api.teamorouter.com/v1/images/generations");
  assert.equal(savedImagePath({ details: { imagePath: "images/abc-def.png" } }), "images/abc-def.png");
  assert.equal(savedImagePath({ details: { imagePath: "refs/abc.png" } }), undefined);
  assert.equal(savedImagePath({ details: { imagePath: "https://example.com/a.png" } }), undefined);
});

test("generateImage accepts png, jpeg, and webp bytes and rejects other payloads", async () => {
  const png = await generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "test-key", prompt: "red square", fetchImpl: jsonFetch({ data: [{ b64_json: PNG }] }) });
  assert.equal(png.extension, "png");
  assert.equal(png.bytes[0], 0x89);
  const jpeg = await generateImage({ baseUrl: "https://api.teamorouter.com", apiKey: "test-key", prompt: "red square", fetchImpl: jsonFetch({ data: [{ b64_json: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64") }] }) });
  assert.equal(jpeg.extension, "jpg");
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
  const web = await generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "test-key", prompt: "red square", fetchImpl: jsonFetch({ data: [{ b64_json: webp.toString("base64") }] }) });
  assert.equal(web.extension, "webp");
  await assert.rejects(() => generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "test-key", prompt: "red square", fetchImpl: jsonFetch({ data: [{ url: "https://example.com/a.png" }] }) }), /b64_json/);
  await assert.rejects(() => generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "test-key", prompt: "red square", fetchImpl: jsonFetch({ data: [{ b64_json: Buffer.from("hello").toString("base64") }] }) }), /PNG, JPEG, or WebP/);
  await assert.rejects(() => generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "", prompt: "red square", fetchImpl: jsonFetch({}) }), /TEAMO_API_KEY is not set/);
  await assert.rejects(() => generateImage({ baseUrl: "https://api.teamorouter.cn/v1", apiKey: "test-key", prompt: "red square", fetchImpl: async () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 402 }) }), /image generation failed \(402\).*quota exceeded/);
});

test("generate_image writes the decoded file and does not call the network without a key", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-image-"));
  try {
    let calls = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls += 1;
      assert.equal(String(url), "https://api.teamorouter.cn/v1/images/generations");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-key");
      assert.equal(headers.get("content-type"), "application/json");
      assert.deepEqual(JSON.parse(String(init?.body)), { model: "gpt-image-2.5-sunburst", prompt: "a red square", size: "1024x1024", quality: "high" });
      return new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), { status: 200 });
    };
    const tool = createImageTool({ workspace: dir, apiKey: "test-key", baseUrl: "https://api.teamorouter.cn/v1/", fetchImpl });
    const saved = await tool.execute("1", { prompt: "a red square" }, undefined, undefined, undefined as never);
    assert.equal(saved.isError, undefined);
    const relative = savedImagePath(saved);
    assert.match(relative ?? "", /^images\/[0-9a-f-]+\.png$/);
    const bytes = await readFile(path.join(dir, relative!));
    assert.equal(bytes[0], 0x89);
    assert.equal(calls, 1);
    let blocked = 0;
    const missing = createImageTool({ workspace: dir, apiKey: "", baseUrl: "https://api.teamorouter.cn/v1", fetchImpl: async () => { blocked += 1; return new Response(""); } });
    const denied = await missing.execute("2", { prompt: "a red square" }, undefined, undefined, undefined as never);
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /TEAMO_API_KEY is not set/);
    assert.equal(blocked, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function jsonFetch(body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
