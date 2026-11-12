import { createHash, createHmac } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import pg from "pg";
import {
  activitySchema,
  type EventReport,
  eventReportSchema,
  profileSchema,
} from "../../../api/src/discovery-contract.ts";
import { isReportableMonth, reportMonthWindow } from "../../../api/src/report-month.ts";
import {
  DEMO_ACCOUNT_SUFFIX,
  DEMO_COMMUNITIES,
  DEMO_EMAIL_DOMAIN,
  DEMO_PEOPLE,
  DEMO_PERSONAS,
  DEMO_PROPOSALS,
  DEMO_TEAMS,
  type DemoCommunity,
  type DemoCommunityKey,
  type DemoEvent,
  type DemoMonthlyReportPlan,
  type DemoPersona,
  type DemoPersonKey,
  type DemoTeamName,
} from "../fixtures/demo/demo-data.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const SESSION_DAYS = 30;

export interface DemoDatabaseUrls {
  api: string;
  auth: string;
  proposals?: string;
}

export interface DemoCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
  expires: number;
}

export interface DemoSeedPerson {
  key: DemoPersonKey;
  userId: string;
  name: string;
  email: string;
  nearAccountId: string;
  activeOrganizationId: string | null;
  communities: DemoCommunityKey[];
  cookies: DemoCookie[];
}

export interface DemoSeedEvent {
  key: string;
  id: string;
  title: string;
  status: NonNullable<DemoEvent["status"]>;
  startsAt: string;
  endsAt: string;
  reported: boolean;
  reviewed: boolean;
  checkIns: number;
}

