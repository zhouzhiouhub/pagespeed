# 05 · API 设计

## 1. 约定

- Base：`/api/v1`
- 鉴权：Session / JWT（V1 可单用户 + Google OAuth）
- 错误格式：`{ "error": { "code": "...", "message": "..." } }`
- 列表默认分页：`?cursor=&limit=20`

## 2. Sites

### `POST /sites`

注册站点。

```json
{ "url": "https://kinolin.com", "name": "Kinolin" }
```

响应：`201` + site 对象；后台触发首次 `crawl.full`。

### `GET /sites/:siteId`

站点详情 + 集成状态摘要。

### `GET /sites/:siteId/overview`

Dashboard 用聚合：

```json
{
  "scores": { "overall": 70, "seo": 82 },
  "traffic": { "users": 1284, "organic": 823, "deltas": { "users": 0.12 } },
  "advicePreview": [ /* top 3 */ ],
  "lastAuditAt": "..."
}
```

## 3. Integrations

### `POST /sites/:siteId/integrations/:type/connect`

开始 OAuth（`gsc` | `ga4` | `github`）。

### `GET /sites/:siteId/integrations`

列表与 `last_synced_at`。

### `POST /sites/:siteId/integrations/:type/sync`

手动触发同步。

## 4. Audits & Pages

### `POST /sites/:siteId/audits`

触发审计：`{ "type": "full" | "delta" }`。

### `GET /sites/:siteId/audits/latest`

最新审计分数与 summary。

### `GET /sites/:siteId/audits/:auditId/issues`

筛选：`severity`、`code`、`pageId`。

### `GET /sites/:siteId/pages`

页面列表；支持 `q`、`indexable`、`sort=word_count`。

### `GET /sites/:siteId/pages/:pageId`

单页快照 + 关联机会。

## 5. Opportunities

### `GET /sites/:siteId/opportunities`

Query：

- `type=keyword|content_gap|tech_seo|geo_readiness|geo_citation|geo_asset|cro`
- `status=open`
- `sort=score`

### `GET /sites/:siteId/opportunities/:id`

详情 + evidence + 建议动作。

### `PATCH /sites/:siteId/opportunities/:id`

```json
{ "status": "dismissed" }
```

## 6. Keywords（只读视图）

### `GET /sites/:siteId/keywords/opportunities`

Keyword Agent 结果视图（可来自 opportunities 物化）。

响应项示例：

```json
{
  "query": "React Admin",
  "position": 18,
  "potential": 5,
  "page": "/products/admin",
  "trend7d": -6
}
```

> `trend7d`：position 变化，负数表示排名上升。

## 7. Content

### `GET /sites/:siteId/content/gaps`

内容缺口列表。

### `POST /sites/:siteId/content/briefs`

为某机会生成 brief（同步或返回 job id）。

```json
{ "opportunityId": "...", "targetKeyword": "React Admin Dashboard Tutorial" }
```

## 7b. GEO

### `GET /sites/:siteId/geo/overview`

GEO 总分、breakdown、关键缺口计数。

### `GET /sites/:siteId/geo/opportunities`

`geo_readiness` / `geo_citation` / `geo_asset` 列表。

### `GET /sites/:siteId/geo/pages/:pageId`

单页 `geo_signals` + 建议动作。

### `POST /sites/:siteId/geo/probes`（V2）

```json
{ "prompts": ["What is the best React admin dashboard?"], "engines": ["perplexity"] }
```

### `GET /sites/:siteId/geo/probes`（V2）

历史探测与品牌/URL 出现率。
## 8. Advice（今日增长建议）

### `GET /sites/:siteId/advice/today`

返回当日 `advice_run` + items。

### `POST /sites/:siteId/advice/generate`

强制重跑编排（限流）。

### `PATCH /sites/:siteId/advice/items/:itemId`

```json
{ "user_state": "acted" }
```

## 9. Action Plans

### `POST /sites/:siteId/action-plans`

从机会生成方案：

```json
{ "opportunityId": "..." }
```

内部调用 Orchestrator Interactive Plan。

### `GET /sites/:siteId/action-plans/:id`

### `POST /sites/:siteId/action-plans/:id/approve`

V1：标记 approved，返回 checklist / 可复制改动。  
V3：触发 Execution。

### `POST /sites/:siteId/action-plans/:id/execute`（V3）

```json
{ "provider": "github_pr" }
```

## 10. Analytics Narratives

### `GET /sites/:siteId/analytics/summary?range=7d`

数字 + Analytics Agent 叙事：

```json
{
  "metrics": { "users": 1284, "organicClicks": 634, "ctr": 0.048 },
  "narratives": [
    {
      "text": "自然搜索流量增长 21%，主要来自 /tools/json-format …",
      "evidenceIds": ["..."]
    }
  ]
}
```

## 11. Jobs（内部/调试）

### `GET /jobs/:jobId`

爬取、同步、生成方案等异步任务状态。

## 12. Webhooks（可选）

| 事件 | 何时 |
| --- | --- |
| `audit.completed` | 审计完成 |
| `advice.ready` | 每日建议就绪 |
| `execution.pr_created` | V3 |

## 13. 权限矩阵（简）

| 操作 | viewer | editor | admin |
| --- | --- | --- | --- |
| 查看建议/数据 | ✓ | ✓ | ✓ |
| 生成方案 | | ✓ | ✓ |
| 连接集成 | | | ✓ |
| 批准执行 / PR | | | ✓ |
