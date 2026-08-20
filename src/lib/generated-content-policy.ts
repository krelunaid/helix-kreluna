const POLICY_MARKER = "data-helix-generated-policy";

export const GENERATED_APP_SANDBOX = "allow-scripts allow-forms";

export type GeneratedContentNetworkAllowlist = {
  images?: readonly string[];
  styles?: readonly string[];
  fonts?: readonly string[];
  media?: readonly string[];
  connections?: readonly string[];
};

/**
 * Generated artifacts are offline by default. A reviewed caller may still pass
 * an explicit HTTPS-origin allowlist, but no third-party host is trusted merely
 * because it was used by an earlier demo.
 */
export const STANDARD_GENERATED_CONTENT_ALLOWLIST: GeneratedContentNetworkAllowlist = {};

function allowedHttpsOrigins(values: readonly string[] | undefined): string[] {
  if (!values?.length) return [];
  const origins = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.username === "" && url.password === "") {
        origins.add(url.origin);
      }
    } catch {
      // Invalid entries are denied instead of weakening the policy.
    }
  }
  return [...origins].sort();
}

function sources(fixed: readonly string[], origins: readonly string[]): string {
  const values = [...fixed, ...origins];
  return values.length ? values.join(" ") : "'none'";
}

/**
 * Default network policy for generated documents. Network access stays denied
 * unless a caller supplies an explicit HTTPS-origin allowlist.
 *
 * Inline scripts/styles remain necessary for today's single-file prototype
 * artifacts. They still run in an opaque-origin sandbox without storage,
 * popups, top-navigation, downloads, modals, or same-origin privileges.
 */
export function buildGeneratedContentCsp(
  allowlist: GeneratedContentNetworkAllowlist = STANDARD_GENERATED_CONTENT_ALLOWLIST,
): string {
  const images = allowedHttpsOrigins(allowlist.images);
  const styles = allowedHttpsOrigins(allowlist.styles);
  const fonts = allowedHttpsOrigins(allowlist.fonts);
  const media = allowedHttpsOrigins(allowlist.media);
  const connections = allowedHttpsOrigins(allowlist.connections);
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    `style-src ${sources(["'self'", "'unsafe-inline'"], styles)}`,
    `img-src ${sources(["'self'", "data:", "blob:"], images)}`,
    `font-src ${sources(["'self'", "data:"], fonts)}`,
    `media-src ${sources(["'self'", "data:", "blob:"], media)}`,
    `connect-src ${sources([], connections)}`,
    "manifest-src data:",
    "worker-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

function removePolicyControlledTags(html: string, noIndex: boolean): string {
  // Unwrap a document previously produced by this function before rebuilding
  // it. The canonical policy is still re-injected, so a forged marker cannot
  // bypass enforcement.
  const canonical = html.includes(POLICY_MARKER)
    ? html.match(
        /^\s*<!doctype html><html><head>[\s\S]*?data-helix-generated-policy[\s\S]*?<\/head><body>([\s\S]*)<\/body><\/html>\s*$/i,
      )?.[1] ?? html
    : html;
  let output = canonical.replace(
    new RegExp(`<meta\\b[^>]*${POLICY_MARKER}[^>]*>`, "gi"),
    "",
  );
  // A refresh can navigate the opaque frame away from the protected srcdoc.
  output = output.replace(
    /<meta\b(?=[^>]*http-equiv\s*=\s*["']?\s*refresh\b)[^>]*>/gi,
    "",
  );
  output = output.replace(
    /<meta\b(?=[^>]*name\s*=\s*["']?\s*referrer\b)[^>]*>/gi,
    "",
  );
  output = output.replace(
    /<link\b(?=[^>]*rel\s*=\s*["']?\s*preconnect\b)[^>]*>/gi,
    "",
  );
  if (noIndex) {
    output = output.replace(
      /<meta\b(?=[^>]*name\s*=\s*["']?\s*robots\b)[^>]*>/gi,
      "",
    );
  }
  return output;
}

export function protectGeneratedHtml(
  html: string,
  options: {
    noIndex?: boolean;
    allowlist?: GeneratedContentNetworkAllowlist;
  } = {},
): string {
  const noIndex = Boolean(options.noIndex);
  const clean = removePolicyControlledTags(html, noIndex);
  const csp = buildGeneratedContentCsp(
    options.allowlist ?? STANDARD_GENERATED_CONTENT_ALLOWLIST,
  );
  const tags = [
    `<meta http-equiv="Content-Security-Policy" ${POLICY_MARKER}="v1" content="${csp}">`,
    ...(noIndex
      ? [
          '<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" data-helix-generated-robots="v1">',
        ]
      : []),
    '<meta name="referrer" content="no-referrer">',
  ].join("\n");

  // Always create the outer document ourselves. Merely inserting into an
  // attacker-provided <head> is insufficient: executable markup can legally
  // appear before that tag and would run before a meta CSP takes effect. By
  // making the protected head the first parsed markup, every original byte is
  // parsed only after the policy is active. Nested document tags in `clean`
  // are ignored by the HTML parser while their contents remain rendered.
  return `<!doctype html><html><head>${tags}</head><body>${clean}</body></html>`;
}
