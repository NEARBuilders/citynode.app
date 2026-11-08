import { APP_LOCALES, type AppLocale, DEFAULT_APP_LOCALE } from "@/i18n/catalogs";

export const RESERVED_GUIDE_SLUGS = ["build"] as const;

export type GuideSummary = {
  slug: string;
  title: string;
};

export type GuideDocument = GuideSummary & {
  description: string;
  body: string;
};

function asGuideFiles(files: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function loadBundledGuideFiles(): Record<string, string> {
  try {
    return asGuideFiles(
      import.meta.glob("../content/docs/*.md", {
        eager: true,
        query: "?raw",
        import: "default",
      }),
    );
  } catch {
    return {};
  }
}

let bundledGuideFiles: Record<string, string> | undefined;

function getBundledGuideFiles(): Record<string, string> {
  bundledGuideFiles ??= loadBundledGuideFiles();
  return bundledGuideFiles;
}

const localeSet = new Set<string>(APP_LOCALES);
const reservedSlugs = new Set<string>(RESERVED_GUIDE_SLUGS);

export function parseGuideFilename(filename: string): { slug: string; locale: AppLocale } | null {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z]+))?\.md$/.exec(base);
  if (!match) return null;
  const locale = match[2];
  if (locale && !localeSet.has(locale)) return null;
  return { slug: match[1], locale: locale ? (locale as AppLocale) : DEFAULT_APP_LOCALE };
}

export function collidingGuideSlugs(filenames: string[]): string[] {
  return [
    ...new Set(
      filenames.flatMap((filename) => {
        const parsed = parseGuideFilename(filename);
        return parsed && reservedSlugs.has(parsed.slug) ? [parsed.slug] : [];
      }),
    ),
  ];
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = /^\s*#\s+(.+)$/m.exec(markdown);
  const title = match?.[1]?.trim();
  return title || fallback;
}

function descriptionFromMarkdown(markdown: string, fallback: string): string {
  for (const line of markdown.split("\n")) {
    const text = line.trim();
    if (!text || text.startsWith("#") || text.startsWith("```") || text.startsWith(">")) continue;
    if (/^[-*+]\s/.test(text) || /^\d+\.\s/.test(text)) continue;
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 200);
  }
  return fallback;
}

function stripLeadingHeading(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]+\n*/, "").trimStart();
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function filesBySlug(files: Record<string, string>) {
  const grouped = new Map<string, Partial<Record<AppLocale, string>>>();
  for (const [path, markdown] of Object.entries(files)) {
    const parsed = parseGuideFilename(path);
    if (!parsed || typeof markdown !== "string") continue;
    const locales = grouped.get(parsed.slug) ?? {};
    if (parsed.locale === DEFAULT_APP_LOCALE) {
      if (!locales.en || !path.endsWith(".en.md")) locales.en = markdown;
    } else {
      locales[parsed.locale] = markdown;
    }
    grouped.set(parsed.slug, locales);
  }
  return grouped;
}

function documentFromMarkdown(slug: string, markdown: string): GuideDocument {
  const fallback = humanizeSlug(slug);
  const title = titleFromMarkdown(markdown, fallback);
  return {
    slug,
    title,
    description: descriptionFromMarkdown(markdown, title),
    body: stripLeadingHeading(markdown),
  };
}

function guidesFromFiles(
  files: Record<string, string>,
  locale: AppLocale = DEFAULT_APP_LOCALE,
): GuideSummary[] {
  return [...filesBySlug(files).entries()]
    .flatMap(([slug, locales]) => {
      if (reservedSlugs.has(slug) || !locales.en) return [];
      const guide = documentFromMarkdown(slug, locales[locale] ?? locales.en);
      return [{ slug: guide.slug, title: guide.title }];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

export function resolveGuide(
  slug: string,
  locale: AppLocale = DEFAULT_APP_LOCALE,
  files: Record<string, string> = getBundledGuideFiles(),
): GuideDocument | null {
  if (reservedSlugs.has(slug)) return null;
  const locales = filesBySlug(files).get(slug);
  const markdown = locales?.[locale] ?? locales?.en;
  if (!markdown) return null;
  return documentFromMarkdown(slug, markdown);
}

export function listGuides(
  locale: AppLocale = DEFAULT_APP_LOCALE,
  files: Record<string, string> = getBundledGuideFiles(),
): GuideSummary[] {
  return guidesFromFiles(files, locale);
}
