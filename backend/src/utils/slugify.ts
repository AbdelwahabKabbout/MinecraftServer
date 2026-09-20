/** Converts a display name into a filesystem/URL-friendly slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Given a base slug, returns the next unique slug by appending -2, -3, ... */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  let candidate = `${base}-${n}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}