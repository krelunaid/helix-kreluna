import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const html = `<!doctype html><html lang="en"><head><title>Validated execution</title></head><body><main>${"Complete interactive artifact. ".repeat(20)}</main></body></html>`;

test("agent execution status is artifact-bound and fail-closed", async (t) => {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    resolve: { alias: { "@": join(ROOT, "src") } },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => vite.close());
  const { AgentExecutionEnvelopeSchema, completeAgentExecution, validateAgentExecution } =
    await vite.ssrLoadModule("/src/lib/server/agents/execution.ts");

  const done = await completeAgentExecution("forgeLogic", html);
  assert.equal(done.status, "done");
  assert.equal(done.artifact.name, "forge_logic_html");
  assert.match(done.artifact.sha256, /^[0-9a-f]{64}$/);
  assert.equal(done.artifact.validation, "passed");
  assert.equal(done.error, null);
  assert.deepEqual(validateAgentExecution("forgeLogic", done), done);

  await assert.rejects(
    completeAgentExecution("forgeLogic", "not a complete HTML artifact"),
    /AGENT_OUTPUT_VALIDATION_FAILED/,
  );
  assert.equal(
    AgentExecutionEnvelopeSchema.safeParse({
      contractId: "forgeLogic",
      status: "done",
      artifact: null,
      error: null,
    }).success,
    false,
  );
  assert.equal(
    AgentExecutionEnvelopeSchema.safeParse({
      contractId: "forgeLogic",
      status: "error",
      artifact: null,
      error: { retryable: false, detailRedacted: "Missing code" },
    }).success,
    false,
  );
  assert.throws(
    () =>
      validateAgentExecution("forgeLogic", {
        ...done,
        artifact: { ...done.artifact, name: "another_artifact" },
      }),
    /AGENT_EXECUTION_ARTIFACT_MISMATCH/,
  );
});
