import assert from "node:assert/strict";
import test from "node:test";
import { inspectGlb } from "./inspect.js";

test("inspectGlb counts one triangle", () => {
  const report = inspectGlb(oneTriangleGlb());
  assert.equal(report.triangles, 1);
  assert.equal(report.meshes, 1);
  assert.equal(report.vertices, 3);
  assert.equal(report.materials, 1);
  assert.deepEqual(report.bounds, { min: [0, 0, 0], max: [1, 1, 0] });
});

function oneTriangleGlb(): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { componentType: 5123, count: 3, type: "SCALAR" },
    ],
    materials: [{}],
  });
  const jsonPad = (4 - (Buffer.byteLength(json) % 4)) % 4;
  const jsonChunk = Buffer.concat([Buffer.from(json), Buffer.alloc(jsonPad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}
