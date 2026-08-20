import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [typesSource, gateSource, exportSource, githubSource, deploySource] =
  await Promise.all([
    readFile(new URL("../src/lib/agent-types.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/lib/server/review/human-gate.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/server/workspace-export.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/lib/server/github.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server/deploy.ts", import.meta.url), "utf8"),
  ]);

test("workspace source stays server-side and releases re-verify its exact manifest", () => {
  const publicDto = typesSource.slice(typesSource.indexOf("export type PublicBuildJob"));
  assert.match(publicDto, /\| "files"/);
  assert.match(gateSource, /verifyWorkspace\(files, payload\.workspace\)/);
  assert.match(gateSource, /files\["index\.html"\] !== payload\.html/);

  assert.match(exportSource, /middleware\(\[authMiddleware\]\)/);
  assert.match(exportSource, /getApprovedOwnedBuild\(/);
  assert.match(exportSource, /workspaceExportFiles\(/);
  assert.ok(
    exportSource.indexOf("workspaceExportFiles") < exportSource.indexOf("zipFiles(files)"),
  );
  assert.match(exportSource, /packageSha256/);
  assert.match(exportSource, /workspaceSha256/);
});

test("GitHub publishes one atomic tree commit from only the approved workspace", () => {
  assert.match(githubSource, /getApprovedOwnedBuild\(/);
  assert.match(githubSource, /workspaceExportFiles\(artifact\.files, artifact\.workspace\)/);
  assert.match(githubSource, /\/git\/blobs/);
  assert.match(githubSource, /\/git\/trees/);
  assert.match(githubSource, /\/git\/commits/);
  assert.match(githubSource, /\/git\/refs\/heads/);
  assert.doesNotMatch(githubSource, /\/contents\/\$\{path\}/);
  assert.match(githubSource, /force:\s*false/);
});

test("source-only Windows wrapper has the same zero cost in server policy and UI", () => {
  assert.match(
    deploySource,
    /DEPLOY_COST\s*=\s*\{\s*web:\s*50,\s*ios:\s*80,\s*android:\s*80,\s*windows:\s*0\s*\}/,
  );
});
