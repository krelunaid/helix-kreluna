#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  EchoAccessibilityReportSchema,
  SwiftPerformanceReportSchema,
  TwinBrowserReportSchema,
} from "../src/lib/server/quality/types.ts";
import {
  auditAccessibility,
  installPerformanceObservers,
  mergeAccessibilityResults,
  readPerformanceMetrics,
} from "./browser-quality-runtime.mjs";
import { startTwinHarness } from "./twin-harness.mjs";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "phone", width: 390, height: 844 },
];
const MAX_CONTROLS_PER_VIEWPORT = 8;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return crypto.subtle
    .digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:gh[oprsu]|github_pat)_[A-Za-z0-9_]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s#]*/gi, (url) => `${url.split("?", 1)[0]}?[REDACTED_QUERY]`)
    .replace(/\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1_000);
}

async function inputArtifact(filename) {
  const source = await readFile(filename, "utf8");
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object" && typeof parsed.html === "string") {
      return {
        html: parsed.html,
        expectedSha256:
          typeof parsed.artifactSha256 === "string"
            ? parsed.artifactSha256
            : undefined,
      };
    }
  } catch {
    // A raw HTML artifact is a supported input format.
  }
  return { html: source, expectedSha256: undefined };
}

async function writeReport(filename, schema, report) {
  schema.parse(report);
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function browserNotRunReport(kind, artifactSha256, reasonCode, detail) {
  const schema =
    kind === "echo_accessibility"
      ? EchoAccessibilityReportSchema
      : SwiftPerformanceReportSchema;
  return schema.parse({
    kind,
    version: "1.0.0",
    status: "not_run",
    evidence: "not_run",
    artifactSha256,
    generatedAt: new Date().toISOString(),
    reasonCode,
    detail,
  });
}

function browserFailedReport(
  kind,
  artifactSha256,
  durationMs,
  errorCode,
  detail,
) {
  const schema =
    kind === "echo_accessibility"
      ? EchoAccessibilityReportSchema
      : SwiftPerformanceReportSchema;
  return schema.parse({
    kind,
    version: "1.0.0",
    status: "failed",
    evidence: "measured",
    artifactSha256,
    generatedAt: new Date().toISOString(),
    runner: "helix-twin-playwright",
    durationMs,
    errorCode,
    detail,
  });
}

function notRunReport(artifactSha256, reasonCode, detail) {
  return TwinBrowserReportSchema.parse({
    kind: "twin_browser",
    version: "1.0.0",
    status: "not_run",
    evidence: "not_run",
    artifactSha256,
    generatedAt: new Date().toISOString(),
    reasonCode,
    detail,
  });
}

async function snapshot(frame) {
  const state = await frame.evaluate(() => ({
    html: document.documentElement?.outerHTML ?? "",
    text: document.body?.innerText ?? "",
    url: location.href,
    dialogs: document.querySelectorAll(
      '[role="dialog"]:not([hidden]),dialog[open],[aria-modal="true"]:not([hidden])',
    ).length,
  }));
  return { ...state, sha256: await sha256(`${state.url}\n${state.text}\n${state.html}`) };
}

async function controlLabel(locator, fallback) {
  return locator
    .evaluate(
      (element) =>
        (
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent ||
          element.getAttribute("value") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
    )
    .then((label) => label || fallback);
}

function valueFor(type, index) {
  if (type === "email") return `twin-${index}@example.test`;
  if (type === "tel") return "+390212345678";
  if (type === "url") return "https://example.test";
  if (type === "number" || type === "range") return "2";
  if (type === "date") return "2030-01-15";
  return `Twin value ${index + 1}`;
}

async function exerciseViewport({
  browser,
  harness,
  viewport,
  screenshotsDirectory,
  sourceBytes,
}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "en-US",
    colorScheme: "light",
  });
  await installPerformanceObservers(context);
  const actions = [];
  const consoleErrors = [];
  const runtimeErrors = [];
  let dialogs = 0;
  let navigations = 0;
  let blockedExternalRequests = 0;
  let controlsDiscovered = 0;
  let controlsExercised = 0;
  let formsDiscovered = 0;
  let formsExercised = 0;

  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    try {
      const url = new URL(requestUrl);
      if (
        url.origin === harness.origin ||
        ["about:", "data:", "blob:"].includes(url.protocol)
      ) {
        await route.continue();
        return;
      }
    } catch {
      // Invalid or nonstandard URLs are denied.
    }
    blockedExternalRequests += 1;
    await route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`[${viewport.name}] ${safeMessage(message.text())}`);
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`[${viewport.name}] ${safeMessage(error)}`);
  });
  page.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss().catch(() => undefined);
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) navigations += 1;
  });

  await page.goto(harness.url, { waitUntil: "load", timeout: 15_000 });
  const frameHandle = await page.waitForSelector("#helix-generated-app", {
    state: "attached",
    timeout: 5_000,
  });
  const frame = await frameHandle.contentFrame();
  if (!frame) throw new Error("TWIN_IFRAME_NOT_AVAILABLE");
  await frame.waitForSelector("body", { state: "attached", timeout: 5_000 });

  const controls = frame.locator(
    'button,a[href],input[type="button"],input[type="submit"],[role="button"]',
  );
  const controlCount = await controls.count();
  for (let index = 0; index < controlCount; index += 1) {
    if (await controls.nth(index).isVisible().catch(() => false)) {
      controlsDiscovered += 1;
    }
  }
  for (
    let index = 0;
    index < controlCount && controlsExercised < MAX_CONTROLS_PER_VIEWPORT;
    index += 1
  ) {
    const control = controls.nth(index);
    if (!(await control.isVisible().catch(() => false))) continue;
    const label = await controlLabel(control, `control ${index + 1}`);
    const baseline = await snapshot(frame);
    await page.waitForTimeout(100);
    const before = await snapshot(frame);
    const changingBeforeAction = baseline.sha256 !== before.sha256;
    const dialogCountBefore = dialogs;
    try {
      await control.click({ timeout: 2_000, noWaitAfter: true });
      await page.waitForTimeout(200);
      const after = await snapshot(frame);
      const changed =
        (!changingBeforeAction && before.sha256 !== after.sha256) ||
        before.url !== after.url ||
        dialogCountBefore !== dialogs;
      actions.push({
        id: `${viewport.name}-click-${index + 1}`,
        viewport: viewport.name,
        type: "click",
        label,
        status: changed ? "changed" : "no_change",
        changed,
        beforeSha256: before.sha256,
        afterSha256: after.sha256,
        detail: changingBeforeAction
          ? "The page was changing before the click; background DOM changes were not attributed to this action."
          : undefined,
      });
    } catch (error) {
      actions.push({
        id: `${viewport.name}-click-${index + 1}`,
        viewport: viewport.name,
        type: "click",
        label,
        status: "failed",
        changed: false,
        beforeSha256: before.sha256,
        detail: safeMessage(error),
      });
    }
    controlsExercised += 1;
  }

  const forms = frame.locator("form");
  formsDiscovered = await forms.count();
  for (let formIndex = 0; formIndex < formsDiscovered; formIndex += 1) {
    const form = forms.nth(formIndex);
    if (!(await form.isVisible().catch(() => false))) continue;
    const fields = form.locator(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]),textarea,select',
    );
    const fieldCount = await fields.count();
    let filled = 0;
    for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
      const field = fields.nth(fieldIndex);
      if (!(await field.isVisible().catch(() => false))) continue;
      const tag = await field.evaluate((element) => element.tagName.toLowerCase());
      const type = await field.getAttribute("type");
      const label = await controlLabel(field, `field ${fieldIndex + 1}`);
      try {
        let changed = false;
        let detail;
        if (tag === "select") {
          const beforeValue = await field.inputValue();
          const values = await field.locator("option:not([disabled])").evaluateAll((options) =>
            options.map((option) => option.value).filter(Boolean),
          );
          const nextValue = values.find((value) => value !== beforeValue);
          if (nextValue) {
            await field.selectOption(nextValue);
            changed = (await field.inputValue()) !== beforeValue;
          } else {
            detail = "No alternative selectable option was available.";
          }
        } else if (type === "checkbox" || type === "radio") {
          const beforeChecked = await field.isChecked();
          if (type === "checkbox") {
            await field.setChecked(!beforeChecked, { timeout: 1_500 });
          } else if (!beforeChecked) {
            await field.check({ timeout: 1_500 });
          } else {
            detail = "The radio option was already selected.";
          }
          changed = (await field.isChecked()) !== beforeChecked;
        } else {
          const beforeValue = await field.inputValue();
          await field.fill(valueFor(type ?? "text", fieldIndex), {
            timeout: 1_500,
          });
          changed = (await field.inputValue()) !== beforeValue;
        }
        actions.push({
          id: `${viewport.name}-form-${formIndex + 1}-fill-${fieldIndex + 1}`,
          viewport: viewport.name,
          type: "fill",
          label,
          status: changed ? "changed" : "no_change",
          changed,
          ...(detail ? { detail } : {}),
        });
        if (changed) filled += 1;
      } catch (error) {
        actions.push({
          id: `${viewport.name}-form-${formIndex + 1}-fill-${fieldIndex + 1}`,
          viewport: viewport.name,
          type: "fill",
          label,
          status: "failed",
          changed: false,
          detail: safeMessage(error),
        });
      }
    }
    const submit = form.locator('button[type="submit"],input[type="submit"],button:not([type])').first();
    if ((await submit.count()) && (await submit.isVisible().catch(() => false))) {
      const before = await snapshot(frame);
      const invalidBefore = await form.locator(":invalid").count().catch(() => 0);
      try {
        await submit.click({ timeout: 2_000, noWaitAfter: true });
        await page.waitForTimeout(200);
        const after = await snapshot(frame);
        const invalidFields = await form.locator(":invalid").count().catch(() => 0);
        const changed = before.sha256 !== after.sha256;
        const validationObserved = !changed && invalidFields > 0;
        actions.push({
          id: `${viewport.name}-form-${formIndex + 1}-submit`,
          viewport: viewport.name,
          type: "submit",
          label: `form ${formIndex + 1} submit`,
          status: changed ? "changed" : validationObserved ? "validated" : "no_change",
          changed,
          beforeSha256: before.sha256,
          afterSha256: after.sha256,
          detail: invalidFields
            ? `${invalidFields} native validation error(s); ${invalidBefore} existed before submit`
            : undefined,
        });
      } catch (error) {
        actions.push({
          id: `${viewport.name}-form-${formIndex + 1}-submit`,
          viewport: viewport.name,
          type: "submit",
          label: `form ${formIndex + 1} submit`,
          status: "failed",
          changed: false,
          beforeSha256: before.sha256,
          detail: safeMessage(error),
        });
      }
    }
    if (filled > 0) formsExercised += 1;
  }

  await mkdir(screenshotsDirectory, { recursive: true });
  const screenshotPath = resolve(screenshotsDirectory, `${viewport.name}.png`);
  const screenshot = await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    type: "png",
  });
  const screenshotEvidence = {
    viewport: viewport.name,
    path: screenshotPath,
    sha256: await sha256(screenshot),
    bytes: screenshot.byteLength,
  };
  const accessibility = await auditAccessibility(frame, page, viewport);
  const performance = await readPerformanceMetrics(
    frame,
    viewport,
    sourceBytes,
  );
  await context.close();
  return {
    actions,
    consoleErrors,
    runtimeErrors,
    screenshotEvidence,
    controlsDiscovered,
    controlsExercised,
    formsDiscovered,
    formsExercised,
    navigations,
    dialogs,
    blockedExternalRequests,
    accessibility,
    performance,
  };
}

