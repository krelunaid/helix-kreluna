export const MIN_HTML_ARTIFACT_LENGTH = 400;

export function isValidHtmlArtifact(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_HTML_ARTIFACT_LENGTH &&
    /<html\b/i.test(value) &&
    /<\/html>/i.test(value)
  );
}

export function extractHtml(text: string): string | null {
  if (!text) return null;
  const fence = text.match(/```html\s*([\s\S]*?)```/i);
  if (fence?.[1] && /<html/i.test(fence[1])) return closeHtml(fence[1].trim());
  const document = text.match(/<!DOCTYPE html[\s\S]*/i);
  if (document) return closeHtml(document[0].trim());
  const html = text.match(/<html[\s\S]*/i);
  if (html) return closeHtml(html[0].trim());
  return null;
}

function closeHtml(html: string): string {
  let output = html;
  if (!/<\/body>/i.test(output)) output += "\n</body>";
  if (!/<\/html>/i.test(output)) output += "\n</html>";
  return output;
}
