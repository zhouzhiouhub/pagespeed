# Website Growth Agent

> **不是告诉你网站哪里有问题，而是每天告诉你「下一步做什么」，并帮你做完。**

```text
Website Growth Agent = SEO + GEO + Analytics + Execution
```

从传统 SEO 检测工具，升级为可持续工作的 **AI 网站增长员工**：

```text
持续理解网站 → 发现增长机会 → 制定方案 → 执行优化 → 观察结果 → 再优化
```

同时覆盖两条获客面：

| 面 | 目标 |
| --- | --- |
| **SEO** | 搜索结果里被找到、被点击 |
| **GEO** | AI 回答里被引用、被提及、被推荐 |

## 定位

| 传统 SEO 工具 | Website Growth Agent |
| --- | --- |
| 发现问题 | 发现机会（含 SEO + GEO） |
| 生成报告 | 制定方案并执行 |
| Traffic ↑ | Traffic → Engagement → Conversion |
| 只做蓝链排名 | 蓝链 + 生成式引擎可见性 |
| 用户自己改 | 人工确认 / 自动执行闭环 |

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [docs/01-prd.md](docs/01-prd.md) | 产品需求与定位 |
| [docs/02-product-architecture.md](docs/02-product-architecture.md) | 产品架构与模块边界 |
| [docs/03-agent-architecture.md](docs/03-agent-architecture.md) | 多 Agent 协作架构（含 GEO Agent） |
| [docs/04-database.md](docs/04-database.md) | 数据模型 |
| [docs/05-api.md](docs/05-api.md) | API 设计 |
| [docs/06-ui-pages.md](docs/06-ui-pages.md) | 页面原型与信息架构 |
| [docs/07-v1-roadmap.md](docs/07-v1-roadmap.md) | V1–V4 路线图与开发任务 |
| [docs/08-tech-stack.md](docs/08-tech-stack.md) | 技术选型建议 |
| [docs/09-geo.md](docs/09-geo.md) | GEO 定义、分层与验收 |

## 版本路线（摘要）

```text
V1  爬虫 + SEO/GEO Readiness + GSC/GA + 增长机会（只读建议）
V2  竞品 + 内容生成 + GEO 引用探测 + 页面/内链建议
V3  GitHub 改代码 + 测试 + PR
V4  自动执行 + 效果监控 + 策略自调
```

## 首个实验对象

建议先以自有站点（如 Kinolin）打通：

`GA4 + GSC + Cloudflare + 网站源码 + GitHub + AI（SEO + GEO）`

再考虑多租户对外服务。
