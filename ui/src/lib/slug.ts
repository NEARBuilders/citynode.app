export function generateSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveSlug(name: string, currentSlug: string, manuallyEdited: boolean) {
  return manuallyEdited ? currentSlug : generateSlug(name);
}
