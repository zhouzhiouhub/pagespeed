# 03 · Agent 架构

## 1. 设计原则

- **不要做一个超级 Agent**，而是编排多个专职 Agent。
- **确定性逻辑优先**：打分、阈值、排名变化用规则/SQL；LLM 负责解释、方案文案、内容草稿。
- **每条输出必须可追溯**：引用 page_id、query、metric snapshot、竞品 URL、geo_signals。
- **人在环路**：Execution 默认需确认。

## 2. 总览

```text
                 Website Growth Agent (Orchestrator)
                                 │
     ┌───────────┬───────────┬───┴───┬───────────┬───────────┬───────────┐
     ↓           ↓           ↓       ↓           ↓           ↓           ↓
 SEO Agent   GEO Agent  Keyword  Content   Analytics   CRO      Competitor
                           Agent    Agent     Agent     Agent      Agent
     │           │           │       │           │           │           │
     └───────────┴───────────┴───┬───┴───────────┴───────────┴───────────┘
                                 ↓
                         Execution Agent
```

> V1 先实现：Orchestrator + SEO + **GEO (Readiness)** + Keyword + Content(轻量) + Analytics。  
> CRO / Competitor / Execution / GEO Citation Probe 可先留接口与占位。  
> GEO 专文见 [09-geo.md](./09-geo.md)。

## 3. Orchestrator（增长编排器）

### 职责

1. 拉取当日 insights 候选（含 SEO + GEO）
2. 按优先级策略选出 Top N（如 5 条）
3. 调用相关子 Agent 补充「原因 / 方案」
4. 写入 `advice_runs` + `advice_items`
5. 对用户请求「生成优化方案」时，组装完整 Action Plan

### 输入

- `site_id`
- 最新 audit / opportunities / metrics windows（7d / 28d）

### 输出

```json
{
  "greeting": "Good morning",
  "items": [
    {
      "priority": "high",
      "type": "geo_readiness",
      "title": "产品页缺少可被 AI 抽取的定义段与 FAQ",
      "summary": "高展现词对应页无答案块，GEO Readiness 偏低",
      "evidence": { "page": "/products/admin", "missing": ["faq", "definition_block"] },
      "suggested_actions": ["add_definition", "add_faq", "add_schema"],
      "score": 0.81
    },
    {
      "priority": "high",
      "type": "keyword_opportunity",
      "title": "「React Admin」关键词",
      "summary": "排名 18，7 日上升 6，有望进入 Top 10",
      "evidence": { "query": "react admin", "position": 18, "page": "/blog/react-admin" },
      "suggested_actions": ["optimize_page", "add_faq", "internal_links"],
      "score": 0.86
    }
  ]
}
```

### 优先级策略（建议）

```text
score = impact × confidence × effort_inverse × trend_bonus
```

| 因子 | 含义 |
| --- | --- |
| impact | 预估流量/转化/AI 可见性提升 |
| confidence | 数据充分度、证据强度 |
| effort_inverse | 改动成本越低分越高 |
| trend_bonus | 已在上升的关键词加权 |

## 4. 子 Agent 规格

### ① SEO Agent

| 项 | 内容 |
| --- | --- |
| 目标 | 技术/页面 SEO 问题 → 带业务语境的优化建议 |
| 输入 | 爬取的 page 快照、sitemap、robots、索引信号 |
| 输出 | issues[] + contextual recommendations |
| 规则示例 | 缺 title；H1 多个；canonical 不一致；无 schema |
| LLM 用法 | 解释「为何对该页重要」；草稿 rewrite title/description |
| 反例 | 不要对低价值页（如 /about 无搜索流量）给高等级优先 |

### ② GEO Agent

| 项 | 内容 |
| --- | --- |
| 目标 | 提升在生成式回答中的 **可引用性 / 被提及率** |
| 输入 | 页面 GEO 信号、关键主题/问题集、（V2）AI 回答探针结果 |
| 输出 | `geo_readiness` / `geo_citation` / `geo_asset` 机会 + Action Plan |
| V1 规则 | 无直接答案段；无 FAQ；无 Organization/FAQ Schema；无更新时间；AI bot 策略不明；缺 `llms.txt`（可选建议） |
| V1 LLM | 生成定义段、FAQ、对比表草稿；说明「为何利于被引用」 |
| V2 | 对 prompt 集探测品牌/URL 是否出现；对比竞品被引情况 |
| 反例 | 不要对零搜索/零展现页堆 GEO 优化；先与 Keyword/Analytics 对齐价值 |

详细分层见 [09-geo.md](./09-geo.md)。

### ③ Keyword Agent

