import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveInside } from "./paths.js";

const root = path.join("/tmp", "triverse-workspace");

test("resolveInside accepts a nested relative path", () => {
  assert.equal(resolveInside(root, "assets/crate.glb"), path.join(root, "assets/crate.glb"));
});

test("resolveInside rejects an empty path", () => {
  assert.throws(() => resolveInside(root, ""), /empty/);
});

test("resolveInside rejects an absolute path", () => {
  assert.throws(() => resolveInside(root, "/etc/passwd"), /absolute/);
});

test("resolveInside rejects parent escape", () => {
  assert.throws(() => resolveInside(root, "../secrets"), /escapes/);
  assert.throws(() => resolveInside(root, "assets/../../outside"), /escapes/);
});
