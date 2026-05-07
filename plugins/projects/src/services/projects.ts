import { and, count, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import { projectApps, projects } from "../db/schema";

function toIsoString(value: Date | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.toISOString();
}

export interface Project {
  id: string;
  ownerId: string;
  organizationId: string | null;
  slug: string;
  title: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  visibility: "private" | "unlisted" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  apps: ProjectApp[];
}

export interface ProjectApp {
  id: string;
  projectId: string;
  accountId: string;
  gatewayId: string;
  position: number;
  createdByUserId: string;
  createdAt: string;
}

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateProjectAppId(): string {
  return `pa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class ProjectService extends Context.Tag("projects/ProjectService")<
  ProjectService,
  {
    listProjects: (
      input: {
        organizationId?: string;
        ownerId?: string;
        visibility?: "private" | "unlisted" | "public";
        status?: "active" | "paused" | "archived";
        limit?: number;
      },
      userId?: string,
    ) => Effect.Effect<
      {
        data: Project[];
        meta: { total: number; hasMore: boolean; nextCursor: string | null };
      },
      ORPCError<string, unknown>
    >;

    getProject: (
      id: string,
      userId?: string,
    ) => Effect.Effect<ProjectDetail | null, ORPCError<string, unknown>>;

    createProject: (
      input: {
        title: string;
        slug: string;
        description?: string;
        visibility?: "private" | "unlisted" | "public";
        organizationId?: string;
      },
      userId: string,
    ) => Effect.Effect<Project, ORPCError<string, unknown>>;

    updateProject: (
      id: string,
      input: {
        title?: string;
        description?: string;
        status?: "active" | "paused" | "archived";
        visibility?: "private" | "unlisted" | "public";
      },
      userId: string,
    ) => Effect.Effect<Project, ORPCError<string, unknown>>;

    deleteProject: (
      id: string,
      userId: string,
    ) => Effect.Effect<{ deleted: boolean }, ORPCError<string, unknown>>;

    listProjectApps: (projectId: string) => Effect.Effect<ProjectApp[], ORPCError<string, unknown>>;

    linkAppToProject: (
      projectId: string,
      accountId: string,
      gatewayId: string,
      userId: string,
    ) => Effect.Effect<ProjectApp, ORPCError<string, unknown>>;

    unlinkAppFromProject: (
      projectId: string,
      accountId: string,
      gatewayId: string,
      userId: string,
    ) => Effect.Effect<{ deleted: boolean }, ORPCError<string, unknown>>;

    listProjectsForApp: (
      accountId: string,
      gatewayId: string,
      userId?: string,
    ) => Effect.Effect<Project[], ORPCError<string, unknown>>;
  }
>() {}

const canViewProject = (db: any, projectId: string, userId?: string) =>
  Effect.gen(function* () {
    const results = (yield* Effect.promise(() =>
      db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    )) as any[];

    const project = results[0];

    if (!project) {
      return false;
    }

    if (project.visibility === "public" || project.visibility === "unlisted") {
      return true;
    }

    if (!userId) {
      return false;
    }

    return project.ownerId === userId;
  });

const canEditProject = (db: any, projectId: string, userId: string) =>
  Effect.gen(function* () {
    const results = (yield* Effect.promise(() =>
      db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    )) as any[];

    const project = results[0];

    if (!project) {
      return false;
    }

    return project.ownerId === userId;
  });

export const ProjectServiceLive = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    return {
      listProjects: (input, userId) =>
        Effect.gen(function* () {
          const limit = Math.min(input.limit ?? 24, 100);
          const conditions: any[] = [];

          if (input.organizationId) {
            conditions.push(eq(projects.organizationId, input.organizationId));
          }

          if (input.ownerId) {
            conditions.push(eq(projects.ownerId, input.ownerId));
          }

          if (input.status) {
            conditions.push(eq(projects.status, input.status));
          }

          if (input.visibility) {
            conditions.push(eq(projects.visibility, input.visibility));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const [totalResult] = yield* Effect.promise(() =>
            db.select({ count: count() }).from(projects).where(whereClause),
          );

          const total = totalResult?.count ?? 0;

          const records = yield* Effect.promise(() =>
            db
              .select()
              .from(projects)
              .where(whereClause)
              .orderBy(desc(projects.createdAt))
              .limit(limit),
          );

          const filtered = userId
            ? records
            : records.filter((p: any) => p.visibility === "public" || p.visibility === "unlisted");

          const data: Project[] = filtered.map((p: any) => ({
            id: p.id,
            ownerId: p.ownerId,
            organizationId: p.organizationId,
            slug: p.slug,
            title: p.title,
            description: p.description,
            status: p.status as "active" | "paused" | "archived",
            visibility: p.visibility as "private" | "unlisted" | "public",
            createdAt: toIsoString(p.createdAt),
            updatedAt: toIsoString(p.updatedAt),
          }));

          return {
            data,
            meta: {
              total,
              hasMore: data.length < total,
              nextCursor: data.length < total ? String(data.length) : null,
            },
          };
        }),

      getProject: (id, userId) =>
        Effect.gen(function* () {
          const canView = yield* canViewProject(db, id, userId);
          if (!canView) {
            return null;
          }

          const [project] = yield* Effect.promise(() =>
            db.select().from(projects).where(eq(projects.id, id)).limit(1),
          );

          if (!project) {
            return null;
          }

          const apps = yield* Effect.promise(() =>
            db
              .select()
              .from(projectApps)
              .where(eq(projectApps.projectId, id))
              .orderBy(projectApps.position),
          );

          return {
            id: project.id,
            ownerId: project.ownerId,
            organizationId: project.organizationId,
            slug: project.slug,
            title: project.title,
            description: project.description,
            status: project.status as "active" | "paused" | "archived",
            visibility: project.visibility as "private" | "unlisted" | "public",
            createdAt: toIsoString(project.createdAt),
            updatedAt: toIsoString(project.updatedAt),
            apps: apps.map((a: any) => ({
              id: a.id,
              projectId: a.projectId,
              accountId: a.accountId,
              gatewayId: a.gatewayId,
              position: a.position,
              createdByUserId: a.createdByUserId,
            createdAt: toIsoString(a.createdAt),
            })),
          };
        }),

      createProject: (input, userId) =>
        Effect.gen(function* () {
          const [existing] = yield* Effect.promise(() =>
            db
              .select()
              .from(projects)
              .where(and(eq(projects.ownerId, userId), eq(projects.slug, input.slug)))
              .limit(1),
          );

          if (existing) {
            return yield* Effect.fail(
              new ORPCError("BAD_REQUEST", {
                message: "A project with this slug already exists",
              }),
            );
          }

          const now = new Date();
          const id = generateId();

          yield* Effect.promise(() =>
            db.insert(projects).values({
              id,
              ownerId: userId,
              organizationId: input.organizationId ?? null,
              slug: input.slug,
              title: input.title,
              description: input.description ?? null,
              status: "active",
              visibility: input.visibility ?? "private",
              createdAt: now,
              updatedAt: now,
            }),
          );

          return {
            id,
            ownerId: userId,
            organizationId: input.organizationId ?? null,
            slug: input.slug,
            title: input.title,
            description: input.description ?? null,
            status: "active" as const,
            visibility: (input.visibility ?? "private") as "private" | "unlisted" | "public",
            createdAt: toIsoString(now),
            updatedAt: toIsoString(now),
          };
        }),

      updateProject: (id, input, userId) =>
        Effect.gen(function* () {
          const canEdit = yield* canEditProject(db, id, userId);
          if (!canEdit) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "You do not have permission to edit this project",
              }),
            );
          }

          const [existing] = yield* Effect.promise(() =>
            db.select().from(projects).where(eq(projects.id, id)).limit(1),
          );

          if (!existing) {
            return yield* Effect.fail(new ORPCError("NOT_FOUND", { message: "Project not found" }));
          }

          const now = new Date();
          const updates: any = { updatedAt: now };

          if (input.title !== undefined) updates.title = input.title;
          if (input.description !== undefined) updates.description = input.description;
          if (input.status !== undefined) updates.status = input.status;
          if (input.visibility !== undefined) updates.visibility = input.visibility;

          yield* Effect.promise(() => db.update(projects).set(updates).where(eq(projects.id, id)));

          return {
            id: existing.id,
            ownerId: existing.ownerId,
            organizationId: existing.organizationId,
            slug: existing.slug,
            title: updates.title ?? existing.title,
            description: updates.description ?? existing.description,
            status: updates.status ?? existing.status,
            visibility: updates.visibility ?? existing.visibility,
            createdAt: toIsoString(existing.createdAt),
            updatedAt: toIsoString(now),
          };
        }),

      deleteProject: (id, userId) =>
        Effect.gen(function* () {
          const canEdit = yield* canEditProject(db, id, userId);
          if (!canEdit) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "You do not have permission to delete this project",
              }),
            );
          }

          yield* Effect.promise(() => db.delete(projects).where(eq(projects.id, id)));

          return { deleted: true };
        }),

      listProjectApps: (projectId) =>
        Effect.gen(function* () {
          const apps = yield* Effect.promise(() =>
            db
              .select()
              .from(projectApps)
              .where(eq(projectApps.projectId, projectId))
              .orderBy(projectApps.position),
          );

          return apps.map((a: any) => ({
            id: a.id,
            projectId: a.projectId,
            accountId: a.accountId,
            gatewayId: a.gatewayId,
            position: a.position,
            createdByUserId: a.createdByUserId,
            createdAt: toIsoString(a.createdAt),
          }));
        }),

      linkAppToProject: (projectId, accountId, gatewayId, userId) =>
        Effect.gen(function* () {
          const canEdit = yield* canEditProject(db, projectId, userId);
          if (!canEdit) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "You do not have permission to edit this project",
              }),
            );
          }

          const [existing] = yield* Effect.promise(() =>
            db
              .select()
              .from(projectApps)
              .where(
                and(
                  eq(projectApps.projectId, projectId),
                  eq(projectApps.accountId, accountId),
                  eq(projectApps.gatewayId, gatewayId),
                ),
              )
              .limit(1),
          );

          if (existing) {
          return {
            id: existing.id,
            projectId: existing.projectId,
            accountId: existing.accountId,
            gatewayId: existing.gatewayId,
            position: existing.position,
            createdByUserId: existing.createdByUserId,
            createdAt: toIsoString(existing.createdAt),
          };
          }

          const [maxPos] = yield* Effect.promise(() =>
            db
              .select({ max: count() })
              .from(projectApps)
              .where(eq(projectApps.projectId, projectId)),
          );

          const position = (maxPos?.max ?? 0) + 1;
          const now = new Date();
          const id = generateProjectAppId();

          yield* Effect.promise(() =>
            db.insert(projectApps).values({
              id,
              projectId,
              accountId,
              gatewayId,
              position,
              createdByUserId: userId,
              createdAt: now,
            }),
          );

          return {
            id,
            projectId,
            accountId,
            gatewayId,
            position,
            createdByUserId: userId,
            createdAt: toIsoString(now),
          };
        }),

      unlinkAppFromProject: (projectId, accountId, gatewayId, userId) =>
        Effect.gen(function* () {
          const canEdit = yield* canEditProject(db, projectId, userId);
          if (!canEdit) {
            return yield* Effect.fail(
              new ORPCError("FORBIDDEN", {
                message: "You do not have permission to edit this project",
              }),
            );
          }

          yield* Effect.promise(() =>
            db
              .delete(projectApps)
              .where(
                and(
                  eq(projectApps.projectId, projectId),
                  eq(projectApps.accountId, accountId),
                  eq(projectApps.gatewayId, gatewayId),
                ),
              ),
          );

          return { deleted: true };
        }),

      listProjectsForApp: (accountId, gatewayId, userId) =>
        Effect.gen(function* () {
          const results = yield* Effect.promise(() =>
            db
              .select({ project: projects })
              .from(projectApps)
              .innerJoin(projects, eq(projectApps.projectId, projects.id))
              .where(
                and(eq(projectApps.accountId, accountId), eq(projectApps.gatewayId, gatewayId)),
              ),
          );

          const filtered = userId
            ? results
            : results.filter(
                (r: any) =>
                  r.project.visibility === "public" || r.project.visibility === "unlisted",
              );

          return filtered.map((r: any) => ({
            id: r.project.id,
            ownerId: r.project.ownerId,
            organizationId: r.project.organizationId,
            slug: r.project.slug,
            title: r.project.title,
            description: r.project.description,
            status: r.project.status as "active" | "paused" | "archived",
            visibility: r.project.visibility as "private" | "unlisted" | "public",
            createdAt: toIsoString(r.project.createdAt),
            updatedAt: toIsoString(r.project.updatedAt),
          }));
        }),
    };
  }),
);
