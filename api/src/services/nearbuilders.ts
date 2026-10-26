import { Effect } from "effect";
import { z } from "zod";

export const NEARBUILDERS_PREVIEW_LIMIT = 6;
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_DEPTH = 10;

const builderSchema = z.object({
  nearAccount: z.string().min(1),
  name: z.string().nullable().optional(),
  cityNode: z.string().nullable().optional(),
  withdrawnAt: z.string().nullable().optional(),
});
const projectSchema = z.object({
  kind: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  visibility: z.string().optional(),
  cityNode: z.string().nullable().optional(),
});
const pageSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({ total: z.number().int().nonnegative() }).optional(),
});

export interface CommunityBuilder {
  nearAccount: string;
  name: string | null;
  url: string;
}

export interface CommunityProject {
  title: string;
  description: string | null;
  logoUrl: string | null;
  url: string;
}

export interface CommunityBuilders {
  path: string;
  baseUrl: string;
  status: "ok" | "unavailable";
  builders: { items: CommunityBuilder[]; total: number; url: string };
  projects: { items: CommunityProject[]; total: number; url: string };
}

export function normalizeBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.origin;
  } catch {
    return "https://nearbuilders.org";
  }
}

export function communityPath<E>(
  nodeId: string,
  getNode: (id: string) => Effect.Effect<{ slug: string; parentId: string | null } | null, E>,
) {
  return Effect.gen(function* () {
    const slugs: string[] = [];
    const seen = new Set<string>();
    let current: string | null = nodeId;
    while (current && !seen.has(current) && slugs.length < MAX_DEPTH) {
      seen.add(current);
      const node: { slug: string; parentId: string | null } | null = yield* getNode(current);
      if (!node) break;
      slugs.push(node.slug.toLowerCase());
      current = node.parentId;
    }
    return slugs.length === 0 ? null : slugs.reverse().join("/");
  });
}

function httpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function matchedPage<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  matches: (item: T) => boolean,
): { items: T[]; total: number } {
  const page = pageSchema.parse(raw);
  const items = page.data.flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success && matches(parsed.data) ? [parsed.data] : [];
  });
  const filteredByServer = items.length === page.data.length;
  const total = filteredByServer ? Math.max(page.meta?.total ?? 0, items.length) : items.length;
  return { items, total };
}

export function createNearbuilders(baseUrlInput: string) {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const cache = new Map<string, { expiresAt: number; value: CommunityBuilders }>();

  async function request(path: string, params: Record<string, string>) {
    const url = new URL(`/api${path}`, baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`nearbuilders.org responded with HTTP ${response.status}`);
    return response.json();
  }

  function empty(path: string, status: CommunityBuilders["status"]): CommunityBuilders {
    return {
      path,
      baseUrl,
      status,
      builders: { items: [], total: 0, url: `${baseUrl}/builders` },
      projects: { items: [], total: 0, url: `${baseUrl}/projects` },
    };
  }

  async function load(path: string): Promise<CommunityBuilders> {
    const [builderPage, projectPage] = await Promise.all([
      request("/v1/builders", { cityNode: path }),
      request("/v1/projects", { cityNode: path, visibility: "public", limit: "24" }),
    ]);
    const builders = matchedPage(
      builderPage,
      builderSchema,
      (builder) => builder.cityNode === path && !builder.withdrawnAt,
    );
    const projects = matchedPage(
      projectPage,
      projectSchema,
      (project) =>
        project.cityNode === path && (!project.visibility || project.visibility === "public"),
    );
    const result = empty(path, "ok");
    return {
      ...result,
      builders: {
        ...result.builders,
        total: builders.total,
        items: builders.items.slice(0, NEARBUILDERS_PREVIEW_LIMIT).map((builder) => ({
          nearAccount: builder.nearAccount,
          name: builder.name?.trim() || null,
          url: `${baseUrl}/builders/${encodeURIComponent(builder.nearAccount)}`,
        })),
      },
      projects: {
        ...result.projects,
        total: projects.total,
        items: projects.items.slice(0, NEARBUILDERS_PREVIEW_LIMIT).map((project) => ({
          title: project.title,
          description: project.description?.trim() || null,
          logoUrl: httpUrl(project.logoUrl),
          url: `${baseUrl}/projects/${encodeURIComponent(project.kind)}/${encodeURIComponent(project.slug)}`,
        })),
      },
    };
  }

  return {
    baseUrl,
    forPath: async (path: string): Promise<CommunityBuilders> => {
      const cached = cache.get(path);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      try {
        const value = await load(path);
        cache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, value });
        return value;
      } catch {
        return cached?.value ?? empty(path, "unavailable");
      }
    },
  };
}
