const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toSlug(value: string, fallback: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function isSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

export function getAvailableSlug({
  fallback,
  source,
  usedSlugs,
}: {
  fallback: string;
  source: string;
  usedSlugs: Iterable<string>;
}) {
  const baseSlug = toSlug(source, fallback);
  const used = new Set(usedSlugs);

  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;

  while (true) {
    const candidate = `${baseSlug}-${suffix}`;

    if (!used.has(candidate)) {
      return candidate;
    }

    suffix += 1;
  }
}
