import { buildGeneratedContentCsp, protectGeneratedHtml } from "@/lib/generated-content-policy";
import { sha256Hex } from "@/lib/server/agents/patch";
import {
  AegisReportSchema,
  type AegisReport,
  type QualityFinding,
} from "@/lib/server/quality/types";

const CHECK_IDS = [
  "secret_scan",
  "unsafe_dom",
  "remote_code",
  "network_policy",
  "storage_boundary",
  "transport_security",
  "form_action",
  "generated_csp",
] as const;

type CheckId = (typeof CHECK_IDS)[number];

export class AegisReleaseBlockedError extends Error {
  readonly code = "AEGIS_RELEASE_BLOCKED";
  readonly retryable = false;

  constructor() {
    super("AEGIS_RELEASE_BLOCKED");
    this.name = "AegisReleaseBlockedError";
  }
}

export function assertAegisReleasePassed(
  report: AegisReport,
  artifactSha256: string,
): void {
  const valid = AegisReportSchema.safeParse(report);
  if (
    !valid.success ||
    valid.data.artifactSha256 !== artifactSha256 ||
    !valid.data.passed ||
    valid.data.blockerCount !== 0 ||
    valid.data.findings.some((finding) => finding.severity === "blocker")
  ) {
    throw new AegisReleaseBlockedError();
  }
}

function lineAt(source: string, index: number): number {
  return source.slice(0, Math.max(0, index)).split("\n").length;
}

function redactedFinding(input: {
  findings: QualityFinding[];
  source: string;
  index: number;
  checkId: CheckId;
  id: string;
  severity: QualityFinding["severity"];
  category: string;
  message: string;
  evidence: string;
}) {
  const duplicate = input.findings.some(
    (finding) => finding.id === input.id && finding.line === lineAt(input.source, input.index),
  );
  if (duplicate) return;
  input.findings.push({
    id: input.id,
    checkId: input.checkId,
    severity: input.severity,
    category: input.category,
    message: input.message,
    evidence: input.evidence,
    line: lineAt(input.source, input.index),
  });
}

function scanMatches(
  source: string,
  expression: RegExp,
  visit: (match: RegExpExecArray) => void,
) {
  expression.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) visit(match);
}

function readLiteralString(expression: string): string | null {
  const input = expression.trim();
  const quote = input[0];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  for (let index = 1; index < input.length; index += 1) {
    const character = input[index];
    if (character === "\\") {
      const next = input[index + 1];
      if (next === undefined) return null;
      value += `${character}${next}`;
      index += 1;
      continue;
    }
    if (character === quote) {
      return /^[\s)]*$/.test(input.slice(index + 1)) ? value : null;
    }
    value += character;
  }
  return null;
}

