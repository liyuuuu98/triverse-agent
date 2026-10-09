import type { ChatImage } from "@triverse/protocol";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { realInside, resolveInside } from "./paths.js";

const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 6_000_000;

export interface IncomingImage {
  name: string;
  mimeType: keyof typeof IMAGE_EXTENSIONS;
  data: string;
}

export function readIncomingImages(body: unknown): IncomingImage[] {
  if (!body || typeof body !== "object" || !("images" in body) || (body as { images?: unknown }).images === undefined) return [];
  const value = (body as { images?: unknown }).images;
  if (!Array.isArray(value)) throw new Error("images must be a list");
  if (value.length > MAX_IMAGES) throw new Error(`attach at most ${MAX_IMAGES} images`);
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid image");
    const record = item as Record<string, unknown>;
    const mimeType = typeof record.mimeType === "string" ? record.mimeType.toLowerCase() : "";
    if (!(mimeType in IMAGE_EXTENSIONS)) throw new Error("use a png, jpeg, webp, or gif");
    const data = typeof record.data === "string" ? record.data : "";
    if (!data.trim()) throw new Error("image data is empty");
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "image";
    return { name: name.replace(/[\r\n]/g, " ").slice(0, 120), mimeType: mimeType as IncomingImage["mimeType"], data };
  });
}

export function modelText(text: string, images: ChatImage[]): string {
  if (images.length === 0) return text;
  const lines = images.map((image) => `- ${image.path}`).join("\n");
  return `${text || "Look at the attached image."}\n\nWorkspace images:\n${lines}`;
}

export async function saveChatImages(workspace: string, images: IncomingImage[], maxBytes = MAX_IMAGE_BYTES): Promise<ChatImage[]> {
  if (images.length === 0) return [];
  await mkdir(path.join(workspace, "refs"), { recursive: true });
  const saved: ChatImage[] = [];
  for (const image of images) {
    const bytes = decodeImage(image.data);
    if (bytes.length === 0 || bytes.length > maxBytes) throw new Error("image is too large");
    if (!matchesType(image.mimeType, bytes)) throw new Error("image data does not match its type");
    const relative = `refs/${randomUUID()}.${IMAGE_EXTENSIONS[image.mimeType]}`;
    const target = await realInside(workspace, resolveInside(workspace, relative));
    await writeFile(target, bytes);
    saved.push({ name: image.name, mimeType: image.mimeType, path: relative });
  }
  return saved;
}

function decodeImage(data: string): Buffer {
  const payload = data.trim().replace(/\s/g, "");
  const body = payload.startsWith("data:") ? payload.slice(payload.indexOf(",") + 1) : payload;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0) throw new Error("image data is not valid");
  return Buffer.from(body, "base64");
}

function matchesType(mimeType: IncomingImage["mimeType"], bytes: Buffer): boolean {
  if (mimeType === "image/png") return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/gif") return bytes.subarray(0, 3).toString("ascii") === "GIF";
  return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}
