CREATE TYPE "public"."action_plan_created_by" AS ENUM('agent', 'user');--> statement-breakpoint
CREATE TYPE "public"."action_plan_status" AS ENUM('draft', 'approved', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."action_step_kind" AS ENUM('edit_title', 'add_section', 'add_faq', 'add_definition', 'add_schema', 'add_llms_txt', 'add_internal_link', 'create_page', 'code_change');--> statement-breakpoint
CREATE TYPE "public"."action_step_status" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."advice_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."advice_run_status" AS ENUM('ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."advice_user_state" AS ENUM('new', 'viewed', 'acted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."audit_type" AS ENUM('full', 'delta');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('gsc_row', 'ga_row', 'page_snapshot', 'geo_signal', 'geo_probe', 'rule', 'competitor_url');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'expired', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('gsc', 'ga4', 'github', 'cloudflare');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'planned', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('keyword', 'content_gap', 'tech_seo', 'geo_readiness', 'geo_citation', 'geo_asset', 'cro', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('pending', 'active', 'error');--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "action_plan_status" DEFAULT 'draft' NOT NULL,
	"summary" text,
	"plan" jsonb DEFAULT '{}'::jsonb,
	"created_by" "action_plan_created_by" DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_plan_id" uuid NOT NULL,
	"step_order" integer DEFAULT 0 NOT NULL,
	"kind" "action_step_kind" NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb,
	"content" jsonb DEFAULT '{}'::jsonb,
	"status" "action_step_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advice_run_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"priority" "advice_priority" DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"cta_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"user_state" "advice_user_state" DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advice_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"status" "advice_run_status" DEFAULT 'ready' NOT NULL,
	"headline" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_id" uuid,
	"code" text NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "audit_type" DEFAULT 'full' NOT NULL,
	"status" "audit_status" DEFAULT 'running' NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ga_page_daily" (
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"page_path" text NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"users" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric,
	"avg_engagement_time" numeric,
	"conversions" numeric,
	"bounce_rate" numeric,
	CONSTRAINT "ga_page_daily_site_id_date_page_path_pk" PRIMARY KEY("site_id","date","page_path")
);
--> statement-breakpoint
CREATE TABLE "gsc_query_daily" (
	"site_id" uuid NOT NULL,
	"date" date NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" numeric,
	"position" numeric,
	CONSTRAINT "gsc_query_daily_site_id_date_query_page_pk" PRIMARY KEY("site_id","date","query","page")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "integration_type" NOT NULL,
	"status" "integration_status" DEFAULT 'connected' NOT NULL,
	"credentials_encrypted" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"page_id" uuid,
	"query" text,
	"score" numeric,
	"impact" numeric,
	"confidence" numeric,
	"effort" numeric,
	"estimated_lift" jsonb,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"ref" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer,
	"title" text,
	"meta_description" text,
	"h1" text,
	"canonical" text,
	"indexable" boolean,
	"word_count" integer,
	"has_schema" boolean,
	"last_crawled_at" timestamp with time zone,
	"raw_signals" jsonb DEFAULT '{}'::jsonb,
	"geo_signals" jsonb DEFAULT '{}'::jsonb,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"status" "site_status" DEFAULT 'pending' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_steps" ADD CONSTRAINT "action_steps_action_plan_id_action_plans_id_fk" FOREIGN KEY ("action_plan_id") REFERENCES "public"."action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_items" ADD CONSTRAINT "advice_items_advice_run_id_advice_runs_id_fk" FOREIGN KEY ("advice_run_id") REFERENCES "public"."advice_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_items" ADD CONSTRAINT "advice_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_runs" ADD CONSTRAINT "advice_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ga_page_daily" ADD CONSTRAINT "ga_page_daily_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_query_daily" ADD CONSTRAINT "gsc_query_daily_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_evidence" ADD CONSTRAINT "opportunity_evidence_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advice_items_run_sort_idx" ON "advice_items" USING btree ("advice_run_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "advice_runs_site_date_uidx" ON "advice_runs" USING btree ("site_id","run_date");--> statement-breakpoint
CREATE INDEX "ga_site_date_idx" ON "ga_page_daily" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "gsc_site_date_idx" ON "gsc_query_daily" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "gsc_site_query_date_idx" ON "gsc_query_daily" USING btree ("site_id","query","date");--> statement-breakpoint
CREATE INDEX "opportunities_site_status_score_idx" ON "opportunities" USING btree ("site_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_site_url_uidx" ON "pages" USING btree ("site_id","url");--> statement-breakpoint
CREATE INDEX "pages_site_path_idx" ON "pages" USING btree ("site_id","path");