export interface DemoSeedMonthlyReport {
  month: string;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface DemoSeedCommunity {
  key: DemoCommunityKey;
  name: string;
  organizationId: string;
  tenantId: string;
  nodeId: string;
  hostname: string;
  timezone: string;
  events: DemoSeedEvent[];
  monthlyReport: DemoSeedMonthlyReport | null;
}

export interface DemoSeed {
  today: string;
  reportMonth: string | null;
  people: Record<DemoPersonKey, DemoSeedPerson>;
  personas: Record<DemoPersona, DemoSeedPerson>;
  communities: Record<DemoCommunityKey, DemoSeedCommunity>;
}

interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

interface PlannedMember {
  person: DemoPersonKey;
  id: string;
  userId: string;
  role: string;
  joinedAt: Date;
  directory: boolean;
}

interface PlannedTeam {
  id: string;
  name: string;
  areas: string[] | null;
  eventId: string | null;
  createdAt: Date;
  userIds: string[];
}

interface PlannedRedemption {
  id: string;
  userId: string;
  at: Date;
}

interface PlannedEvent {
  def: DemoEvent;
  id: string;
  url: string;
  startsAt: Date;
  endsAt: Date;
  publishedAt: Date;
  code: {
    id: string;
    teamId: string;
    hash: string;
    createdBy: string;
    redemptions: PlannedRedemption[];
  } | null;
  report: { report: EventReport; by: string; at: Date; reviewedAt: Date | null } | null;
}

interface PlannedMonthlyReport {
  month: string;
  plan: DemoMonthlyReportPlan;
  submittedAt: Date;
  reviewedAt: Date | null;
  stats: { eventsHeld: number; checkIns: number; joins: number; newMembers: number };
}

interface PlannedCommunity {
  key: DemoCommunityKey;
  def: DemoCommunity;
  organizationId: string;
  tenantId: string;
  nodeId: string;
  accountId: string;
  ownerUserId: string;
  members: PlannedMember[];
  teams: PlannedTeam[];
  events: PlannedEvent[];
  monthlyReport: PlannedMonthlyReport | null;
}

interface DemoPlan {
  today: Date;
  now: Date;
  reportMonth: string | null;
  communities: PlannedCommunity[];
}

export function demoUuid(key: string) {
  const hex = createHash("sha1").update(`citynode-demo:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const demoUserId = (person: DemoPersonKey) => `demo-user-${person}`;
export const demoOrganizationId = (community: DemoCommunityKey) => `demo-org-${community}`;
export const demoEmail = (person: DemoPersonKey) => `${person}@${DEMO_EMAIL_DOMAIN}`;
export const demoNearAccount = (person: DemoPersonKey) => `${person}.${DEMO_ACCOUNT_SUFFIX}`;

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Buffer) {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let out = "";
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  return out;
}

export function demoToday(input?: string | Date) {
  const base = input ? new Date(input) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

const daysAgo = (today: Date, days: number) => new Date(today.getTime() - days * DAY);

export function demoReportMonth(today: Date) {
  const month = new Date(today.getTime() - 7 * DAY).toISOString().slice(0, 7);
  return isReportableMonth(month) ? month : null;
}

function reviewedAfter(at: Date, days: number | undefined, now: Date) {
  if (days === undefined) return null;
  const reviewed = new Date(at.getTime() + days * DAY);
  return reviewed < now ? reviewed : null;
}

function planMonthlyReport(
  def: DemoCommunity,
  events: PlannedEvent[],
  members: PlannedMember[],
  today: Date,
  month: string | null,
): PlannedMonthlyReport | null {
  if (!def.monthlyReport || !month) return null;
  const plan = def.monthlyReport;
  const window = reportMonthWindow(month);
  const submittedAt = new Date(
    Math.max(
      daysAgo(today, plan.submittedDaysAgo).getTime() + 10 * HOUR,
      window.from.getTime() + HOUR,
    ),
  );
  const inMonth = (at: Date) => at >= window.from && at < window.to && at <= submittedAt;
  const held = events.filter(
    (event) =>
      event.def.status !== "cancelled" &&
      event.startsAt >= window.from &&
      event.startsAt < window.to &&
      event.endsAt <= submittedAt,
  );
  const redemptions = events.flatMap((event) => event.code?.redemptions ?? []);
  return {
    month,
    plan,
    submittedAt,
    reviewedAt:
      plan.reviewedDaysAgo === undefined
        ? null
        : new Date(
            Math.max(
              daysAgo(today, plan.reviewedDaysAgo).getTime() + 9 * HOUR,
              submittedAt.getTime() + HOUR,
            ),
          ),
    stats: {
      eventsHeld: held.length,
      checkIns: held.reduce((sum, event) => sum + (event.code?.redemptions.length ?? 0), 0),
      joins: redemptions.filter((redemption) => inMonth(redemption.at)).length,
      newMembers: members.filter((member) => member.role !== "owner" && inMonth(member.joinedAt))
        .length,
    },
  };
}

function reportFor(
  event: DemoEvent,
  community: DemoCommunity,
  plan: NonNullable<DemoEvent["report"]>,
): EventReport {
  const channel = community.profile?.channels[0]?.url ?? "https://citynode.app";
  return eventReportSchema.parse({
    format: plan.format,
    socialLinks: [channel],
    focus: plan.focus,
    audiences: plan.audiences,
    audienceOther: "",
    theme: plan.theme,
    attendees: plan.attendees,
    slideLinks: [],
    kpis: plan.kpis,
    wentWell: plan.wentWell,
    improvements: plan.improvements,
    talentAfter: `A few people from ${event.title} asked how to help organize; we added them to the ${community.nodeName} channel.`,
    talentDuring: "Two attendees volunteered to run check-in and answer wallet questions.",
    materialsNeeded: "",
    hadPartners: !!plan.partners,
    partners: plan.partners ?? "",
    nextActions: plan.nextActions,
    insights: plan.insights ?? "",
    mediaLinks: [],
  });
}

function planCommunity(
  key: DemoCommunityKey,
  def: DemoCommunity,
  today: Date,
  now: Date,
  reportMonth: string | null,
): PlannedCommunity {
  const organizationId = demoOrganizationId(key);
  const nodeId = demoUuid(`node:${key}`);
  const owner = def.people.find((person) => person.role === "owner");
  if (!owner) throw new Error(`demo community ${key} has no owner`);
  const ownerUserId = demoUserId(owner.person);
  const organizer =
    def.people.find((person) => person.teams?.includes("Events"))?.person ?? owner.person;

  const events: PlannedEvent[] = def.events.map((event) => {
    const startsAt = new Date(daysAgo(today, -event.day).getTime() + def.utcHour * HOUR);
    const endsAt = new Date(startsAt.getTime() + (event.hours ?? 3) * HOUR);
    const publishedAt = new Date(
      Math.min(startsAt.getTime() - 14 * DAY, today.getTime() - 2 * DAY - 6 * HOUR),
    );
    const id = demoUuid(`event:${key}:${event.key}`);
    const reportedAt = event.report
      ? new Date(endsAt.getTime() + event.report.submittedDaysAfter * DAY + 2 * HOUR)
      : null;
    const attendees = event.attendees ?? [];
    const code =
      attendees.length > 0
        ? {
            id: `demo-code-${key}-${event.key}`,
            teamId: `demo-team-${key}-${event.key}`,
            hash: createHash("sha256").update(`demo-code-${key}-${event.key}`).digest("hex"),
            createdBy: demoUserId(organizer),
            redemptions: attendees.map((person, index) => ({
              id: `demo-redemption-${key}-${event.key}-${person}`,
              userId: demoUserId(person),
              at: new Date(startsAt.getTime() + 20 * 60_000 + index * 7 * 60_000),
            })),
          }
        : null;
    return {
      def: event,
      id,
      url: `https://citynode.app/n/${def.slug}/events/${event.key}`,
      startsAt,
      endsAt,
      publishedAt,
      code,
      report:
        event.report && reportedAt
          ? {
              report: reportFor(event, def, event.report),
              by: demoUserId(event.report.by),
              at: reportedAt,
              reviewedAt: reviewedAfter(reportedAt, event.report.reviewedDaysAfter, now),
            }
          : null,
    };
  });

  const firstAttendance = new Map<DemoPersonKey, Date>();
  for (const event of events) {
    for (const redemption of event.code?.redemptions ?? []) {
      const person = redemption.userId.replace("demo-user-", "") as DemoPersonKey;
      const seen = firstAttendance.get(person);
      if (!seen || redemption.at < seen) firstAttendance.set(person, redemption.at);
    }
  }

  const members: PlannedMember[] = def.people.map((membership) => ({
    person: membership.person,
    id: `demo-member-${key}-${membership.person}`,
    userId: demoUserId(membership.person),
    role: membership.role,
    joinedAt:
      membership.joinedDaysAgo !== undefined
        ? daysAgo(today, membership.joinedDaysAgo)
        : (firstAttendance.get(membership.person) ??
          daysAgo(today, DEMO_PEOPLE[membership.person].createdDaysAgo)),
    directory: membership.directory ?? false,
  }));

  const createdAt = daysAgo(today, def.createdDaysAgo);
  const teamNames = [
    ...new Set(def.people.flatMap((membership) => membership.teams ?? [])),
  ] as DemoTeamName[];
  const teams: PlannedTeam[] = [
    ...teamNames.map((name) => ({
      id: `demo-team-${key}-${name.toLowerCase()}`,
      name,
      areas: DEMO_TEAMS[name],
      eventId: null,
      createdAt,
      userIds: def.people
        .filter((membership) => membership.teams?.includes(name))
        .map((membership) => demoUserId(membership.person)),
    })),
    ...events.flatMap((event) =>
      event.code
        ? [
            {
              id: event.code.teamId,
              name: event.def.title,
              areas: null,
              eventId: event.id,
              createdAt: new Date(event.startsAt.getTime() - 2 * HOUR),
              userIds: [],
            },
          ]
        : [],
    ),
  ];

  return {
    key,
    def,
    organizationId,
    tenantId: demoUuid(`tenant:${key}`),
    nodeId,
    accountId: `${key}.${DEMO_ACCOUNT_SUFFIX}`,
    ownerUserId,
    members,
    teams,
    events,
    monthlyReport: planMonthlyReport(def, events, members, today, reportMonth),
  };
}

