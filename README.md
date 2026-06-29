# axis-tools / Axis 工具仓

`axis-tools` 是 Axis 的公共工具仓，当前重点维护本地 CLI 工具和可复用的 packaged skills。这个仓库的核心目标是：让公共安全的 Axis/Codex 技能可以安装、校验、更新，并在使用后持续沉淀改进。

`axis-tools` is the public toolkit repository for Axis local CLI utilities and reusable packaged skills. Its current focus is to keep public-safe Axis/Codex skills installable, validatable, refreshable, and easy to improve after real use.

主命令是 `axis`。`axis-tools` 是同入口别名，旧的 `orbit*` 命令仍作为兼容别名保留。

The main command is `axis`. `axis-tools` is an alias, and older `orbit*` commands remain available for compatibility.

## 仓库内容 / Repository Contents

```text
axis-tools/
├── scripts/                 # 技能安装、更新、沉淀和启动脚本 / skill helper scripts
├── skills/                  # 公共 packaged skills / public packaged skills
│   ├── axis-ali-dashboard/
│   ├── axis-api-benchmark/
│   ├── axis-create-skill/
│   └── axis-update/
├── src/cli.ts               # Axis CLI 实现 / Axis CLI implementation
├── tests/                   # CLI 和技能打包测试 / CLI and skill packaging tests
├── package.json
└── README.md
```

## 当前技能 / Current Packaged Skills

| 技能 / Skill | 用途 / Purpose |
| --- | --- |
| `axis-ali-dashboard` | 生成、修复并校验阿里云 CloudMonitor/SLS 大屏 JSON，包含 SLS 下钻和业务流大屏模式。<br>Create, repair, and validate Alibaba Cloud CloudMonitor/SLS dashboard JSON, including SLS drilldowns and business-flow dashboard patterns. |
| `axis-api-benchmark` | 对测试环境 API 做保守压测，比较接口延迟，并把 QPS/并发转换成业务容量口径。项目接口应通过本地 endpoint JSON 提供。<br>Run conservative API benchmarks, compare endpoint latency, and translate QPS/concurrency into business-facing capacity estimates. Project endpoints should be supplied through a local endpoint JSON file. |
| `axis-create-skill` | 扫描对话中是否存在可复用、适合公开仓沉淀的技能机会，并先判断是否应该创建。<br>Scan conversations for reusable, public-safe skill opportunities and decide whether a skill belongs in this public repository before creating one. |
| `axis-update` | 从本仓库刷新并校验本机安装的 Axis packaged skills。<br>Refresh and validate locally installed Axis packaged skills from this repository. |

每个 packaged skill 都应包含 `After Use Deposition` 章节。技能使用后，如果产生了可复用的修正、示例、校验命令或边界情况，应回写到对应技能包，完成校验、本地刷新，并在有权限时推送远程。

Every packaged skill should include an `After Use Deposition` section. After a skill is used, reusable corrections, examples, validation commands, or edge cases should be folded back into the skill bundle, validated, refreshed locally, and pushed when permissions allow.

## 公共仓规则 / Public Repository Rule

这个仓库面向公共复用。不要把产品私有、客户专用、包含凭据、绑定私有主机，或只适用于某个闭源仓库的技能加入 `skills/`。

This repository is public-oriented. Do not add product-private, customer-specific, credential-bearing, host-specific, or closed-repo-only skills to `skills/`.

公共技能应使用泛化流程、示例和占位值。私有项目知识应放在私有 memory、notes 或私有技能中，而不是沉淀到本仓库。

Public skills should use generic workflows, examples, and placeholders. Private project knowledge belongs in private memory, notes, or private skills, not in this repository.

`axis-create-skill` 和测试套件会约束这个方向：生成的技能会自动带上沉淀逻辑，疑似私有项目的候选默认不会被创建为公共技能。

`axis-create-skill` and the test suite enforce this direction: generated skills automatically include deposition guidance, and private-looking candidates are rejected by default for public packaged skills.

## 安装 / Install

推荐使用一键安装脚本：

