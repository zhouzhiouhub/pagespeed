# 09 · GEO（Generative Engine Optimization）

## 1. 定义

**GEO**：面向生成式回答引擎的优化，目标不是只拿传统蓝链排名，而是让品牌/页面在 AI 回答中被 **引用、提及、推荐**。

覆盖引擎示例：

```text
Google AI Overviews / AI Mode
Bing Copilot
ChatGPT（浏览 / 搜索）
Perplexity
其他 Answer Engine
```

与 SEO 的关系：

| | SEO | GEO |
| --- | --- | --- |
| 主战场 | 搜索结果页（SERP） | AI 生成回答 |
| 成功信号 | 排名、点击、展现 | 引用、提及、推荐、品牌出现 |
| 内容形态 | 可爬、可索引、可点击 | 可抽取、可引用、可验证 |
| 共用基础 | 技术健康、权威、内容质量、实体清晰 | 同左，但强调「答案块」与可引用结构 |

产品公式：

```text
Website Growth Agent = SEO + GEO + Analytics + Execution
```

## 2. 用户真正要的 GEO 结果

不是：

> 「你的页面没有 FAQ。」

而是：

> 「『React Admin Dashboard』这类问题在 AI 回答里经常引用竞品文档；你的产品页缺少可被摘取的定义段与对比表，建议补齐后更易进入引用池。」

## 3. GEO 能力分层

### L1 · GEO Readiness（V1）

基于站点自身，不依赖大规模「问 AI」探测：

- 是否存在清晰 **实体/品牌定义**（Who / What）
- 是否有 **答案块**：首段直接回答、FAQ、HowTo、对比表、要点列表
- **结构化数据**：FAQ / HowTo / Article / Organization / Product
- **可引用信号**：作者、更新日期、来源、具体数据/步骤
- **AI 爬取友好**：`robots.txt` 对 GPTBot / PerplexityBot 等策略、可选 `llms.txt`
- 关键页是否同时具备 SEO 流量基础（避免优化无人问的页）

输出：`geo` 分项评分 + `geo_readiness` 类 issue/opportunity。

### L2 · Answer Presence（V2）

对目标提示词/问题集，探测生成式引擎回答中是否出现：

- 品牌名
- 站点域名
- 具体 URL 引用

输出：`geo_citation` 机会（未被提及 / 竞品被提及）。

> 探测有成本、不稳定、有 ToS 风险 → V1 不做全量探针，V2 小规模人工配置 query set。

### L3 · GEO 内容作战（V2+）

- 为「AI 会问的问题」生成答案型内容集群
- 与 Content / Competitor Agent 协同补「可引用资产」
- 跟踪引用变化并回流到每日建议

## 4. GEO Agent 职责

见 [03-agent-architecture](./03-agent-architecture.md) 中 **GEO Agent**。

核心闭环：

```text
目标问题 / 主题
  → 页面是否「答得清、引得出」
  → 与竞品被引用差距（V2）
  → 生成 GEO 方案（定义段、FAQ、表格、Schema、llms.txt）
  → 执行 → 再探测 / 再评分
```

## 5. 与其它 Agent 的边界

| Agent | GEO 相关协作 |
| --- | --- |
| SEO | Schema、索引、技术可爬是共用底座；GEO 额外关心答案可抽取性 |
| Keyword | SEO 词 → 改写为「问题型 query / prompt」供 GEO 使用 |
| Content | GEO 要求 brief 含「直接答案段 + FAQ + 可引用事实」 |
| Analytics | V1 用代理指标（结构化覆盖率、GEO 分）；V2 用 citation 出现率 |
| Competitor | 竞品哪些页/文档常被 AI 风格内容模仿或引用 |
| Execution | 落地 FAQ、Schema、`llms.txt`、定义段文案 |

## 6. 评分建议（Audit 增加 geo 维）

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

`geo` 维可拆子分（存 `scores.geo_breakdown`）：

| 子分 | 含义 |
| --- | --- |
| answerability | 关键页是否有直接答案结构 |
| structure | FAQ/HowTo/表格/列表覆盖 |
| trust | 作者、日期、组织实体、可验证事实 |
| ai_access | AI bot 策略与 llms.txt 等 |
| entity | 品牌/产品实体一致性 |

## 7. 机会类型

`opportunities.type` 增加：

- `geo_readiness` — 页面/站点未达到可引用标准
- `geo_citation` — 目标问题上品牌未被 AI 提及（V2）
- `geo_asset` — 缺少可引用资产（对比页、文档、统计、模板）

## 8. V1 验收（GEO）

1. Audit 出现 **GEO 分数**与 readiness issues  
2. 至少一类机会：「高流量页缺少 FAQ/直接答案段」  
3. Action Plan 能产出：定义段草稿 + FAQ + Schema 建议（可复制）  
4. 增长建议里可出现 GEO 优先级卡片（与 SEO 卡片并列）
