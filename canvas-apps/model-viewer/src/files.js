export const MODEL_EXTS = [".glb", ".gltf", ".obj", ".stl"];

export function modelKind(path) {
  const clean = String(path).split("?")[0].split("#")[0].toLowerCase();
  for (const ext of MODEL_EXTS) {
    if (clean.endsWith(ext)) return ext.slice(1);
  }
  return null;
}

export function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function parentDir(path) {
  const trimmed = String(path).replace(/\/+$/, "") || "/";
  if (trimmed === "/") return "/";
  const slash = trimmed.lastIndexOf("/");
  return slash <= 0 ? "/" : trimmed.slice(0, slash);
}

export function joinPath(dir, rel) {
  if (!rel || rel.startsWith("/")) return rel;
  const parts = `${String(dir).replace(/\/+$/, "")}/${rel}`.split("/");
  const out = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

export function parseFind(stdout) {
  const files = [];
  for (const raw of String(stdout).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const space = line.indexOf(" ");
    if (space <= 0) continue;
    const size = Number(line.slice(0, space));
    const path = line.slice(space + 1);
    if (!Number.isFinite(size) || !path.startsWith("/") || !modelKind(path)) continue;
    files.push({ size, path });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
