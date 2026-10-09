// TeamoRouter bills by the returned long side. 1024 stays on the 1K tier; quality does not change that tier.
export const IMAGE_MODEL = "gpt-image-2.5-sunburst";
const IMAGE_SIZE = "1024x1024";
const IMAGE_QUALITY = "high";
const IMAGE_TIMEOUT_MS = 300_000;
const MAX_IMAGE_BYTES = 20_000_000;
const MAX_RESPONSE_CHARS = 28_000_000;

export function imageGenerationsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const root = trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
  return `${root}/images/generations`;
}

export function savedImagePath(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || !("details" in result)) return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || !("imagePath" in details)) return undefined;
  const value = (details as { imagePath?: unknown }).imagePath;
  return typeof value === "string" && /^images\/[0-9a-f-]+\.(png|jpg|webp)$/.test(value) ? value : undefined;
}

export async function generateImage(input: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ bytes: Buffer; mimeType: "image/png" | "image/jpeg" | "image/webp"; extension: "png" | "jpg" | "webp" }> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("prompt is required");
  if (prompt.length > 4000) throw new Error("prompt is too long");
  if (!input.apiKey) throw new Error("TEAMO_API_KEY is not set");
  if (!input.baseUrl.trim()) throw new Error("image generation URL is not configured");
  const response = await (input.fetchImpl ?? fetch)(imageGenerationsUrl(input.baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: IMAGE_SIZE, quality: IMAGE_QUALITY }),
    signal: AbortSignal.timeout(input.timeoutMs ?? IMAGE_TIMEOUT_MS),
  });
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS) throw new Error("image response was empty or too large");
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) throw new Error("image response was empty or too large");
  if (!response.ok) throw new Error(providerError(response.status, body));
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("image response was not JSON");
  }
  const encoded = imagePayload(parsed);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("image response was empty or too large");
  const kind = imageKind(bytes);
  if (!kind) throw new Error("image response was not a PNG, JPEG, or WebP");
  return { bytes, ...kind };
}

function imagePayload(body: unknown): string {
  const data = body && typeof body === "object" && "data" in body ? (body as { data?: unknown }).data : undefined;
  const first = Array.isArray(data) ? data[0] : undefined;
  const encoded = first && typeof first === "object" && "b64_json" in first ? (first as { b64_json?: unknown }).b64_json : undefined;
  if (typeof encoded !== "string" || !encoded.trim()) throw new Error("image response did not include b64_json");
  return encoded;
}

function providerError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      return `image generation failed (${status}). ${parsed.error.message.trim().slice(0, 300)}`;
    }
  } catch {
    // Keep the status when the body is not JSON.
  }
  return `image generation failed (${status})`;
}

function imageKind(bytes: Buffer): { mimeType: "image/png" | "image/jpeg" | "image/webp"; extension: "png" | "jpg" | "webp" } | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: "image/png", extension: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  return undefined;
}
