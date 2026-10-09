import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let result = text;
  for (const [name, value] of Object.entries(env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && value && value.length >= 8) {
      result = result.split(value).join("[REDACTED]");
    }
  }
  return result.replace(/\bsk-[a-zA-Z0-9_.-]{16,}/g, "[REDACTED]");
}

function redactValue<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(redactValue) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)])) as T;
  return value;
}

export const createSecretRedactionExtension: ExtensionFactory = (pi) => {
  pi.on("tool_result", (event) => {
    const content = event.content.map((part) => part.type === "text" ? { ...part, text: redactSecrets(part.text) } : part);
    const structuredContent = redactValue(event.structuredContent);
    if (JSON.stringify(content) === JSON.stringify(event.content) && JSON.stringify(structuredContent) === JSON.stringify(event.structuredContent)) return;
    return { content, structuredContent };
  });
};
