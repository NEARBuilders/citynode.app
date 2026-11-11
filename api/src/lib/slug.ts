// Catalog slug rules: unicode-safe lowercase, diacritics stripped, runs of
// non-alphanumerics collapse to single dashes. Shared by the seed (catalog
// slugs) and consumers that resolve a human location to a catalog slug.
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
