# 02 · 产品架构

## 1. 系统全景

```text
┌─────────────────────────────────────────────────────────────┐
│                        Web App (UI)                          │
│  Dashboard · Audit · Keywords · Content · GEO · Advice      │
└────────────────────────────┬────────────────────────────────┘
                             │ REST / tRPC
┌────────────────────────────▼────────────────────────────────┐
│                     API Gateway / BFF                        │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
┌──────▼──┐ ┌─────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────────┐
│ Site    │ │ Insights │ │ Agent  │ │ Exec   │ │ Integrations │
│ Crawler │ │ Engine   │ │ Orchestrator │   │ │ (GSC/GA/Git)  │
│ (+GEO   │ │ (+GEO    │ │ (+GEO  │ │        │ │ (+AI probe   │
│ signals)│ │ rules)   │ │ Agent) │ │        │ │  V2)         │
└──────┬──┘ └─────┬────┘ └───┬────┘ └───┬────┘ └───┬──────────┘
       │          │          │          │          │
┌──────▼──────────▼──────────▼──────────▼──────────▼──────────┐
│              Postgres + Object Store + Job Queue             │
└─────────────────────────────────────────────────────────────┘
```

## 2. 模块边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| **Site Crawler** | 抓取页面、解析 DOM/meta、sitemap/robots、**GEO 信号**（FAQ/答案块/实体/llms.txt/AI bot） | 不做关键词商业判断；V1 不做 AI 回答探针 |
| **Integrations** | OAuth 与定时同步 GSC/GA；后续 GitHub/CMS；**V2 AI 引用探测** | 不做机会打分 |
| **Insights Engine** | SEO/GEO 规则评分、机会打分、差距分析（确定性逻辑） | 不直接改站 |
| **Agent Orchestrator** | 调度子 Agent（含 GEO）、汇总「今日建议」、生成方案文案 | 不持久化原始爬取细节（由 Crawler） |
| **Execution** | V1：导出改动清单；V3：开 PR / 部署钩子 | V1 不写生产 |
| **Web App** | 展示、确认、工作流状态 | 不做重计算 |

## 3. 数据流（核心闭环）

```text
网站 / GSC / GA /（V2：AI 回答探针）
      ↓
  采集 & 归一化（pages, queries, metrics, geo_signals）
      ↓
  Insights Engine（SEO + GEO 机会候选）
      ↓
  Agents（解释、排序、方案）
      ↓
  Growth Advice（用户可见）
      ↓
  Confirm / Execute
      ↓
  网站变化 + 新指标 / 新引用信号
      ↓
  再分析
```

## 4. 多租户模型（远期）

V1 可单租户（仅 Kinolin）。远期：

```text
Workspace
  └── Site (url, integrations)
        ├── Pages
        ├── Opportunities
        ├── AdviceRuns (每日)
        └── Executions
```

## 5. 任务与调度

| 任务 | 频率 | 说明 |
| --- | --- | --- |
| `crawl.full` | 首次 / 按需 | 全站或抽样爬取 |
| `crawl.delta` | 每日 | 变更页 / 重要页刷新 |
| `sync.gsc` | 每日 | Search Analytics |
| `sync.ga4` | 每日 | 流量与转化 |
| `insights.opportunities` | 每日 | 重算 SEO/GEO 机会 |
| `advice.daily` | 每日早晨 | 生成「今日增长建议」 |
| `geo.probe` | 每周（V2） | 目标问题集的 AI 引用探测 |
| `competitor.scan` | 每周（V2） | 竞品内容变化 |

技术建议：队列（BullMQ / Inngest / Cloud Tasks）+ cron。

## 6. 安全与权限

- OAuth token 加密存储，最小权限 scope
- 爬虫 User-Agent 可识别、遵守 robots.txt
- 执行类操作需 workspace 角色：`viewer` / `editor` / `admin`
- PR / 部署仅 `admin` 可开启 auto-merge（V4）

## 7. 与 Kinolin 实验栈的映射

| 能力 | 实验接入 |
| --- | --- |
| 流量与行为 | GA4 |
| 搜索表现 | Google Search Console |
| 边缘 / 性能 | Cloudflare |
| 源码 | GitHub |
| 站点 | kinolin.com（或当前主站） |
| 智能层 | LLM API |

V1 先打通 **URL 爬取 + GSC + GA4 + AI 解读**，源码改写留到 V3。
