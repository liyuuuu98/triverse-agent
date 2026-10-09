import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { modelText, readIncomingImages, saveChatImages } from "./images.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("saves a png under refs and rejects a mismatched or oversized image", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "pi-images-"));
  try {
    assert.deepEqual(readIncomingImages({}), []);
    assert.throws(() => readIncomingImages({ images: [{ name: "a.svg", mimeType: "image/svg+xml", data: PNG }] }), /png, jpeg, webp, or gif/);
    assert.throws(() => readIncomingImages({ images: Array.from({ length: 5 }, () => ({ mimeType: "image/png", data: PNG })) }), /at most 4/);
    const [image] = await saveChatImages(workspace, readIncomingImages({ images: [{ name: "pixel.png", mimeType: "image/png", data: PNG }] }));
    assert.ok(image);
    assert.equal(image.name, "pixel.png");
    assert.equal(image.mimeType, "image/png");
    assert.match(image.path, /^refs\/[0-9a-f-]+\.png$/);
    const stored = await readFile(path.join(workspace, image.path));
    assert.equal(stored[0], 0x89);
    await assert.rejects(saveChatImages(workspace, [{ name: "bad", mimeType: "image/jpeg", data: PNG }]), /does not match/);
    await assert.rejects(saveChatImages(workspace, [{ name: "big", mimeType: "image/png", data: PNG }], 8), /too large/);
    assert.equal(modelText("make this", [image]), `make this\n\nWorkspace images:\n- ${image.path}`);
    assert.match(modelText("", [image]), /^Look at the attached image\./);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