Recommended bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash
```

脚本会 clone 或更新 `~/axis-tools`，安装依赖，构建 CLI，并链接全局命令：

The installer clones or updates `~/axis-tools`, installs dependencies, builds the CLI, and links global commands:

```text
axis
axis-tools
axis-ide
axis-req
axis-bug
axis-sug
```

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

从仓库刷新并校验本机技能包：

Refresh from the repository and validate installed bundles:

```bash
node scripts/axis-update-skills.mjs --repo ~/axis-tools --agent codex --json
```

安装会复制完整 skill bundle，包括 `SKILL.md`、`agents/`、`references/` 和 `scripts/` 等目录。

Installed skill bundles are copied as full directories, including `SKILL.md`, `agents/`, `references/`, and `scripts/` where present.

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

## CLI 概览 / CLI Overview

CLI 仍包含一些运营类命令。README 只记录稳定的顶层用途；完整命令列表请运行 `axis --help`。

The CLI still includes several operational commands. This README documents the stable top-level intent; run `axis --help` for the full current command list.

常用本地工具命令：

Common local utility commands:

```bash
axis install --agent all
axis codex-status current --repo /path/to/repo
axis codex-status tail --repo /path/to/repo --limit 20
axis codex-status summary --repo /path/to/repo
```

Codex hook 事件写入：

Codex hook ingestion:

```bash
axis codex-hook ingest --file examples/sample-pretool.json
axis codex-hook ingest --file examples/sample-posttool.json
```

如果环境使用 Axis backend，也可以继续使用 Axis Hub 相关命令：

Optional Axis Hub commands remain available for environments that use Axis backend integration:

```bash
axis login
axis me
axis init
axis bind
axis pull
axis submit "describe work here" --type requirement --json
axis start-work --agent codex
```

需求池快捷命令仍作为兼容和提效入口保留：

Pool shortcuts remain as compatibility and productivity commands:

```bash
axis-req "new requirement"
axis-bug "bug report"
axis-sug "improvement suggestion"
axis-ide "new idea"
```

当后端暴露 Axis MCP endpoint 时，可以安装 MCP：

MCP installation is available when a backend exposes an Axis MCP endpoint:

```bash
axis mcp install \
  --backend-url https://example.com \
  --mcp-url https://example.com/api/mcp
```

## API 压测 endpoint 文件 / API Benchmark Endpoint Files

`axis-api-benchmark` 不再内置任何私有项目 profile。真实压测时，请创建本地 endpoint 文件并传给脚本。

`axis-api-benchmark` no longer embeds a private project profile. For real benchmarks, create a local endpoint file and pass it to the bundled script.

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
python3 ~/.codex/skills/axis-api-benchmark/scripts/core_api_benchmark.py \
  --base-url https://test.example.com \
  --endpoint-file endpoints.json \
  --steps 1,3,5,10,20 \
  --duration 15 \
  --no-auth-sample
```

只有在用户明确批准测试数据污染时，才压测写接口。

Use write endpoints only when the user explicitly approves test-data pollution.

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
npm run test:mcp
npm run test:skill-deposit
npm run test:axis-skills
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

如果修改了更广泛的 CLI 行为，请运行 `npm test`。

For broader CLI changes, run `npm test`.

## 兼容说明 / Compatibility Notes

- `orbit`、`orbit-tools`、`orbit-req`、`orbit-bug`、`orbit-sug` 和 `orbit-ide` 仍保留为旧工作流别名。<br>`orbit`, `orbit-tools`, `orbit-req`, `orbit-bug`, `orbit-sug`, and `orbit-ide` remain aliases for older local workflows.
- `scripts/install-orbit-tools.sh` 仍保留为 Axis installer 的兼容 wrapper。<br>`scripts/install-orbit-tools.sh` remains as a compatibility wrapper around the Axis installer.
- 旧 README 曾把大量 backend 和 worker 细节写在仓库首页。相关命令在 CLI 中仍按实现保留，但当前 README 聚焦公共工具仓和 packaged skill 工作流。<br>The old README described many backend and worker details inline. Those commands still exist in the CLI where implemented, but this README now focuses on the public toolkit and packaged skill workflow.
