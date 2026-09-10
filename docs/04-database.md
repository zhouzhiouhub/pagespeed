# 04 · 数据库设计

## 1. 设计原则

- 原始数据（爬取 HTML 摘要、GSC/GA 行）与「机会/建议」分离。
- 所有建议可追溯到 evidence（page / query / metric snapshot）。
- V1 单站点可用；表结构预留 `workspace_id` / `site_id`。

## 2. ER 概览

```text
workspaces 1──* sites
sites 1──* pages
sites 1──* integrations
sites 1──* audits
audits 1──* audit_issues
sites 1──* gsc_query_daily
sites 1──* ga_page_daily
sites 1──* opportunities
opportunities 1──* opportunity_evidence
sites 1──* advice_runs
advice_runs 1──* advice_items
advice_items *──1 opportunities (nullable)
sites 1──* action_plans
action_plans 1──* action_steps
action_plans 1──* executions (V3)
```

## 3. 核心表

### workspaces

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| name | text | |
| created_at | timestamptz | |

### sites

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| workspace_id | uuid FK | |
| url | text | 主域名，如 https://kinolin.com |
| name | text | |
| status | enum | `pending` `active` `error` |
| settings | jsonb | 爬取深度、时区、目标市场等 |
| created_at | timestamptz | |

### integrations

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| type | enum | `gsc` `ga4` `github` `cloudflare` |
| status | enum | `connected` `expired` `error` |
| credentials_encrypted | bytea | |
| meta | jsonb | property id、repo 等 |
| last_synced_at | timestamptz | |

### pages

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| url | text | 规范化 URL |
| path | text | |
| status_code | int | |
| title | text | |
| meta_description | text | |
| h1 | text | |
| canonical | text | |
| indexable | bool | |
| word_count | int | |
| has_schema | bool | |
| last_crawled_at | timestamptz | |
| raw_signals | jsonb | OG、图片缺 alt 数、内链出链数等 |
| geo_signals | jsonb | 答案块/FAQ/实体/作者/日期/AI bot/`llms.txt` 等 |
| content_hash | text | 变更检测 |

唯一约束：`(site_id, url)`。

### audits

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| type | enum | `full` `delta` |
| status | enum | `running` `done` `failed` |
| scores | jsonb | `{ seo, geo, technical, content, coverage, cro, overall }` |
| summary | jsonb | 严重/机会/优秀计数 |
| started_at / finished_at | timestamptz | |

### audit_issues

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| audit_id | uuid FK | |
| page_id | uuid FK nullable | |
| code | text | 如 `missing_meta_description` |
| severity | enum | `critical` `warning` `info` |
| message | text | |
| context | jsonb | |

### gsc_query_daily

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| site_id | uuid | |
| date | date | |
| query | text | |
| page | text | |
| clicks | int | |
| impressions | int | |
| ctr | numeric | |
| position | numeric | |

主键建议：`(site_id, date, query, page)`。

### ga_page_daily

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| site_id | uuid | |
| date | date | |
| page_path | text | |
| sessions | int | |
| users | int | |
| engagement_rate | numeric | |
| avg_engagement_time | numeric | |
| conversions | numeric | |
| bounce_rate | numeric | 若可得 |

### opportunities

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| type | enum | `keyword` `content_gap` `tech_seo` `geo_readiness` `geo_citation` `geo_asset` `cro` `competitor` |
| status | enum | `open` `planned` `done` `dismissed` |
| title | text | |
| description | text | |
| page_id | uuid nullable | |
| query | text nullable | |
| score | numeric | 0–1 综合分 |
| impact / confidence / effort | numeric | |
| estimated_lift | jsonb | 如 `{ position: "8-12" }` |
| payload | jsonb | Agent 结构化细节 |
| detected_at | timestamptz | |
| updated_at | timestamptz | |

### opportunity_evidence

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| opportunity_id | uuid FK | |
| kind | enum | `gsc_row` `ga_row` `page_snapshot` `geo_signal` `geo_probe` `rule` `competitor_url` |
| ref | jsonb | 指向具体数据键 |

### geo_probes（V2）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| prompt | text | 问题 / 提示词 |
| engine | text | 如 `perplexity` `ai_overview` |
| brand_mentioned | bool | |
| url_cited | bool | |
| cited_urls | jsonb | |
| raw_excerpt | text | 脱敏摘录 |
| probed_at | timestamptz | |

### advice_runs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| run_date | date | |
| status | enum | `ready` `failed` |
| headline | text | |
| created_at | timestamptz | |

唯一：`(site_id, run_date)`。

### advice_items

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| advice_run_id | uuid FK | |
| opportunity_id | uuid nullable | |
| priority | enum | `high` `medium` `low` |
| title | text | |
| body | text | Markdown / 富文本 |
| cta_label | text | 如「生成优化方案」 |
| sort_order | int | |
| user_state | enum | `new` `viewed` `acted` `dismissed` |

### action_plans

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| site_id | uuid FK | |
| opportunity_id | uuid FK | |
| status | enum | `draft` `approved` `rejected` `executed` |
| summary | text | |
| plan | jsonb | 完整方案 |
| created_by | enum | `agent` `user` |
| created_at | timestamptz | |

### action_steps

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| action_plan_id | uuid FK | |
| step_order | int | |
| kind | enum | `edit_title` `add_section` `add_faq` `add_definition` `add_schema` `add_llms_txt` `add_internal_link` `create_page` `code_change` |
| target | jsonb | URL / 选择器 / 文件路径 |
| content | jsonb | 建议文案或 patch 描述 |
| status | enum | `pending` `done` `skipped` |

### executions（V3）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| action_plan_id | uuid FK | |
| provider | enum | `github_pr` `manual` |
| external_url | text | PR 链接 |
| status | enum | `pending` `success` `failed` |
| log | jsonb | |

## 4. 评分存储示例

`audits.scores`：

```json
{
  "seo": 82,
  "geo": 58,
  "technical": 76,
  "content": 68,
  "coverage": 54,
  "cro": 61,
  "overall": 68
}
```

可选 `scores.geo_breakdown`：`answerability` / `structure` / `trust` / `ai_access` / `entity`。

`audits.summary`：

```json
{
  "critical": 3,
  "opportunities": 17,
  "growth_potentials": 42,
  "winning_pages": 8
}
```

## 5. 索引建议

- `pages (site_id, path)`
- `gsc_query_daily (site_id, date)`
- `gsc_query_daily (site_id, query, date)`
- `opportunities (site_id, status, score DESC)`
- `advice_items (advice_run_id, sort_order)`

## 6. 迁移策略

1. V1：workspaces → sites → pages（含 `geo_signals`）→ audits（含 geo 分）→ gsc/ga → opportunities → advice → action_plans
2. V2：competitors、content_briefs、`geo_probes` / `geo_citations` 表
3. V3：executions、github_installations
