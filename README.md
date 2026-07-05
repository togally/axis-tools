# axis-tools / Axis 技能工具仓

`axis-tools` 是 Axis 的公共 packaged skills 仓库。当前仓库只保留最近这套技能工作流：安装、刷新、创建、校验和沉淀公共安全的 Axis/Codex skills。

`axis-tools` is the public packaged-skills repository for Axis. It now keeps only the current skill workflow: install, refresh, create, validate, and deposit public-safe Axis/Codex skills.

主命令只保留：

Only these command entries are exposed:

```text
axis
axis-tools
```

## 仓库内容 / Repository Contents

```text
axis-tools/
├── catalog/
│   ├── assets.public.yaml
│   ├── skills.public.yaml
│   └── taxonomy.yaml
├── governance/
│   ├── CONTRIBUTING.md
│   ├── DEPRECATION.md
│   ├── REVIEW_CHECKLIST.md
│   └── SECURITY.md
├── scripts/
│   ├── axis-create-skill.mjs
│   ├── axis-skill-deposit.mjs
│   ├── axis-update-skills.mjs
│   └── install-axis-tools.sh
├── schemas/
│   ├── asset.meta.schema.json
│   ├── catalog.schema.json
│   ├── skill.meta.schema.json
│   └── taxonomy.schema.json
├── skills/
│   ├── axis-ali-dashboard/
│   ├── axis-benchmark/
│   ├── axis-create-skill/
│   └── axis-update/
├── src/cli.ts
├── templates/
│   ├── doc-asset/
│   └── skill/
├── tests/
├── package.json
└── README.md
```

## 当前技能 / Current Packaged Skills

| 技能 / Skill | 用途 / Purpose |
| --- | --- |
| `axis-ali-dashboard` | 生成、修复并校验阿里云 CloudMonitor/SLS 大屏 JSON，包含 SLS 下钻和业务流大屏模式。<br>Create, repair, and validate Alibaba Cloud CloudMonitor/SLS dashboard JSON, including SLS drilldowns and business-flow dashboard patterns. |
| `axis-benchmark` | 对 API、本地模块或依赖链路做保守压测，比较延迟/吞吐，并把 QPS/并发转换成明确口径的容量说明。项目接口或模块 runner 应通过本地文件提供。<br>Run conservative API, local-module, or dependency-path benchmarks, compare latency/throughput, and translate QPS/concurrency into clearly scoped capacity estimates. Project endpoints or module runners should be supplied through local files. |
| `axis-project-init` | 初始化 Axis v0.1 项目的 `.axis/config.yml`、本地 outbox 忽略规则和 private-beta 发布元数据。<br>Initialize Axis v0.1 `.axis/config.yml`, local outbox ignore rules, and private-beta release metadata. |
| `axis-coding-capture` | 将编码、重构、缺陷修复或架构工作采集为本地 outbox 执行报告和可复用经验卡片。<br>Capture coding, refactor, bugfix, or architecture work as a local outbox execution report and reusable experience card. |
| `axis-test-report` | 将 build/lint/test/压测等验证结果采集为本地 outbox 测试报告包。<br>Capture build, lint, test, benchmark, or pressure-test validation as a local outbox test report package. |
| `axis-oss-publish` | 校验、脱敏、dry-run 或上传 Axis v0.1 outbox 包到受控阿里云 OSS 前缀，并保证 `manifest.json` 最后上传。<br>Validate, redact, dry-run, or upload Axis v0.1 outbox packages to the controlled Aliyun OSS prefix, with `manifest.json` uploaded last. |
| `axis-create-skill` | 扫描对话中是否存在可复用、适合公开仓沉淀的技能机会，并先判断是否应该创建。<br>Scan conversations for reusable, public-safe skill opportunities and decide whether a skill belongs in this public repository before creating one. |
| `axis-update` | 从本仓库刷新并校验本机安装的 Axis packaged skills。<br>Refresh and validate locally installed Axis packaged skills from this repository. |

