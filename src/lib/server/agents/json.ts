export function parseAgentJson<T>(text: string): T | null {
  if (!text) return null;
  const raw = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
