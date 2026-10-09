import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets } from "./secrets.js";

test("tool output redacts arbitrary provider credentials without hiding ordinary content", () => {
  const text = "BEATAPI_API_KEY=test-provider-credential PATH=/usr/bin sk-exampleabcdefghijklmnop";
  const result = redactSecrets(text, { BEATAPI_API_KEY: "test-provider-credential", PATH: "/usr/bin" });
  assert.equal(result, "BEATAPI_API_KEY=[REDACTED] PATH=/usr/bin [REDACTED]");
});
