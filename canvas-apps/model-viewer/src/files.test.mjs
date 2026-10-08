import assert from "node:assert/strict";
import test from "node:test";
import { joinPath, modelKind, parentDir, parseFind, shQuote } from "./files.js";

test("model kinds stay limited to mesh files", () => {
  assert.equal(modelKind("/projects/canvas-mcp-check/box.glb"), "glb");
  assert.equal(modelKind("/tmp/Scene.GLTF"), "gltf");
  assert.equal(modelKind("/tmp/part.obj"), "obj");
  assert.equal(modelKind("/tmp/part.stl"), "stl");
  assert.equal(modelKind("/tmp/notes.md"), null);
});

test("shell quoting keeps spaces and quotes inside one argument", () => {
  assert.equal(shQuote("/projects/my model.glb"), "'/projects/my model.glb'");
  assert.equal(shQuote("/tmp/it's.glb"), `'/tmp/it'\\''s.glb'`);
});

test("directory helpers do not climb above root", () => {
  assert.equal(parentDir("/projects/canvas-mcp-check"), "/projects");
  assert.equal(parentDir("/"), "/");
  assert.equal(joinPath("/projects/a", "../b/box.glb"), "/projects/b/box.glb");
  assert.equal(joinPath("/projects/a", "/abs.glb"), "/abs.glb");
});

test("find output keeps paths that contain spaces", () => {
  const files = parseFind("928 /projects/canvas-mcp-check/box.glb\n12 /tmp/my model.stl\nnope\n4 /tmp/notes.md\n");
  assert.deepEqual(files, [
    { size: 928, path: "/projects/canvas-mcp-check/box.glb" },
    { size: 12, path: "/tmp/my model.stl" },
  ]);
});