每个 packaged skill 都应包含 `After Use Deposition` 章节。技能使用后，如果产生了可复用的修正、示例、校验命令或边界情况，应回写到对应技能包，完成校验、本地刷新，并在有权限时推送远程。

Every packaged skill should include an `After Use Deposition` section. After a skill is used, reusable corrections, examples, validation commands, or edge cases should be folded back into the skill bundle, validated, refreshed locally, and pushed when permissions allow.

## 公共仓规则 / Public Repository Rule

这个仓库面向公共复用。不要把产品私有、客户专用、包含凭据、绑定私有主机，或只适用于某个闭源仓库的技能加入 `skills/`。

This repository is public-oriented. Do not add product-private, customer-specific, credential-bearing, host-specific, or closed-repo-only skills to `skills/`.

公共技能应使用泛化流程、示例和占位值。私有项目知识应放在私有 memory、notes 或私有技能中，而不是沉淀到本仓库。

Public skills should use generic workflows, examples, and placeholders. Private project knowledge belongs in private memory, notes, or private skills, not in this repository.

## Public-Safe Governance MVP

第一版治理骨架只覆盖公开仓内的文件化管理，不迁移真实资产，也不引入部署流程。

The first governance skeleton covers file-based management in this public repository only. It does not migrate real assets or introduce a deployment path.

| Area | Path | Purpose |
| --- | --- | --- |
| Schemas | `schemas/` | JSON Schema contracts for public skill metadata, document asset metadata, catalog entries, and taxonomy. |
| Templates | `templates/` | Mock/redacted starting points for new public skills and AI document assets. |
| Governance | `governance/` | Contribution, safety, review, and deprecation rules. |
| Catalog | `catalog/` | Public index examples that point to templates or assets without duplicating their full content. |

Use `skill.meta.yaml` beside a runnable `SKILL.md` for governance metadata. Keep `SKILL.md` Codex-compatible and concise; keep catalog files as indexes, not long-form documents.

CI in this project is a repository quality gate for schema, public-safety, and compatibility checks. It is not a deploy pipeline.

## 安装 / Install

推荐使用一键安装脚本：

Recommended bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash
```

脚本会 clone 或更新 `~/axis-tools`，安装依赖，构建 CLI，并链接 `axis` / `axis-tools`。

The installer clones or updates `~/axis-tools`, installs dependencies, builds the CLI, and links `axis` / `axis-tools`.

手动安装：

Manual install:

```bash
git clone https://github.com/togally/axis-tools.git ~/axis-tools
cd ~/axis-tools
npm install
npm run build
npm link
```

如果全局 npm bin 目录不在 `PATH` 中，请把 `~/.local/bin` 或 npm 全局 bin 路径加入 shell profile。安装脚本在需要时也会尝试把命令暴露到 `~/.local/bin`。

If your global npm bin directory is not on `PATH`, add `~/.local/bin` or the npm global bin path to your shell profile. The installer also tries to expose links in `~/.local/bin` when needed.

## 本地安装技能 / Install Skills Locally

为 Codex 和 Claude Code 安装全部 packaged skills：

Install all packaged skills for Codex and Claude Code:

```bash
axis install --agent all
```

只为 Codex 安装：

Install only for Codex:

```bash
axis install --agent codex
```

只为 Claude Code 安装：

Install only for Claude Code:

```bash
axis install --agent claude-code
```

安装会复制完整 skill bundle，包括 `SKILL.md`、`agents/`、`references/` 和 `scripts/` 等目录。

Installed skill bundles are copied as full directories, including `SKILL.md`, `agents/`, `references/`, and `scripts/` where present.

## 技能刷新 / Refresh Skills

从仓库拉取最新版本、安装到本机并校验：

Pull the latest repository version, install locally, and validate:

```bash
node scripts/axis-update-skills.mjs --repo ~/axis-tools --agent codex --json
```

不拉远程，只刷新当前 checkout：

Refresh the current checkout without pulling:

```bash
node scripts/axis-update-skills.mjs --repo ~/axis-tools --agent codex --no-pull --json
```

## 技能创建与沉淀 / Skill Creation And Deposition

扫描对话 transcript，判断是否存在适合公开沉淀的技能候选：

Scan a conversation transcript for public-safe skill candidates:

```bash
node scripts/axis-create-skill.mjs --scan-conversation /tmp/conversation.txt --json
```

创建已确认适合公开仓的技能，并沉淀到本仓库：

Create a confirmed public-safe skill and deposit it into the repo:

```bash
node scripts/axis-create-skill.mjs \
  --repo ~/axis-tools \
  --source-root ~/.codex/skills \
  --name axis-example-skill \
  --description "Use when ..." \
  --body-file /tmp/axis-example-skill.md \
  --deposit --commit --push --branch main
