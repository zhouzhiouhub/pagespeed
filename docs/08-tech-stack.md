# 08 · 技术选型建议

## 1. 目标约束

- 先服务 **单个真实站点** 深度闭环，再考虑多租户。
- 需要：**Web UI、API、定时任务、Postgres、LLM、Google OAuth**。
- 执行改代码（V3）与现有 GitHub/Vercel/Cloudflare 生态对齐。

## 2. 推荐栈（默认）

| 层 | 推荐 | 理由 |
| --- | --- | --- |
| Web + API | **Next.js (App Router) + TypeScript** | 全栈快、OAuth/Route Handlers 方便、与 Vercel 一致 |
| UI | Tailwind + 轻量组件库（如 shadcn/ui） | 后台产品效率优先 |
| DB | **PostgreSQL** + Drizzle 或 Prisma | 机会/证据模型适合关系型 |
| Queue / Cron | **Inngest** 或 BullMQ + Redis | 审计、同步、日报编排 |
| Auth | NextAuth / Auth.js（Google） | GSC/GA 同账号体系可复用 |
| LLM | 可切换 Provider（OpenAI / Anthropic 等） | Agent 层抽象 `generateText` |
| 爬虫 | 自建 fetch + cheerio / linkedom；必要再用无头浏览器 | V1 多数 SEO 信号无需重浏览器 |
| 托管 | Vercel（Web）+ Neon/Supabase（DB）+ Redis 托管 | 与个人站技术习惯接近 |

### 备选

若强偏好 Vue 生态（与开发者作品集栈统一）：

- `apps/web`：Vue 3 + Vite + Naive UI  
- `apps/api`：Hono / Nest / Fastify  
- 其余相同（Postgres、队列、OAuth）

**文档与任务不绑定 UI 框架**；选定后在本文件勾选「已定案」。

## 3. 仓库结构建议

```text
Webagent/
  README.md
  docs/
  apps/
    web/                 # Next 或 Vue
    api/                 # 若与 web 分离；Next 全栈可省略
  packages/
    core/                # 领域类型、打分、机会启发式
    agents/              # Orchestrator + 子 Agent
    crawler/             # 抓取与解析
    integrations/        # GSC / GA4 / GitHub clients
  docker-compose.yml     # 本地 Postgres / Redis
```

V1 也可先单包 Next 应用，目录用 `src/server/{crawler,agents,integrations}`，避免过早 monorepo。

## 4. Agent 运行时建议

```text
规则引擎（分数、机会候选） → 结构化 context
        ↓
LLM Agent（解释 + Action Plan）
        ↓
校验（evidence / schema）→ 入库
```

- 用 **Zod**（或同等）校验 LLM JSON。
- Prompt 内禁止输出无 context 的数字。
- 保留 `model`、`prompt_version` 在 `action_plans.plan` meta，便于回归。

## 5. 外部 API Scope（V1）

| 服务 | 用途 | 注意 |
| --- | --- | --- |
| Search Console API | 查询、页面、点击、展现、排名 | 数据延迟约 2–3 天 |
| GA4 Data API | 页级会话、参与、转化 | 自定义转化事件需配置 |
| LLM API | 叙事与方案 | 成本：日报 + 按需生成 |

## 6. 配置清单（`.env` 草案）

```bash
DATABASE_URL=
REDIS_URL=                 # 若用 BullMQ
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
LLM_API_KEY=
LLM_MODEL=
CRAWLER_USER_AGENT=WebagentBot/0.1 (+https://your.domain)
CRAWLER_MAX_PAGES=500
```

## 7. 质量与测试

| 类型 | V1 最低要求 |
| --- | --- |
| 单元 | 打分函数、机会启发式、URL 规范化 |
| 集成 | GSC/GA fixture → opportunities |
| 手工 | Kinolin Demo Script（见路线图 §9） |
| Agent | Prompt 金样：固定 context 快照对比输出结构 |

## 8. 定案记录

| 项 | 状态 | 决定 |
| --- | --- | --- |
| UI 框架 | **已定** | Next.js App Router + TypeScript + Tailwind（`apps/web`） |
| 全栈 vs 分离 | **已定** | V1 单包 Next 全栈；`src/server/{crawler,agents,integrations,db,jobs}` |
| ORM | **已定** | Drizzle + PostgreSQL |
| DB 托管 | 本地优先 | `docker-compose` Postgres；生产可换 Neon/Supabase |
| 队列 | 骨架 | Job 名称已占位；Inngest / BullMQ 待 M1–M2 选定 |
| 首个站点 URL | 待定 | 建议 Kinolin |