export function buildDemoPlan(today: Date): DemoPlan {
  const now = new Date();
  const reportMonth = demoReportMonth(today);
  return {
    today,
    now,
    reportMonth,
    communities: (Object.entries(DEMO_COMMUNITIES) as Array<[DemoCommunityKey, DemoCommunity]>).map(
      ([key, def]) => planCommunity(key, def, today, today, reportMonth),
    ),
  };
}

async function openSqlClient(url: string): Promise<SqlClient> {
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(url.slice("pglite:".length));
    return {
      query: async <T>(sql: string, params?: unknown[]) =>
        (await db.query(sql, params)) as { rows: T[] },
      close: () => db.close(),
    };
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    query: async <T>(sql: string, params?: unknown[]) =>
      (await client.query(sql, params)) as unknown as { rows: T[] },
    close: () => client.end(),
  };
}

async function useSchemaOf(client: SqlClient, table: string) {
  const located = await client.query<{ table_schema: string }>(
    "SELECT table_schema FROM information_schema.tables WHERE table_name = $1 AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema LIMIT 1",
    [table],
  );
  const schema = located.rows[0]?.table_schema;
  if (!schema) {
    throw new Error(
      `${table} table not found — boot the app once against this database so it applies its migrations, then stop it and seed again`,
    );
  }
  await client.query(`SET search_path TO "${schema}", public`);
}