```

生成的 `SKILL.md` 会自动包含 `After Use Deposition`。

The generated `SKILL.md` automatically includes `After Use Deposition`.

把已有本地 Codex skill 沉淀到本仓库：

Deposit an existing local Codex skill into this repository:

```bash
node scripts/axis-skill-deposit.mjs --skill axis-example-skill
node scripts/axis-skill-deposit.mjs --skill axis-example-skill --commit --push --branch main
```

沉淀脚本会复制完整 bundle，使用 Codex 的 `quick_validate.py` 校验，并更新 `skills/manifest.json`。

The deposit script copies the complete bundle, validates it with Codex's `quick_validate.py` when available, and updates `skills/manifest.json`.

## 压测口径 / Benchmark Scope

`axis-benchmark` 不内置私有项目 profile。真实 API 压测时，请创建本地 endpoint 文件并传给脚本。

`axis-benchmark` does not embed a private project profile. For real API benchmarks, create a local endpoint file and pass it to the bundled script.

```json
{
  "endpoints": [
    {
      "name": "public_list",
      "group": "public_read",
      "path": "/api/items",
      "params": { "pageNum": 1, "pageSize": 10 },
      "auth": "public",
      "weight": 3
    }
  ]
}
```

运行：

Run:

```bash
python3 ~/.codex/skills/axis-benchmark/scripts/core_api_benchmark.py \
  --base-url https://test.example.com \
  --endpoint-file endpoints.json \
  --steps 1,3,5,10,20 \
  --duration 15 \
  --no-auth-sample
```

只有在用户明确批准测试数据污染时，才压测写接口。

Use write endpoints only when the user explicitly approves test-data pollution.

模块压测不走 HTTP API 时，应使用项目本地 runner，并在报告中明确执行链路，例如 `local module -> remote dependency`、`deployed module -> cache` 或 `command -> database`。模块压测结果不能直接当作完整 API 或服务器容量，除非 runner 就是在目标服务器上执行，或另有端到端 API 压测佐证。

For module benchmarks that do not use HTTP APIs, use a project-local runner and make the execution path explicit, such as `local module -> remote dependency`, `deployed module -> cache`, or `command -> database`. A module result is not full API or server capacity unless the runner executes on the target server or is backed by an end-to-end API benchmark.

## 开发 / Development

构建：

Build:

```bash
npm run build
```

运行全量测试：

Run the full test suite:

```bash
npm test
```

聚焦测试：

Focused tests:

```bash
npm run test:cli
npm run test:skill-deposit
npm run test:axis-skills
npm run test:public-governance
```

直接校验某个技能包：

Validate a skill bundle directly:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/axis-create-skill
```

提交技能变更前，至少运行：

Before committing skill changes, run at least:

```bash
npm run test:axis-skills
git diff --check
```

如果修改了 CLI 或安装脚本，请运行 `npm test`。

For CLI or installer changes, run `npm test`.
