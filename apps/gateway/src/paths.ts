import { realpath } from "node:fs/promises";
import path from "node:path";

export function resolveInside(root: string, relative: string): string {
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")) {
    throw new Error("path is empty");
  }
  if (relative.startsWith("/") || /^[A-Za-z]:[\\/]/.test(relative)) {
    throw new Error("absolute path");
  }
  const rootReal = path.resolve(root);
  const target = path.resolve(rootReal, relative);
  const fromRoot = path.relative(rootReal, target);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new Error("path escapes workspace");
  }
  return target;
}

export async function realInside(root: string, absolute: string): Promise<string> {
  const rootReal = await realpath(root);
  let current = path.resolve(absolute);
  const missing: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      const fromRoot = path.relative(rootReal, real);
      if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) throw new Error("path escapes workspace");
      return path.join(real, ...missing.reverse());
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error("path escapes workspace");
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

export function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".glb":
      return "model/gltf-binary";
    case ".zip":
      return "application/zip";
    case ".gltf":
      return "model/gltf+json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".md":
    case ".txt":
    case ".log":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