| 项 | 内容 |
| --- | --- |
| 目标 | 找到值得抢的关键词，并衍生 **问题型 prompt** 供 GEO |
| 输入 | GSC queries、页面映射、（可选）第三方量级 |
| 输出 | opportunity 列表：query, position, potential, page；附 `geo_prompts[]` |
| 机会启发式 | 位置 8–20 且 clicks/impressions 有上升；或高展现低 CTR |
| LLM 用法 | 聚类主题、意图标注、机会说明、query→question 改写 |

### ④ Content Agent

| 项 | 内容 |
| --- | --- |
| 目标 | 网站该写什么、怎么结构（含 **答案型 / 可引用** 结构） |
| 输入 | 关键词缺口、现有内容库、GEO readiness 缺口、（V2）竞品 URL |
| 输出 | content briefs：slug、大纲、目标词、**首段直接答案**、FAQ、内链目标 |
| V1 范围 | 只输出缺口与 brief，不自动发布 |
| V2+ | 生成全文草稿 + SEO/GEO 检查清单 |

### ⑤ Analytics Agent

| 项 | 内容 |
| --- | --- |
| 目标 | 把 GSC/GA（及 V2 引用信号）变化翻译成「发生了什么」 |
| 输入 | 日/周指标、落地页、渠道、转化；V1 含 GEO 分变化 |
| 输出 | narrative insights + anomaly alerts |
| 示例 | 「自然流量 +21%，主因 /tools/json-format…」；「核心产品页 GEO 分 ↑12，因新增 FAQ」 |
| 原则 | 先定位贡献页/词，再给叙事；禁止无数据的空话 |

### ⑥ CRO Agent（V2+）

| 项 | 内容 |
| --- | --- |
| 目标 | 提升转化：停留、CTA、注册等 |
| 输入 | GA 行为、落地页 SEO/GEO 意图匹配、性能 |
| 输出 | 假设列表、Hero/CTA 文案、A/B 方案 |
| 边界 | 与 SEO/GEO 协同：意图不匹配时优先修内容匹配 |

### ⑦ Competitor Agent（V2）

| 项 | 内容 |
| --- | --- |
| 目标 | 跟踪竞品内容、关键词与 **AI 可见性布局** |
| 输入 | 用户配置的竞品域名 |
| 输出 | 新增 URL/主题、建议内容集群、GEO 资产差距 |
| 频率 | 每周 |

### ⑧ Execution Agent（V3+）

| 项 | 内容 |
| --- | --- |
| 目标 | 把批准的方案变成真实改动 |
| 流程 | 方案 → 用户批准 → Git 分支 → 修改 → 测试 → PR →（可选）部署 |
| GEO 相关改动 | FAQ 区块、Schema JSON-LD、`llms.txt`、定义段文案 |
| 适配 | GitHub、Vercel、Cloudflare、WordPress、Shopify、Webflow（逐步） |
| 安全 | dry-run、diff 预览、必需 review、可回滚 |

## 5. Agent 调用模式

### 模式 A：Daily Batch

```text
cron → sync data → insights → orchestrator.composeDailyAdvice()
```

### 模式 B：Interactive Plan

```text
用户点击「生成优化方案」
  → Orchestrator 锁定 opportunity
  → 并行：SEO(页面差距) + GEO(可引用性) + Keyword(意图) + Content(结构)
  → 合并 Action Plan
  → 展示确认
```

### 模式 C：Execute（V3）

```text
用户批准 Action Plan
  → Execution Agent.createPR(plan)
  → 状态回写 opportunity / advice_item
```

## 6. Prompt / Tool 约定

每个 Agent 暴露统一接口：

```ts
interface AgentTask {
  siteId: string
  goal: string
  context: Record<string, unknown> // 已检索的结构化证据
  toolsAllowed: string[]
}

interface AgentResult {
  summary: string
  findings: Finding[]
  actions: ActionDraft[]
  evidenceIds: string[]
  confidence: number
}
```

工具（Tools）示例：

- `get_page(pageId)`
- `get_gsc_query(query, range)`
- `get_top_pages(range)`
- `get_geo_signals(pageId)`
- `diff_page_vs_serp(query)`（V2）
- `probe_answer_engine(prompt, engine)`（V2）
- `create_github_pr(diff)`（V3）

LLM **不得**在无 tool 证据时编造排名、流量或「已被 ChatGPT 引用」等数字。

## 7. 质量门禁

| 检查 | 说明 |
| --- | --- |
| Evidence Gate | 无 evidenceIds 的建议不可标为 high |
| Actionability Gate | 必须含具体 URL 或明确「新建页面」 |
| Conflict Gate | 同一页同时「大改」与「小改」时合并 |
| Safety Gate | Execution 禁止改密钥、鉴权、删除库表类文件 |
| Citation Claim Gate | 未跑 probe 不得声称「已被某 AI 引用」 |
