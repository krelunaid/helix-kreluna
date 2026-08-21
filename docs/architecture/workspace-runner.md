# Production workspace runner contract

Status: **adapter, protocol and provider-neutral service core implemented; sandbox provider and service deployment not configured**.

## Trust boundary

Generated workspace files are untrusted. They must never be installed, compiled, tested or started inside the TanStack/Netlify process or the job queue process. The Helix adapter sends the exact bounded candidate to a separately operated disposable container and accepts results only when all of the following are true:

- the local candidate passes path, size, secret-content and file-hash verification;
- `package.json` and `package-lock.json` exist and the four fixed scripts `typecheck`, `lint`, `test` and `build` are declared;
- request and response use HMAC-SHA256 with a secret of at least 32 characters;
- the service accepts only a fresh timestamp, an exact header/body nonce match and an atomic replay-store claim;
- the response is bound to the unique request nonce and exact candidate source hash;
- the container reports deny-by-default network policy, each step reports its effective policy, and the container confirms destruction;
- install, typecheck, lint, test, build and security each return measured evidence, status `passed` and exit code zero before the adapter accepts the report;
- timestamps, response size and total execution duration remain within the contract limits.

An unconfigured runner, partial env pair, HTTP URL outside loopback, invalid candidate, invalid signature, stale/replayed response, changed hash, missing step, timeout or failed step is a hard failure. A later step that did not execute is explicitly `not_run`, never measured. None of these states can be converted to `passed` or `done`.

## Fixed profile

Protocol `1.1.0` contains step identifiers, not arbitrary commands. The `node_web_v1` service owns this exact argv mapping:

1. `npm ci --ignore-scripts --no-audit --no-fund` from the committed lockfile;
2. `npm run typecheck --`;
3. `npm run lint --`;
4. `npm run test --`;
5. `npm run build --`;
6. `npm audit --omit=dev --audit-level=high --json`.

Candidate validation performs the bounded secret-pattern preflight; the sixth command is specifically a production dependency audit and is not described as a complete SAST suite. Install and audit may reach only `registry.npmjs.org`. Typecheck, lint, test and build use outbound networking disabled. Raw user values are never interpolated into shell command strings. Stdout/stderr are redacted and limited a 16 KiB combinati; the response carries only hashes and a short service-owned detail. The client also bounds a chunked or length-declared HTTP response to 256 KiB before parsing it.

The service requires an injected atomic replay store and an injected sandbox factory. It has no in-memory production fallback. It asks the provider for an empty disposable container, fixed root, non-inherited minimal environment, 32-process ceiling, resource bounds, output limit and whole-process-tree termination on timeout. The provider implementation remains responsible for enforcing those operating-system constraints.

## Candidate and release evidence

`helix_workspace_candidate` is intentionally separate from `helix_workspace`:

- a candidate describes exact Production source files before validation and contains no fabricated validation status;
- the runner report is measured evidence bound to the candidate hash;
- only a later integration may write the report into the workspace, attach evidence paths and seal a Production release manifest.

The current code stops after the service/adapter trust boundary. Production generation and release remain disabled; no candidate is automatically sent, no report is persisted as append-only release evidence and no report is used to publish or deploy.

## Isolated service target

Cloudflare Sandbox SDK is a compatible implementation target, not an activated dependency of Helix. Its official documentation describes isolated sandbox instances, argv-based process APIs, filesystem operations, explicit process/timeout lifecycle and outbound allowlisting. A future provider adapter must use one unique sandbox per job attempt, enforce process/resource limits, limit outbound hosts to the package registry during install/audit, disable outbound access for later steps and destroy the sandbox in `finally` even after timeout.

References:

- <https://developers.cloudflare.com/sandbox/1-0-preview/get-started/>
- <https://developers.cloudflare.com/sandbox/1-0-preview/processes/>
- <https://developers.cloudflare.com/sandbox/guides/outbound-traffic/>

Local tests use an injected fake sandbox to verify orchestration, not to claim OS isolation. No Cloudflare package, account, container, Worker, persistent replay store, custom domain or secret was created by this implementation.
