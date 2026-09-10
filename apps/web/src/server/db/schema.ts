import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const siteStatusEnum = pgEnum("site_status", [
  "pending",
  "active",
  "error",
]);

export const integrationTypeEnum = pgEnum("integration_type", [
  "gsc",
  "ga4",
  "github",
  "cloudflare",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "expired",
  "error",
]);

export const auditTypeEnum = pgEnum("audit_type", ["full", "delta"]);

export const auditStatusEnum = pgEnum("audit_status", [
  "running",
  "done",
  "failed",
]);

export const issueSeverityEnum = pgEnum("issue_severity", [
  "critical",
  "warning",
  "info",
]);

export const opportunityTypeEnum = pgEnum("opportunity_type", [
  "keyword",
  "content_gap",
  "tech_seo",
  "geo_readiness",
  "geo_citation",
  "geo_asset",
  "cro",
  "competitor",
]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "open",
  "planned",
  "done",
  "dismissed",
]);

export const evidenceKindEnum = pgEnum("evidence_kind", [
  "gsc_row",
  "ga_row",
  "page_snapshot",
  "geo_signal",
  "geo_probe",
  "rule",
  "competitor_url",
]);

export const adviceRunStatusEnum = pgEnum("advice_run_status", [
  "ready",
  "failed",
]);

export const advicePriorityEnum = pgEnum("advice_priority", [
  "high",
  "medium",
  "low",
]);

export const adviceUserStateEnum = pgEnum("advice_user_state", [
  "new",
  "viewed",
  "acted",
  "dismissed",
]);

export const actionPlanStatusEnum = pgEnum("action_plan_status", [
  "draft",
  "approved",
  "rejected",
  "executed",
]);

export const actionPlanCreatedByEnum = pgEnum("action_plan_created_by", [
  "agent",
  "user",
]);

export const actionStepKindEnum = pgEnum("action_step_kind", [
  "edit_title",
  "add_section",
  "add_faq",
  "add_definition",
  "add_schema",
  "add_llms_txt",
  "add_internal_link",
  "create_page",
  "code_change",
]);

export const actionStepStatusEnum = pgEnum("action_step_status", [
  "pending",
  "done",
  "skipped",
]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  name: text("name").notNull(),
  status: siteStatusEnum("status").notNull().default("pending"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  type: integrationTypeEnum("type").notNull(),
  status: integrationStatusEnum("status").notNull().default("connected"),
  credentialsEncrypted: text("credentials_encrypted"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code"),
    title: text("title"),
    metaDescription: text("meta_description"),
    h1: text("h1"),
    canonical: text("canonical"),
    indexable: boolean("indexable"),
    wordCount: integer("word_count"),
    hasSchema: boolean("has_schema"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    rawSignals: jsonb("raw_signals").$type<Record<string, unknown>>().default({}),
    geoSignals: jsonb("geo_signals").$type<Record<string, unknown>>().default({}),
    contentHash: text("content_hash"),
  },
  (t) => [
    uniqueIndex("pages_site_url_uidx").on(t.siteId, t.url),
    index("pages_site_path_idx").on(t.siteId, t.path),
  ],
);

export const audits = pgTable("audits", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  type: auditTypeEnum("type").notNull().default("full"),
  status: auditStatusEnum("status").notNull().default("running"),
  scores: jsonb("scores").$type<Record<string, number>>().default({}),
  summary: jsonb("summary").$type<Record<string, number>>().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const auditIssues = pgTable("audit_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  severity: issueSeverityEnum("severity").notNull(),
  message: text("message").notNull(),
  context: jsonb("context").$type<Record<string, unknown>>().default({}),
});

export const gscQueryDaily = pgTable(
  "gsc_query_daily",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    query: text("query").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: numeric("ctr"),
    position: numeric("position"),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.date, t.query, t.page] }),
    index("gsc_site_date_idx").on(t.siteId, t.date),
    index("gsc_site_query_date_idx").on(t.siteId, t.query, t.date),
  ],
);

export const gaPageDaily = pgTable(
  "ga_page_daily",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    pagePath: text("page_path").notNull(),
    sessions: integer("sessions").notNull().default(0),
    users: integer("users").notNull().default(0),
    engagementRate: numeric("engagement_rate"),
    avgEngagementTime: numeric("avg_engagement_time"),
    conversions: numeric("conversions"),
    bounceRate: numeric("bounce_rate"),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.date, t.pagePath] }),
    index("ga_site_date_idx").on(t.siteId, t.date),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    type: opportunityTypeEnum("type").notNull(),
    status: opportunityStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description"),
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    query: text("query"),
    score: numeric("score"),
    impact: numeric("impact"),
    confidence: numeric("confidence"),
    effort: numeric("effort"),
    estimatedLift: jsonb("estimated_lift").$type<Record<string, unknown>>(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("opportunities_site_status_score_idx").on(t.siteId, t.status)],
);

export const opportunityEvidence = pgTable("opportunity_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  kind: evidenceKindEnum("kind").notNull(),
  ref: jsonb("ref").$type<Record<string, unknown>>().notNull().default({}),
});

export const adviceRuns = pgTable(
  "advice_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    runDate: date("run_date").notNull(),
    status: adviceRunStatusEnum("status").notNull().default("ready"),
    headline: text("headline"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("advice_runs_site_date_uidx").on(t.siteId, t.runDate)],
);

export const adviceItems = pgTable(
  "advice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adviceRunId: uuid("advice_run_id")
      .notNull()
      .references(() => adviceRuns.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    priority: advicePriorityEnum("priority").notNull().default("medium"),
    title: text("title").notNull(),
    body: text("body"),
    ctaLabel: text("cta_label"),
    sortOrder: integer("sort_order").notNull().default(0),
    userState: adviceUserStateEnum("user_state").notNull().default("new"),
  },
  (t) => [index("advice_items_run_sort_idx").on(t.adviceRunId, t.sortOrder)],
);

export const actionPlans = pgTable("action_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id")
    .notNull()
    .references(() => opportunities.id, { onDelete: "cascade" }),
  status: actionPlanStatusEnum("status").notNull().default("draft"),
  summary: text("summary"),
  plan: jsonb("plan").$type<Record<string, unknown>>().default({}),
  createdBy: actionPlanCreatedByEnum("created_by").notNull().default("agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const actionSteps = pgTable("action_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  actionPlanId: uuid("action_plan_id")
    .notNull()
    .references(() => actionPlans.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull().default(0),
  kind: actionStepKindEnum("kind").notNull(),
  target: jsonb("target").$type<Record<string, unknown>>().default({}),
  content: jsonb("content").$type<Record<string, unknown>>().default({}),
  status: actionStepStatusEnum("status").notNull().default("pending"),
});
