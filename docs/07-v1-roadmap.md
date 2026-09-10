# 07 · 路线图与 V1 开发任务

## 1. 版本总览

| 版本 | 主题 | 用户价值 |
| --- | --- | --- |
| **V1** | 采集 + SEO/GEO Readiness + 机会 + 每日建议 | 知道「下一步做什么」 |
| **V2** | 竞品 + 内容生成 + GEO 引用探测 + 深建议 | 方案可直接写进内容/页面，并看到 AI 提及差距 |
| **V3** | GitHub 执行 | 批准后自动出 PR |
| **V4** | 闭环自治 | 监控效果并调整策略 |

```text
V1  网站 URL → 爬虫 → SEO + GEO Readiness → GSC → GA → AI → 增长机会
V2  + 竞品 + 内容生成 + GEO Answer Presence + 页面/内链建议
V3  + GitHub → 改代码 → 测试 → PR
V4  + 自动执行 → 监控 → 再策略
```

---

## 2. V1 范围冻结

### In

- 单站点（Kinolin 或指定站）深度可用
- 爬虫 + 技术 SEO 规则审计与评分
- **GEO Readiness** 信号抽取、评分与机会（答案块/FAQ/Schema/实体/AI bot）
- GSC / GA4 OAuth 同步
- Keyword / Content gap / Tech / **GEO** 类 opportunities
- Orchestrator 每日「增长建议」
- **6 页面 UI**（含 `/geo`）
- Action Plan 生成（文案/清单级，含定义段/FAQ/Schema，人工落地）

### Out

- 自动改生产代码
- 完整 SERP 爬取对标（可用简化启发式）
- **全量 AI 回答引用探测**（放到 V2）
- 多租户计费
- CRO 深度实验平台
- 竞品周报

---

## 3. V1 里程碑

| Milestone | 目标 | 退出标准 |
| --- | --- | --- |
| **M0** 脚手架 | 仓库、CI、DB、鉴权骨架 | 本地可跑空 Dashboard |
| **M1** 爬取与审计 | 输入 URL → 出 SEO/GEO 分数与 issue | Kinolin 全站或抽样可审计 |
| **M2** 数据接入 | GSC + GA4 入库与图表/摘要 | 能展示 7/28 天核心指标 |
| **M3** 机会引擎 | 规则打出 keyword/content/tech/**geo** 机会 | Top 机会人工抽检「值得做」≥ 70% |
| **M4** Agent 建议 | 每日 Advice + Action Plan（含 GEO 方案） | 早间可打开「今日增长建议」 |
| **M5** 打磨 | 空态、错误、重试、文档 | 自己每天愿意打开 |

---

## 4. V1 开发任务清单

### M0 · 工程基础

- [ ] 初始化 monorepo 或 `apps/web` + `apps/api`
- [ ] Postgres + 迁移框架（按 [04-database](./04-database.md)）
- [ ] 任务队列与 cron 入口
- [ ] 环境变量模板（LLM、Google OAuth、DB）
- [ ] 基础鉴权（单用户可接受）
- [ ] 空 UI 壳含 `/geo` 路由

### M1 · Site Crawler & SEO / GEO Audit

- [ ] `POST /sites` 创建站点
- [ ] Sitemap / robots 解析（含 AI bot 策略摘要）
- [ ] 页面抓取与字段抽取（title、description、h1、canonical、schema…）
- [ ] **GEO 信号抽取**（答案块、FAQ、实体、作者/日期、`llms.txt`）
- [ ] Issue 规则引擎（缺字段、多 H1、不可索引、**GEO readiness** 等）
- [ ] 评分算法含 **geo 维**（可先权重表硬编码）
- [ ] `GET audits/latest` + 网站分析页 + GEO 分展示

### M2 · Integrations

- [ ] Google OAuth（GSC + GA4）
- [ ] GSC Search Analytics 日报同步 job
- [ ] GA4 页级日报同步 job
- [ ] Dashboard / Analytics summary API
- [ ] 未连接时的降级 UI

### M3 · Insights / Opportunities

- [ ] Keyword 机会启发式（位置区间、CTR、趋势）
- [ ] Content gap 初版（有展现无专页 / 主题覆盖粗判）
- [ ] **GEO readiness → opportunity**（高价值页缺 FAQ/定义段等）
- [ ] Tech issue → opportunity 提升（带业务影响过滤：无流量低优）
- [ ] Opportunities API + 关键词/内容/**GEO** 页对接
- [ ] evidence 落库

### M4 · Agents

- [ ] Agent 接口与 tool 层（读 page / gsc / ga）
- [ ] Analytics Agent：指标 → 叙事
- [ ] Keyword / SEO / **GEO** / Content 轻量 Agent
- [ ] Orchestrator：每日 Top N 建议（可含 GEO 卡）
- [ ] Action Plan 生成 API + UI 面板（含定义段/FAQ/Schema）
- [ ] 「标记已处理 / 忽略」

### M5 · 体验与自用闭环

- [ ] Onboarding 向导
- [ ] 今日增长建议页完整信息架构
- [ ] 失败重试与 job 状态
- [ ] 用 Kinolin 真实数据跑 7 天，记录误报并调权
- [ ] README 启动说明

---

## 5. V2 任务大纲

- [ ] Competitor Agent + `/competitors`
- [ ] SERP / 竞品页差距分析
- [ ] Content 全文草稿生成与 brief 编辑
- [ ] 内链建议图（页 ↔ 页）
- [ ] CRO 基础假设（高流量低转化页）
- [ ] **GEO Answer Presence**：prompt 集 + 引擎探针 + 引用率看板
- [ ] query → geo_prompts 自动衍生

## 6. V3 任务大纲

- [ ] GitHub App / OAuth
- [ ] Execution Agent：按 plan 改文件、开 PR
- [ ] 测试门禁与 diff 预览
- [ ] executions 列表与状态回写

## 7. V4 任务大纲

- [ ] 批准策略：半自动 / 全自动
- [ ] 效果归因（机会执行后 14/28 天指标）
- [ ] 策略自调（提升/降低某类机会权重）

---

## 8. 建议实施顺序（第一周可执行）

```text
Day 1–2   M0 + sites 表 + 空 UI 壳（6 路由，含 /geo）
Day 3–4   爬虫 MVP + SEO/GEO 审计分数
Day 5     GSC 同步 MVP
Day 6     机会启发式 + 关键词/GEO 页
Day 7     Orchestrator 假数据 → 真数据串通「今日建议」
```

---

## 9. 验收场景（V1 Demo Script）

1. 添加 `https://kinolin.com`
2. 连接 GSC、GA4
3. 等待审计完成，网站分析页看到 **SEO + GEO** 分数与严重问题
4. GEO 页看到至少若干 readiness 机会（如缺 FAQ）
5. 关键词页看到至少若干「位置 8–20」机会
6. 增长建议页出现带证据的高优先级卡片（SEO 或 GEO）
7. 点击生成方案，得到可复制的 Title/定义段/FAQ/大纲/内链清单
8. 标记已处理后，卡片状态变化

---

## 10. 开放问题（开发前需拍板）

| 问题 | 选项 | 建议 |
| --- | --- | --- |
| 技术栈 | Next 全栈 vs Vue 前端 + Node API | 见 [08-tech-stack](./08-tech-stack.md) |
| 部署 | Vercel + 托管 DB vs Cloudflare | 随 Kinolin 现有栈 |
| 关键词量级数据 | 仅 GSC vs 购买第三方 | V1 仅 GSC |
| 爬取范围 | 全站 vs 上限 N 页 | V1 上限 + sitemap 优先 |
