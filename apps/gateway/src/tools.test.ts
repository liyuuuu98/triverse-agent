import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalAssetTools } from "./tools.js";

test("inspect_asset reports a workspace glb and rejects paths outside it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-inspect-"));
  try {
    const workspace = path.join(dir, "workspace");
    await mkdir(path.join(workspace, "assets"), { recursive: true });
    await writeFile(path.join(workspace, "assets", "box.glb"), oneTriangleGlb());
    await writeFile(path.join(workspace, "assets", "note.txt"), "hello");
    const tool = createLocalAssetTools({ workspace })[0];
    assert.ok(tool);
    const mesh = await tool.execute("1", { path: "assets/box.glb" }, undefined, undefined, undefined as never);
    assert.equal(mesh.isError, undefined);
    assert.match(textOf(mesh), /"triangles":1/);
    const other = await tool.execute("2", { path: "assets/note.txt" }, undefined, undefined, undefined as never);
    assert.match(textOf(other), /not a mesh/);
    const escaped = await tool.execute("3", { path: "../secret.glb" }, undefined, undefined, undefined as never);
    assert.equal(escaped.isError, true);
    assert.match(textOf(escaped), /path escapes workspace/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((part) => part.text ?? "").join("");
}

function oneTriangleGlb(): Buffer {
  const jsonText = JSON.stringify({
    asset: { version: "2.0" },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { componentType: 5123, count: 3, type: "SCALAR" },
    ],
    materials: [{}],
  });
  const jsonChunk = Buffer.concat([Buffer.from(jsonText), Buffer.alloc((4 - (Buffer.byteLength(jsonText) % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}