function isLocalPrototypeUrlExpression(expression: string): boolean {
  const input = expression.trim();
  if (/^(?:URL\s*\.\s*)?createObjectURL\s*\(/i.test(input)) return true;
  if (/^[\w$.[\]]+\s*\.\s*toDataURL\s*\(/i.test(input)) return true;

  const literal = readLiteralString(input);
  if (literal === null) return false;
  // Escape-encoded schemes are treated as dynamic rather than decoded by a
  // regex scanner. This fails closed on obfuscated external destinations.
  if (/\\(?:x[\da-f]{2}|u[\da-f]{4}|u\{[\da-f]+\})/i.test(literal)) return false;
  const value = literal.replace(/\\\//g, "/").trim();
  if (!value || value.startsWith("#")) return true;
  if (/^(?:data|blob):/i.test(value)) return true;
  if (/(?:^|[\s,(])(?:https?:)?\/\//i.test(value)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return false;
  return true;
}

function scanSecrets(source: string, findings: QualityFinding[]) {
  const patterns: Array<{ id: string; expression: RegExp; evidence: string }> = [
    {
      id: "private_key_material",
      expression: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g,
      evidence: "private-key PEM marker (value redacted)",
    },
    {
      id: "provider_credential",
      expression: /(?:sk|rk)_live_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{24,}|xai-[A-Za-z0-9_-]{16,}/g,
      evidence: "provider credential prefix (value redacted)",
    },
    {
      id: "assigned_secret_literal",
      expression: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][^"'\r\n]{16,}["']/gi,
      evidence: "secret-named literal assignment (value redacted)",
    },
  ];
  for (const pattern of patterns) {
    scanMatches(source, pattern.expression, (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "secret_scan",
        id: pattern.id,
        severity: "blocker",
        category: "secret",
        message: "Credential-like material is embedded in the generated artifact.",
        evidence: pattern.evidence,
      }),
    );
  }
}

function scanUnsafeDom(source: string, findings: QualityFinding[]) {
  const executableSinks = [
    { id: "eval", expression: /\beval\s*\(/gi, evidence: "eval(...)" },
    { id: "new_function", expression: /\bnew\s+Function\s*\(/g, evidence: "new Function(...)" },
    { id: "document_write", expression: /\bdocument\.write(?:ln)?\s*\(/gi, evidence: "document.write(...)" },
  ];
  for (const sink of executableSinks) {
    scanMatches(source, sink.expression, (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "unsafe_dom",
        id: sink.id,
        severity: "blocker",
        category: "code_execution",
        message: "Dynamic code or parser execution is forbidden in generated apps.",
        evidence: sink.evidence,
      }),
    );
  }

  const taint = /\.value\b|\blocation\.|URLSearchParams|document\.cookie|(?:event|message)\.data|response\.(?:text|json)|await\s+fetch/i;
  scanMatches(
    source,
    /(?:(?:\.\s*(?:innerHTML|outerHTML))|(?:\[\s*["'`](?:innerHTML|outerHTML)["'`]\s*\]))\s*=\s*([^;\n]{1,700})/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "unsafe_dom",
        id: taint.test(match[1]) ? "tainted_html_assignment" : "html_assignment",
        severity: taint.test(match[1]) ? "blocker" : "medium",
        category: "xss",
        message: taint.test(match[1])
          ? "User, URL, cookie or network-derived data reaches an HTML parser sink."
          : "HTML parser assignment requires manual XSS review; no tainted source was detected.",
        evidence: taint.test(match[1])
          ? "tainted value → innerHTML/outerHTML (payload redacted)"
          : "innerHTML/outerHTML assignment",
      }),
  );
  scanMatches(
    source,
    /\.insertAdjacentHTML\s*\([^,]+,\s*([^)]{1,700})\)/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "unsafe_dom",
        id: taint.test(match[1]) ? "tainted_adjacent_html" : "adjacent_html",
        severity: taint.test(match[1]) ? "blocker" : "medium",
        category: "xss",
        message: taint.test(match[1])
          ? "Untrusted data reaches insertAdjacentHTML."
          : "insertAdjacentHTML requires manual XSS review.",
        evidence: taint.test(match[1])
          ? "tainted value → insertAdjacentHTML (payload redacted)"
          : "insertAdjacentHTML call",
      }),
  );
  scanMatches(source, /javascript\s*:/gi, (match) =>
    redactedFinding({
      findings,
      source,
      index: match.index,
      checkId: "unsafe_dom",
      id: "javascript_url",
      severity: "blocker",
      category: "xss",
      message: "javascript: URLs are forbidden.",
      evidence: "javascript: URL",
    }),
  );
}

function scanRemoteCapabilities(source: string, findings: QualityFinding[]) {
  scanMatches(
    source,
    /<(?:script|iframe|object|embed)\b[^>]*(?:src|data)\s*=\s*["']?\s*(?:https?:)?\/\//gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "remote_code",
        id: "remote_executable_content",
        severity: "blocker",
        category: "supply_chain",
        message: "Remote executable or framed content is forbidden in generated apps.",
        evidence: "remote script/frame/object URL (origin redacted)",
      }),
  );
  scanMatches(
    source,
    /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|WebTransport|RTCPeerConnection|webkitRTCPeerConnection|Worker|SharedWorker)\s*\(|\b(?:navigator\s*(?:\.\s*sendBeacon|\[\s*["'`]sendBeacon["'`]\s*\])|sendBeacon)\s*\(/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "unapproved_connection",
        severity: "blocker",
        category: "network",
        message: "Generated previews deny direct connection, beacon, transport and peer APIs.",
        evidence: "network-capable browser API call (arguments redacted)",
      }),
  );
  scanMatches(source, /\b(?:new\s+)?(?:Image|Audio)\s*\(/g, (match) =>
    redactedFinding({
      findings,
      source,
      index: match.index,
      checkId: "network_policy",
      id: "dynamic_network_asset",
      severity: "blocker",
      category: "network",
      message: "Dynamic image or media constructors can bypass static asset review.",
      evidence: "dynamic Image/Audio constructor",
    }),
  );
  scanMatches(
    source,
    /\b(?:document\s*\.\s*)?createElement\s*\(\s*["'`](?:img|script|link|iframe|object|embed|video|audio|source|track)["'`]|\b(?:document\s*\.\s*)?createElementNS\s*\(\s*[^,\n]{1,300},\s*["'`](?:img|script|link|iframe|object|embed|video|audio|source|track)["'`]/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "dynamic_network_element",
        severity: "blocker",
        category: "network",
        message: "Runtime creation of network-bearing elements requires semantic review and is denied.",
        evidence: "dynamic network-bearing element",
      }),
  );
  scanMatches(
    source,
    /(?:(?:\.\s*(src|srcset|poster|href))|(?:\[\s*["'`](src|srcset|poster|href)["'`]\s*\]))\s*=\s*("(?:\\.|[^"\\\r\n]){0,700}"|'(?:\\.|[^'\\\r\n]){0,700}'|[^;\n}]{1,700})/gi,
    (match) => {
      if (isLocalPrototypeUrlExpression(match[3])) return;
      const property = (match[1] ?? match[2]).toLowerCase();
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: property === "href" ? "dynamic_or_external_href" : "dynamic_network_asset",
        severity: "blocker",
        category: property === "href" ? "navigation" : "network",
        message:
          property === "href"
            ? "Dynamic or external href assignment is forbidden in offline previews."
            : "Dynamic or external asset assignment is forbidden in offline previews.",
        evidence: `${property} assignment (target redacted)`,
      });
    },
  );
  scanMatches(
    source,
    /\.\s*setAttribute\s*\(\s*["'`](src|srcset|poster|href)["'`]\s*,\s*("(?:\\.|[^"\\\r\n]){0,700}"|'(?:\\.|[^'\\\r\n]){0,700}'|[^\n)]{1,700})\)/gi,
    (match) => {
      if (isLocalPrototypeUrlExpression(match[2])) return;
      const property = match[1].toLowerCase();
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: property === "href" ? "dynamic_or_external_href" : "dynamic_network_asset",
        severity: "blocker",
        category: property === "href" ? "navigation" : "network",
        message: "Dynamic or external URL-bearing attributes are forbidden in offline previews.",
        evidence: `setAttribute(${property}, ...) target redacted`,
      });
    },
  );
  scanMatches(
    source,
    /(?:(?:\.\s*(?:backgroundImage|background|listStyleImage))|(?:\[\s*["'`](?:backgroundImage|background|listStyleImage)["'`]\s*\]))\s*=\s*("(?:\\.|[^"\\\r\n]){0,700}"|'(?:\\.|[^'\\\r\n]){0,700}'|[^;\n}]{1,700})/gi,
    (match) => {
      if (isLocalPrototypeUrlExpression(match[1])) return;
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "dynamic_css_asset",
        severity: "blocker",
        category: "network",
        message: "Dynamic CSS asset construction is forbidden in offline previews.",
        evidence: "dynamic CSS asset expression (target redacted)",
      });
    },
  );
  scanMatches(
    source,
    /<(?:img|link|audio|video|source|track)\b[^>]*\b(?:src|href|poster)\s*=\s*["']?\s*(?:https?:)?\/\//gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "remote_static_asset",
        severity: "blocker",
        category: "network",
        message: "Remote image, stylesheet, font or media assets are forbidden by default.",
        evidence: "remote static asset URL (origin redacted)",
      }),
  );
  scanMatches(
    source,
    /<(?:img|source)\b[^>]*\bsrcset\s*=\s*(?:"[^"]*(?:https?:)?\/\/|'[^']*(?:https?:)?\/\/|[^\s>]*(?:https?:)?\/\/)/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "remote_static_asset",
        severity: "blocker",
        category: "network",
        message: "Remote responsive image candidates are forbidden by default.",
        evidence: "remote srcset candidate (origin redacted)",
      }),
  );
  scanMatches(
    source,
    /(?:@import\s+(?:url\(\s*)?["']?\s*|url\(\s*["']?\s*)(?:https?:)?\/\//gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "remote_css_asset",
        severity: "blocker",
        category: "network",
        message: "Remote CSS imports and url() assets are forbidden by default.",
        evidence: "remote CSS URL (origin redacted)",
      }),
  );
  scanMatches(
    source,
    /<(?:a|area|base)\b[^>]*\bhref\s*=\s*["']?\s*(?:(?:https?:)?\/\/|mailto:|tel:)/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "external_navigation",
        severity: "blocker",
        category: "navigation",
        message: "External hyperlink navigation is forbidden in offline previews.",
        evidence: "external href (destination redacted)",
      }),
  );
  scanMatches(
    source,
    /<meta\b(?=[^>]*http-equiv\s*=\s*["']?\s*refresh\b)[^>]*(?:(?:https?:)?\/\/|mailto:|tel:)[^>]*>/gi,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "external_navigation",
        severity: "blocker",
        category: "navigation",
        message: "External meta-refresh navigation is forbidden.",
        evidence: "external meta refresh (destination redacted)",
      }),
  );
  scanMatches(
    source,
    /(?:\b(?:window|document|top|parent|self)\s*(?:\.\s*location|\[\s*["'`]location["'`]\s*\])|(?:^|[^\w$.])location)\s*=\s*("(?:\\.|[^"\\\r\n]){0,700}"|'(?:\\.|[^'\\\r\n]){0,700}'|[^;\n}]{1,700})/gim,
    (match) => {
      if (isLocalPrototypeUrlExpression(match[1])) return;
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "dynamic_or_external_navigation",
        severity: "blocker",
        category: "navigation",
        message: "Dynamic or external location assignment is forbidden in offline previews.",
        evidence: "location assignment (destination redacted)",
      });
    },
  );
  scanMatches(
    source,
    /(?:\b(?:window|document|top|parent|self)\s*(?:\.\s*location|\[\s*["'`]location["'`]\s*\])|\blocation)\s*(?:\.\s*(?:assign|replace)|\[\s*["'`](?:assign|replace)["'`]\s*\])\s*\(\s*("(?:\\.|[^"\\\r\n]){0,700}"|'(?:\\.|[^'\\\r\n]){0,700}'|[^\n)]{1,700})\)/gi,
    (match) => {
      if (isLocalPrototypeUrlExpression(match[1])) return;
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "dynamic_or_external_navigation",
        severity: "blocker",
        category: "navigation",
        message: "Dynamic or external location navigation is forbidden in offline previews.",
        evidence: "location navigation call (destination redacted)",
      });
    },
  );
  scanMatches(
    source,
    /(?:\bwindow\s*(?:\.\s*open|\[\s*["'`]open["'`]\s*\])|(?:^|[^\w$.])open)\s*\(/gim,
    (match) =>
      redactedFinding({
        findings,
        source,
        index: match.index,
        checkId: "network_policy",
        id: "popup_navigation",
        severity: "blocker",
        category: "navigation",
        message: "window.open/global open is forbidden in generated previews.",
        evidence: "popup/navigation call (destination redacted)",
      }),
  );
  scanMatches(source, /<form\b[^>]*action\s*=\s*["']?\s*(?:(?:https?:)?\/\/|mailto:)/gi, (match) =>
    redactedFinding({
      findings,
      source,
      index: match.index,
      checkId: "form_action",
      id: "external_form_action",
      severity: "blocker",
      category: "data_exfiltration",
      message: "External form submission is forbidden by the generated-app policy.",
      evidence: "external form action (origin redacted)",
    }),
  );
}

function scanStorageAndTransport(source: string, findings: QualityFinding[]) {
  scanMatches(source, /\b(?:localStorage|sessionStorage|document\.cookie)\b/g, (match) =>
    redactedFinding({
      findings,
      source,
      index: match.index,
      checkId: "storage_boundary",
      id: "sandbox_storage_api",
      severity: "blocker",
      category: "sandbox",
      message: "Opaque-origin previews cannot rely on browser storage or cookies.",
      evidence: match[0],
    }),
  );
  scanMatches(source, /http:\/\/(?!localhost\b|127\.0\.0\.1\b|\[::1\]\b)/gi, (match) =>
    redactedFinding({
      findings,
      source,
      index: match.index,
      checkId: "transport_security",
      id: "insecure_transport",
      severity: "blocker",
      category: "transport",
      message: "Non-loopback HTTP resources are forbidden.",
      evidence: "http:// external origin (origin redacted)",
    }),
  );
}

function validateGeneratedCsp(source: string, findings: QualityFinding[]) {
  const protectedHtml = protectGeneratedHtml(source, { noIndex: true });
  const policy = buildGeneratedContentCsp();
  const required = [
    "default-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ];
  const markerIndex = protectedHtml.indexOf("data-helix-generated-policy");
  const originalIndex = protectedHtml.indexOf(source.slice(0, Math.min(80, source.length)));
  const invalid =
    markerIndex < 0 ||
    (originalIndex >= 0 && markerIndex > originalIndex) ||
    required.some((directive) => !policy.includes(directive)) ||
    /https?:\/\//i.test(policy);
  if (invalid) {
    redactedFinding({
      findings,
      source,
      index: 0,
      checkId: "generated_csp",
      id: "generated_csp_invalid",
      severity: "blocker",
      category: "csp",
      message: "The canonical generated-app CSP is missing or is parsed after executable content.",
      evidence: "canonical CSP validation failed",
    });
  }
}

export async function runAegisStaticScan(html: string): Promise<AegisReport> {
  const findings: QualityFinding[] = [];
  scanSecrets(html, findings);
  scanUnsafeDom(html, findings);
  scanRemoteCapabilities(html, findings);
  scanStorageAndTransport(html, findings);
  validateGeneratedCsp(html, findings);

  const checks = CHECK_IDS.map((id) => {
    const findingCount = findings.filter((finding) => finding.checkId === id).length;
    return { id, status: findingCount ? ("failed" as const) : ("passed" as const), findingCount };
  });
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  return AegisReportSchema.parse({
    kind: "aegis_static_security",
    scanner: "helix-aegis",
    version: "1.0.0",
    evidence: "measured",
    measuredAt: new Date().toISOString(),
    artifactSha256: await sha256Hex(html),
    passed: blockerCount === 0,
    blockerCount,
    checks,
    findings,
    scope: [
      "credential-like literals",
      "direct dynamic code and dot/bracket HTML parser sink patterns",
      "direct browser connection, beacon, transport and peer API patterns",
      "static remote code, image, stylesheet, font and media URL patterns",
      "dynamic URL-bearing assets and external navigation patterns",
      "sandbox storage/cookie usage",
      "transport and external form actions",
      "offline-by-default generated-app CSP ordering and directives",
    ],
    limitations: [
      "Pattern-based static artifact scan, not a semantic HTML/JavaScript/CSS parser or complete data-flow analysis; aliases, computed properties, encodings and obfuscation can evade it.",
      "No browser runtime, dependency audit, authz probe, SQL trace, SAST engine or penetration test was executed by this scan.",
      "Untainted HTML assignments are reported for manual review but are not automatic blockers.",
      "A passing report covers only this exact artifact hash and the checks listed in scope; it is not a claim of complete application security.",
    ],
  });
}