async function inTransaction(
  url: string,
  table: string,
  run: (client: SqlClient) => Promise<void>,
) {
  const client = await openSqlClient(url);
  try {
    await useSchemaOf(client, table);
    await client.query("BEGIN");
    try {
      await run(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.close();
  }
}

async function insert(client: SqlClient, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const values = columns.map((column) => {
    const value = row[column];
    return value !== null && typeof value === "object" && !(value instanceof Date)
      ? JSON.stringify(value)
      : value;
  });
  await client.query(
    `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${columns
      .map((_, index) => `$${index + 1}`)
      .join(", ")})`,
    values,
  );
}

function sessionToken(secret: string, person: DemoPersonKey) {
  return createHmac("sha256", secret).update(`demo-session:${person}`).digest("base64url");
}

async function seedAuth(client: SqlClient, plan: DemoPlan, secret: string) {
  const organizationIds = plan.communities.map((community) => community.organizationId);
  await client.query(`DELETE FROM "user" WHERE email LIKE $1`, [`%@${DEMO_EMAIL_DOMAIN}`]);
  await client.query(`DELETE FROM organization WHERE id = ANY($1)`, [organizationIds]);

  const membershipsOf = (person: DemoPersonKey) =>
    plan.communities.filter((community) =>
      community.members.some((member) => member.person === person),
    );
  const activeOrganization = (person: DemoPersonKey) => {
    const active = DEMO_PEOPLE[person].activeCommunity;
    return (
      membershipsOf(person).find((community) => community.key === active)?.organizationId ?? null
    );
  };

  for (const [person, def] of Object.entries(DEMO_PEOPLE) as Array<
    [DemoPersonKey, (typeof DEMO_PEOPLE)[DemoPersonKey]]
  >) {
    const createdAt = daysAgo(plan.today, def.createdDaysAgo);
    await insert(client, `"user"`, {
      id: demoUserId(person),
      name: def.name,
      email: demoEmail(person),
      email_verified: true,
      role: def.platformRole ?? "user",
      created_at: createdAt,
      updated_at: createdAt,
      last_active_organization_id: activeOrganization(person),
    });
    await insert(client, "near_account", {
      id: `demo-near-${person}`,
      user_id: demoUserId(person),
      account_id: demoNearAccount(person),
      network: "testnet",
      public_key: `ed25519:${base58(createHash("sha256").update(`demo-key:${person}`).digest())}`,
      is_primary: true,
      created_at: createdAt,
    });
    await insert(client, "session", {
      id: `demo-session-${person}`,
      token: sessionToken(secret, person),
      user_id: demoUserId(person),
      expires_at: new Date(plan.now.getTime() + SESSION_DAYS * DAY),
      created_at: plan.now,
      updated_at: plan.now,
      user_agent: "citynode demo seed",
      active_organization_id: activeOrganization(person),
      active_team_id: null,
    });
  }

  for (const community of plan.communities) {
    await insert(client, "organization", {
      id: community.organizationId,
      name: community.def.name,
      slug: community.def.slug,
      created_at: daysAgo(plan.today, community.def.createdDaysAgo),
      metadata: JSON.stringify({ city: community.def.nodeName }),
      status: "active",
      requested_by: community.ownerUserId,
    });
    for (const member of community.members) {
      await insert(client, "member", {
        id: member.id,
        organization_id: community.organizationId,
        user_id: member.userId,
        role: member.role,
        created_at: member.joinedAt,
      });
    }
    for (const team of community.teams) {
      await insert(client, "team", {
        id: team.id,
        name: team.name,
        organization_id: community.organizationId,
        metadata: team.areas ? JSON.stringify({ areas: team.areas }) : null,
        event_id: team.eventId,
        member_count: team.userIds.length,
        created_at: team.createdAt,
        updated_at: team.createdAt,
      });
      for (const userId of team.userIds) {
        await insert(client, "team_member", {
          id: `demo-team-member-${team.id.replace("demo-team-", "")}-${userId.replace("demo-user-", "")}`,
          team_id: team.id,
          user_id: userId,
          role: "member",
          created_at: team.createdAt,
        });
      }
    }
    for (const event of community.events) {
      if (!event.code) continue;
      await insert(client, "onboarding_code", {
        id: event.code.id,
        code_hash: event.code.hash,
        organization_id: community.organizationId,
        event_id: event.id,
        event_name: event.def.title,
        team_id: event.code.teamId,
        role: "member",
        max_uses: 100,
        used_count: event.code.redemptions.length,
        expires_at: new Date(event.endsAt.getTime() + DAY),
        created_by: event.code.createdBy,
        created_at: new Date(event.startsAt.getTime() - 2 * HOUR),
        updated_at: new Date(event.startsAt.getTime() - 2 * HOUR),
      });
      for (const redemption of event.code.redemptions) {
        await insert(client, "onboarding_redemption", {
          id: redemption.id,
          code_id: event.code.id,
          user_id: redemption.userId,
          created_at: redemption.at,
        });
      }
    }
  }
}

async function seedApi(client: SqlClient, plan: DemoPlan) {
  const organizationIds = plan.communities.map((community) => community.organizationId);
  const userIds = (Object.keys(DEMO_PEOPLE) as DemoPersonKey[]).map(demoUserId);
  const nodeIds = plan.communities.map((community) => community.nodeId);
  await client.query(`DELETE FROM monthly_reports WHERE node_id = ANY($1)`, [nodeIds]);
  await client.query(`DELETE FROM event_reports WHERE node_id = ANY($1)`, [nodeIds]);
  await client.query(`DELETE FROM tenants WHERE account_id LIKE $1`, [`%.${DEMO_ACCOUNT_SUFFIX}`]);
  for (const table of [
    "attendance_check_ins",
    "attendance_code_checkpoints",
    "attendance_event_reconciliations",
    "team_join_requests",
    "member_count_observations",
  ]) {
    await client.query(`DELETE FROM ${table} WHERE organization_id = ANY($1)`, [organizationIds]);
  }
  await client.query(`DELETE FROM member_directory_opt_ins WHERE user_id = ANY($1)`, [userIds]);

  for (const community of plan.communities) {
    const { def } = community;
    const createdAt = daysAgo(plan.today, def.createdDaysAgo);
    const activatedAt = daysAgo(plan.today, def.activatedDaysAgo);
    await insert(client, "tenants", {
      id: community.tenantId,
      account_id: community.accountId,
      org_id: community.organizationId,
      owner_user_id: community.ownerUserId,
      name: def.name,
      status: "active",
      owner_kind: "platform",
      created_at: createdAt,
      updated_at: activatedAt,
    });
    await insert(client, "domain_bindings", {
      id: demoUuid(`binding:${community.key}`),
      tenant_id: community.tenantId,
      hostname: def.slug,
      is_primary: true,
      is_verified: true,
      verification_token: `demo-${community.key}`,
      verified_at: activatedAt,
      created_at: createdAt,
      updated_at: activatedAt,
    });
    await insert(client, "nodes", {
      id: community.nodeId,
      slug: def.slug,
      name: def.nodeName,
      tenant_id: community.tenantId,
      org_id: community.organizationId,
      activated_at: activatedAt,
      activated_by: community.ownerUserId,
      metadata: { kind: "city", ...(def.bulletin ? { bulletin: def.bulletin } : {}) },
      created_at: createdAt,
      updated_at: activatedAt,
    });
    if (def.validator) {
      await insert(client, "validators", {
        id: demoUuid(`validator:${community.key}`),
        node_id: community.nodeId,
        account_id: def.validator,
        network: "testnet",
        protocol: "near",
        role: "official",
        is_default: true,
        metadata: {},
        created_at: activatedAt,
        updated_at: activatedAt,
      });
    }
    if (def.profile) {
      await insert(client, "discovery_profiles", {
        node_id: community.nodeId,
        data: profileSchema.parse({
          nodeId: community.nodeId,
          ...def.profile,
          latitude: def.latitude,
          longitude: def.longitude,
        }),
      });
    }

    for (const event of community.events) {
      await insert(client, "discovery_activities", {
        id: event.id,
        owner_node_id: community.nodeId,
        canonical_url: event.url,
        data: activitySchema.parse({
          id: event.id,
          ownerNodeId: community.nodeId,
          nodeIds: [community.nodeId],
          kind: "event",
          title: event.def.title,
          summary: event.def.summary,
          url: event.url,
          source: def.name,
          publishedAt: event.publishedAt.toISOString(),
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          timezone: def.timezone,
          venue: event.def.venue,
          status: event.def.status ?? "published",
        }),
      });
      if (event.report) {
        await insert(client, "event_reports", {
          activity_id: event.id,
          node_id: community.nodeId,
          form_version: 1,
          report: event.report.report,
          submitted_by: event.report.by,
          submitted_at: event.report.at,
          updated_by: event.report.by,
          updated_at: event.report.at,
          reviewed_by: event.report.reviewedAt ? demoUserId(DEMO_PERSONAS.platformAdmin) : null,
          reviewed_at: event.report.reviewedAt,
        });
      }
      if (event.code) {
        for (const redemption of event.code.redemptions) {
          await insert(client, "attendance_check_ins", {
            organization_id: community.organizationId,
            code_id: event.code.id,
            user_id: redemption.userId,
            event_id: event.id,
            event_name: event.def.title,
            community_name: def.name,
            classified: true,
            checked_in_at: redemption.at,
            recorded_at: event.endsAt,
          });
        }
        await insert(client, "attendance_code_checkpoints", {
          organization_id: community.organizationId,
          code_id: event.code.id,
          used_count: event.code.redemptions.length,
          reconciled_at: plan.now,
        });
      }
      await insert(client, "attendance_event_reconciliations", {
        organization_id: community.organizationId,
        event_id: event.id,
        truncated: false,
        failed: false,
        reconciled_at: plan.now,
      });
    }
    await insert(client, "attendance_event_reconciliations", {
      organization_id: community.organizationId,
      event_id: "*",
      truncated: false,
      failed: false,
      reconciled_at: plan.now,
    });

    if (community.monthlyReport) {
      const { month, plan: report, submittedAt, reviewedAt, stats } = community.monthlyReport;
      await insert(client, "monthly_reports", {
        node_id: community.nodeId,
        month,
        notes: report.notes,
        events_held: stats.eventsHeld,
        check_ins: stats.checkIns,
        joins: stats.joins,
        new_members: stats.newMembers,
        submitted_by: demoUserId(report.by),
        submitted_at: submittedAt,
        updated_by: demoUserId(report.by),
        updated_at: submittedAt,
        reviewed_by: reviewedAt ? demoUserId(DEMO_PERSONAS.platformAdmin) : null,
        reviewed_at: reviewedAt,
      });
    }
    for (const member of community.members) {
      if (!member.directory) continue;
      await insert(client, "member_directory_opt_ins", {
        user_id: member.userId,
        opted_in: true,
        primary_account_id: demoNearAccount(member.person),
        updated_at: member.joinedAt,
      });
    }
    for (const request of def.teamRequests ?? []) {
      const team = community.teams.find((candidate) => candidate.name === request.team);
      if (!team) throw new Error(`demo team request names a missing team: ${request.team}`);
      const at = daysAgo(plan.today, request.daysAgo);
      await insert(client, "team_join_requests", {
        id: demoUuid(`team-request:${community.key}:${request.person}:${request.team}`),
        organization_id: community.organizationId,
        team_id: team.id,
        team_name: team.name,
        team_areas: team.areas ?? [],
        requester_user_id: demoUserId(request.person),
        requester_name: DEMO_PEOPLE[request.person].name,
        status: "pending",
        created_at: at,
        updated_at: at,
      });
    }
  }
}

async function seedProposals(client: SqlClient, plan: DemoPlan) {
  await client.query(`DELETE FROM proposal_submissions WHERE proposal_id LIKE 'demo-proposal-%'`);
  await client.query(`DELETE FROM proposal_audit_log WHERE proposal_id LIKE 'demo-proposal-%'`);
  await client.query(`DELETE FROM proposals WHERE id LIKE 'demo-proposal-%'`);
  for (const proposal of DEMO_PROPOSALS) {
    const id = `demo-proposal-${proposal.key}`;
    const at = daysAgo(plan.today, proposal.daysAgo);
    const payload = JSON.stringify({
      kind: "city",
      parentId: null,
      name: proposal.name,
      slug: proposal.slug,
      motivation: proposal.motivation,
      accountId: `${proposal.key}.${DEMO_ACCOUNT_SUFFIX}`,
      submitterAccountId: proposal.submitter,
    });
    await insert(client, "proposals", {
      id,
      plugin_id: "node",
      entity_id: proposal.slug,
      payload,
      created_by: proposal.submitter,
      review_status: proposal.reviewStatus,
      apply_status: proposal.applyStatus,
      apply_error: proposal.applyError ?? null,
      apply_activity_at: proposal.applyStatus === "failed" ? new Date(at.getTime() + DAY) : null,
      created_at: at,
      updated_at: proposal.reviewStatus === "pending" ? at : new Date(at.getTime() + DAY),
    });
    await insert(client, "proposal_submissions", {
      id: `demo-submission-${proposal.key}`,
      proposal_id: id,
      plugin_id: "node",
      entity_id: proposal.slug,
      submitted_by: proposal.submitter,
      source: "/apply",
      payload,
      created_at: at,
    });
  }
}

async function sessionCookies(
  secret: string,
  person: DemoPersonKey,
  plan: DemoPlan,
  secure: boolean,
): Promise<DemoCookie[]> {
  const token = sessionToken(secret, person);
  return [
    {
      name: secure ? "__Secure-better-auth.session_token" : "better-auth.session_token",
      value: `${token}.${await makeSignature(token, secret)}`,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
      expires: Math.floor((plan.now.getTime() + SESSION_DAYS * DAY) / 1000),
    },
  ];
}

async function summarize(plan: DemoPlan, secret: string, secure: boolean): Promise<DemoSeed> {
  const people = {} as Record<DemoPersonKey, DemoSeedPerson>;
  for (const person of Object.keys(DEMO_PEOPLE) as DemoPersonKey[]) {
    const memberships = plan.communities.filter((community) =>
      community.members.some((member) => member.person === person),
    );
    const active = DEMO_PEOPLE[person].activeCommunity;
    people[person] = {
      key: person,
      userId: demoUserId(person),
      name: DEMO_PEOPLE[person].name,
      email: demoEmail(person),
      nearAccountId: demoNearAccount(person),
      activeOrganizationId:
        memberships.find((community) => community.key === active)?.organizationId ?? null,
      communities: memberships.map((community) => community.key),
      cookies: await sessionCookies(secret, person, plan, secure),
    };
  }
  const personas = Object.fromEntries(
    (Object.entries(DEMO_PERSONAS) as Array<[DemoPersona, DemoPersonKey]>).map(
      ([persona, person]) => [persona, people[person]],
    ),
  ) as Record<DemoPersona, DemoSeedPerson>;
  const communities = Object.fromEntries(
    plan.communities.map((community) => [
      community.key,
      {
        key: community.key,
        name: community.def.name,
        organizationId: community.organizationId,
        tenantId: community.tenantId,
        nodeId: community.nodeId,
        hostname: community.def.slug,
        timezone: community.def.timezone,
        events: community.events.map((event) => ({
          key: event.def.key,
          id: event.id,
          title: event.def.title,
          status: event.def.status ?? "published",
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          reported: !!event.report,
          reviewed: !!event.report?.reviewedAt,
          checkIns: event.code?.redemptions.length ?? 0,
        })),
        monthlyReport: community.monthlyReport
          ? {
              month: community.monthlyReport.month,
              submittedAt: community.monthlyReport.submittedAt.toISOString(),
              reviewedAt: community.monthlyReport.reviewedAt?.toISOString() ?? null,
            }
          : null,
      },
    ]),
  ) as Record<DemoCommunityKey, DemoSeedCommunity>;
  return {
    today: plan.today.toISOString().slice(0, 10),
    reportMonth: plan.reportMonth,
    people,
    personas,
    communities,
  };
}

export async function seedDemo({
  databaseUrls,
  secret,
  baseUrl = "http://localhost",
  today,
}: {
  databaseUrls: DemoDatabaseUrls;
  secret: string;
  baseUrl?: string;
  today?: string | Date;
}): Promise<DemoSeed> {
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required to mint demo sessions");
  const plan = buildDemoPlan(demoToday(today));
  await inTransaction(databaseUrls.auth, "organization", (client) =>
    seedAuth(client, plan, secret),
  );
  await inTransaction(databaseUrls.api, "tenants", (client) => seedApi(client, plan));
  await inTransaction(databaseUrls.proposals ?? databaseUrls.api, "proposals", (client) =>
    seedProposals(client, plan),
  );
  return summarize(plan, secret, new URL(baseUrl).protocol === "https:");
}
