/**
 * Minimal but faithful parser/writer for Minecraft `server.properties`.
 *
 * Properties files are `key=value` lines. Lines beginning with `#` or `!`
 * are comments and are preserved verbatim. Unknown keys are preserved so a
 * round-trip never destroys configuration the manager does not model.
 */

export interface PropertiesDocument {
  /** Ordered key -> value pairs. */
  pairs: Array<{ key: string; value: string }>;
  /** Number of comment/blank lines before the next pair (for writing back). */
}

const KEY_VALUE = /^([^#!=\s][^=]*?)=(.*)$/;

export function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const m = KEY_VALUE.exec(raw);
    if (!m) continue;
    const key = m[1]!.trim();
    map.set(key, m[2]!.trim());
  }
  return map;
}

export function parsePropertiesDoc(text: string): { pairs: Array<{ key: string; value: string }> } {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = KEY_VALUE.exec(raw);
    if (!m) continue;
    pairs.push({ key: m[1]!.trim(), value: m[2]!.trim() });
  }
  return { pairs };
}

export function parseSingle(text: string, key: string): string | undefined {
  return parseProperties(text).get(key);
}

/**
 * Updates `key` in the document, preserving every other line (comments,
 * ordering, formatting) exactly as it was. Returns the new document text.
 */
export function setProperty(text: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => {
    const m = KEY_VALUE.exec(line);
    return m !== null && m[1]!.trim() === key;
  });

  const line = `${key}=${value}`;
  if (keyIndex === -1) {
    const out = lines.filter((l, i) => !(l === "" && i === lines.length - 1));
    return [...out, line].join("\n");
  }
  lines[keyIndex] = line;
  return lines.join("\n");
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true";
}

export function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : undefined;
}