async function main() {
  const input = argument("--input");
  if (!input) throw new Error("Usage: node scripts/twin-browser.mjs --input artifact.html [--output report.json]");
  const output = resolve(argument("--output", "artifacts/twin/report.json"));
  const echoOutput = resolve(
    argument("--echo-output", resolve(dirname(output), "echo.json")),
  );
  const swiftOutput = resolve(
    argument("--swift-output", resolve(dirname(output), "swift.json")),
  );
  const screenshotsDirectory = resolve(
    argument("--screenshots", resolve(dirname(output), "screenshots")),
  );
  const requireBrowser = process.argv.includes("--require-browser");
  const artifact = await inputArtifact(resolve(input));
  const artifactSha256 = await sha256(artifact.html);
  const sourceBytes = Buffer.byteLength(artifact.html, "utf8");
  if (
    artifact.expectedSha256 &&
    artifact.expectedSha256 !== artifactSha256
  ) {
    throw new Error("TWIN_ARTIFACT_HASH_MISMATCH");
  }

  let playwright;
  try {
    const playwrightPackage =
      process.env.HELIX_PLAYWRIGHT_PACKAGE?.trim() || "playwright";
    playwright = await import(playwrightPackage);
  } catch {
    const report = notRunReport(
      artifactSha256,
      "browser_dependency_missing",
      "The Playwright package is not installed in this environment; no browser actions were executed.",
    );
    const echo = browserNotRunReport(
      "echo_accessibility",
      artifactSha256,
      "browser_dependency_missing",
      "The Playwright package is not installed; no accessibility browser audit was executed.",
    );
    const swift = browserNotRunReport(
      "swift_performance",
      artifactSha256,
      "browser_dependency_missing",
      "The Playwright package is not installed; no runtime performance metrics were collected.",
    );
    await Promise.all([
      writeReport(output, TwinBrowserReportSchema, report),
      writeReport(echoOutput, EchoAccessibilityReportSchema, echo),
      writeReport(swiftOutput, SwiftPerformanceReportSchema, swift),
    ]);
    process.stdout.write(
      `${JSON.stringify({ output, echoOutput, swiftOutput, status: report.status })}\n`,
    );
    if (requireBrowser) process.exitCode = 2;
    return;
  }

  const startedAt = Date.now();
  let browser;
  let harness;
  try {
    try {
      browser = await playwright.chromium.launch({ headless: true });
    } catch (error) {
      const message = safeMessage(error);
      const binaryMissing = /executable.*(?:doesn['’]t exist|not found)|browser.*not found/i.test(
        message,
      );
      const report = binaryMissing
        ? notRunReport(
            artifactSha256,
            "browser_binary_missing",
            "Playwright is installed but its Chromium binary is unavailable; no browser actions were executed.",
          )
        : TwinBrowserReportSchema.parse({
            kind: "twin_browser",
            version: "1.0.0",
            status: "failed",
            evidence: "measured",
            artifactSha256,
            generatedAt: new Date().toISOString(),
            runner: "helix-twin-playwright",
            durationMs: Date.now() - startedAt,
            errorCode: "TWIN_BROWSER_LAUNCH_FAILED",
            detail: message,
          });
      const echo = binaryMissing
        ? browserNotRunReport(
            "echo_accessibility",
            artifactSha256,
            "browser_binary_missing",
            "Playwright is installed but Chromium is unavailable; no accessibility browser audit was executed.",
          )
        : browserFailedReport(
            "echo_accessibility",
            artifactSha256,
            Date.now() - startedAt,
            "ECHO_BROWSER_LAUNCH_FAILED",
            message,
          );
      const swift = binaryMissing
        ? browserNotRunReport(
            "swift_performance",
            artifactSha256,
            "browser_binary_missing",
            "Playwright is installed but Chromium is unavailable; no runtime performance metrics were collected.",
          )
        : browserFailedReport(
            "swift_performance",
            artifactSha256,
            Date.now() - startedAt,
            "SWIFT_BROWSER_LAUNCH_FAILED",
            message,
          );
      await Promise.all([
        writeReport(output, TwinBrowserReportSchema, report),
        writeReport(echoOutput, EchoAccessibilityReportSchema, echo),
        writeReport(swiftOutput, SwiftPerformanceReportSchema, swift),
      ]);
      process.stdout.write(
        `${JSON.stringify({ output, echoOutput, swiftOutput, status: report.status })}\n`,
      );
      process.exitCode = report.status === "failed" ? 1 : requireBrowser ? 2 : 0;
      return;
    }

    harness = await startTwinHarness(artifact.html);
    const results = [];
    for (const viewport of VIEWPORTS) {
      results.push(
        await exerciseViewport({
          browser,
          harness,
          viewport,
          screenshotsDirectory,
          sourceBytes,
        }),
      );
    }
    const actions = results.flatMap((result) => result.actions);
    const durationMs = Date.now() - startedAt;
    const browserName = `Chromium ${browser.version()}`;
    const report = TwinBrowserReportSchema.parse({
      kind: "twin_browser",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt: new Date().toISOString(),
      runner: "helix-twin-playwright",
      browser: browserName,
      durationMs,
      viewports: VIEWPORTS,
      actions,
      consoleErrors: results.flatMap((result) => result.consoleErrors),
      runtimeErrors: results.flatMap((result) => result.runtimeErrors),
      screenshots: results.map((result) => result.screenshotEvidence),
      summary: {
        controlsDiscovered: results.reduce(
          (total, result) => total + result.controlsDiscovered,
          0,
        ),
        controlsExercised: results.reduce(
          (total, result) => total + result.controlsExercised,
          0,
        ),
        changedActions: actions.filter((action) => action.changed).length,
        formsDiscovered: results.reduce(
          (total, result) => total + result.formsDiscovered,
          0,
        ),
        formsExercised: results.reduce(
          (total, result) => total + result.formsExercised,
          0,
        ),
        navigations: results.reduce(
          (total, result) => total + result.navigations,
          0,
        ),
        dialogs: results.reduce((total, result) => total + result.dialogs, 0),
        blockedExternalRequests: results.reduce(
          (total, result) => total + result.blockedExternalRequests,
          0,
        ),
      },
    });
    const accessibilityFindings = mergeAccessibilityResults(
      results.map((result) => result.accessibility),
    );
    const severityCount = (severity) =>
      accessibilityFindings
        .filter((finding) => finding.severity === severity)
        .reduce((total, finding) => total + finding.count, 0);
    const echo = EchoAccessibilityReportSchema.parse({
      kind: "echo_accessibility",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt: new Date().toISOString(),
      runner: "helix-browser-a11y",
      browser: browserName,
      durationMs,
      viewports: VIEWPORTS,
      passed: accessibilityFindings.length === 0,
      findings: accessibilityFindings,
      summary: {
        checksRun: results.reduce(
          (total, result) => total + result.accessibility.checksRun,
          0,
        ),
        high: severityCount("high"),
        medium: severityCount("medium"),
        low: severityCount("low"),
        focusableElements: results.reduce(
          (total, result) =>
            total + result.accessibility.focusableElements,
          0,
        ),
        keyboardTargetsReached: results.reduce(
          (total, result) =>
            total + result.accessibility.keyboardTargetsReached,
          0,
        ),
      },
      limitations: [
        "Browser-native Helix rules cover labels, computed contrast, Tab reachability, focus indication, landmarks, language, image alt text and ARIA roles; this is not the full axe rule catalog.",
        "Automated accessibility checks do not replace assistive-technology and human usability testing.",
      ],
    });
    const swift = SwiftPerformanceReportSchema.parse({
      kind: "swift_performance",
      version: "1.0.0",
      status: "completed",
      evidence: "measured",
      artifactSha256,
      generatedAt: new Date().toISOString(),
      runner: "helix-browser-performance",
      browser: browserName,
      durationMs,
      metrics: results.map((result) => result.performance),
      limitations: [
        "Synthetic local harness measurement; it is not a production-origin field measurement.",
        "INP is not reported because the bounded scripted session cannot provide representative field interaction latency.",
        "Browser timing APIs may return null or zero for unsupported entry types and srcdoc resources; missing values remain null instead of being estimated.",
      ],
    });
    await Promise.all([
      writeReport(output, TwinBrowserReportSchema, report),
      writeReport(echoOutput, EchoAccessibilityReportSchema, echo),
      writeReport(swiftOutput, SwiftPerformanceReportSchema, swift),
    ]);
    process.stdout.write(
      `${JSON.stringify({
        output,
        echoOutput,
        swiftOutput,
        status: report.status,
        actions: report.actions.length,
        screenshots: report.screenshots.map((shot) => basename(shot.path)),
      })}\n`,
    );
  } catch (error) {
    const detail = safeMessage(error);
    const durationMs = Date.now() - startedAt;
    const report = TwinBrowserReportSchema.parse({
      kind: "twin_browser",
      version: "1.0.0",
      status: "failed",
      evidence: "measured",
      artifactSha256,
      generatedAt: new Date().toISOString(),
      runner: "helix-twin-playwright",
      durationMs,
      errorCode: "TWIN_BROWSER_RUN_FAILED",
      detail,
    });
    const echo = browserFailedReport(
      "echo_accessibility",
      artifactSha256,
      durationMs,
      "ECHO_BROWSER_RUN_FAILED",
      detail,
    );
    const swift = browserFailedReport(
      "swift_performance",
      artifactSha256,
      durationMs,
      "SWIFT_BROWSER_RUN_FAILED",
      detail,
    );
    await Promise.all([
      writeReport(output, TwinBrowserReportSchema, report),
      writeReport(echoOutput, EchoAccessibilityReportSchema, echo),
      writeReport(swiftOutput, SwiftPerformanceReportSchema, swift),
    ]);
    process.stdout.write(
      `${JSON.stringify({ output, echoOutput, swiftOutput, status: report.status })}\n`,
    );
    process.exitCode = 1;
  } finally {
    await harness?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

await main();
