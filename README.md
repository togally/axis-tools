# axis-tools

`axis-tools` is the public-safe skill toolbox for Axis workflows.

It packages reusable Codex / Claude Code skills, helper scripts, metadata
contracts, and governance rules so teams can install the same reviewed skill
bundles locally and keep public-safe execution records consistent.

## 中文

### 产品定位

`axis-tools` 是 Axis 的公共安全 skill 工具箱。它把研发、测试、压测、文档、云资源、经验沉淀和发布前校验等常用工作流封装成可安装的 packaged skills，并提供统一的安装、刷新、校验和项目配置入口。

适合使用本仓库的场景：

- 团队希望让 Codex 或 Claude Code 使用同一套经过审核的 Axis 工作流。
- 研发任务需要有固定的需求、设计、实现、验证、经验沉淀和收口口径。
- 项目需要把本地执行报告、测试报告或经验卡片以公开安全的格式留档。
- 需要把可复用方法沉淀为公开仓 skill，同时避免凭据、私有主机、客户数据或闭源项目细节泄露。

### 为什么使用 axis-tools

| 价值 | 说明 |
| --- | --- |
| 工作流标准化 | 把常见任务入口固化为 skill，减少每次临时约定流程和验收口径。 |
| 公共安全优先 | 默认要求示例、配置和留档产物不包含密钥、私有 URL、客户标识或未脱敏日志。 |
| 本地可验证 | skill bundle、配置文件和 outbox 包都能通过本地脚本校验后再交付或上传。 |
| 双代理兼容 | `axis install` 支持安装到 Codex 和 Claude Code 的 skill 目录。 |
| 经验可复用 | 每个 packaged skill 都要求包含 `After Use Deposition`，把可复用修正和边界情况回写到 skill。 |

### 仓库结构

```text
axis-tools/
├── .axis/config.yml        # Axis v0.2 public-safe repo config for local outbox validation
├── .axis/organizations.yml # Organization registry and OSS profile names
├── catalog/                 # 公共安全 catalog 示例和索引
├── docs/                    # Axis v0.2 contract, project knowledge, and expired v0.1 references
├── governance/              # 贡献、安全、评审和废弃规则
├── schemas/                 # skill、asset、catalog、taxonomy JSON Schema
├── scripts/                 # 安装、刷新、创建、沉淀 helper scripts
├── skills/                  # 可安装 packaged skill bundles
│   ├── axis-*/              # 每个 skill 一个目录
│   └── manifest.json        # 当前 packaged skill 清单
├── src/cli.ts               # `axis` / `axis-tools` CLI 源码
├── templates/               # 公共安全 skill 和文档资产模板
├── tests/                   # CLI、skill、治理和 outbox 测试
├── package.json
└── README.md
```

每个 `skills/<skill-name>/` 是一个完整 bundle，通常包含：

```text
SKILL.md                 # skill 说明和执行规则
agents/openai.yaml       # agent 适配配置
references/              # 可选：领域参考资料
scripts/                 # 可选：可复用校验或执行脚本
```

### 当前提供的 skills

合并与命名规则见 [`docs/axis-skill-consolidation-audit.md`](docs/axis-skill-consolidation-audit.md)：当前所有 packaged skills 均使用 `axis-{category}-xxx` 命名，按职责家族整合，暂不做目录级合并。

| 类别 | Skill | 使用场景 |
| --- | --- | --- |
| 云监控与平台 | `axis-ops-ali-dashboard` | 创建、修复或校验阿里云 CloudMonitor/SLS 仪表盘 JSON、下钻动作和业务流大屏。 |
| 性能与容量 | `axis-test-benchmark` | 对 API、本地模块、服务依赖链路、吞吐、延迟、并发或容量做基准测试。 |
| 性能与容量 | `axis-code-api-performance-tuning` | 压测或基准测试发现读接口慢，需要在保证正确性的前提下优化延迟。 |
| 缺陷与架构 | `axis-code-bugfix` | 排查并修复缺陷、生产错误、压测失败、偶发问题或日志截图中的根因问题。 |
| 缺陷与架构 | `axis-code-arch-optimize` | 局部方法修复需要上升为共享架构能力、中间件、适配器或横切模块。 |
| 研发实现 | `axis-test-tdd` | 实现功能、修复缺陷、重构或行为变更前，先明确测试和验收口径。 |
| 测试验证 | `axis-test-side-effects` | 测试真实外部副作用、状态变更、消息投递、异步进度或清理敏感操作。 |
| 测试验证 | `axis-test-report` | 将 build、lint、test、benchmark 或压测验证结果采集为 Axis v0.2 测试报告包。 |
| 文档设计 | `axis-doc-development` | 生成概要设计、详细设计、数据库设计、接口文档、测试方案、部署文档或 Word 文档。 |
| 文档设计 | `axis-doc-tech-design` | 撰写、优化或定稿技术设计文档和方案设计。 |
| 文档设计 | `axis-doc-db-design` | 生成数据库设计文档、数据字典、Schema 设计、ER 表结构文档或 Word 版 DBDD。 |
| 文档设计 | `axis-doc-project-knowledge-bootstrap` | 为存量项目生成全局技术架构、全局业务架构、业务清单、每个业务域一份详细设计和文档缺口报告。 |
| 文档设计 | `axis-doc-business-domain` | 扫描梳理已有详细设计并补全业务域/业务架构，或按需求生成所属业务域的需求详细设计并汇总架构影响。 |
| 文档设计 | `axis-doc-feature-detailed-design` | 为证据已定位且经用户确认的单独功能生成中文详细设计；找不到或有歧义时停止并请求确认。 |
| 文档设计 | `axis-doc-drift-capture` | 任务或 PR 完成后记录 task_execution_record、version_iteration_record 和文档漂移影响范围。 |
| 文档看板 | `axis-doc-dashbord` | 启动并打开独立文档看板；本地应用缺失时，一次确认拉取公开仓库或使用模板本地自建。 |
| 文档设计 | `axis-doc-project-init` | 通过一次汇总确认配置或迁移 Axis v0.2 的组织、项目、OSS、发布、目录和语言设置。 |
| 留档与发布 | `axis-code-capture` | 将编码、重构、缺陷修复或架构工作采集为执行报告和经验卡片。 |
| 留档与发布 | `axis-ops-oss-publish` | 校验、脱敏、dry-run、同步 v0.2 项目文档或上传项目内不可变包。 |
| Skill 生命周期 | `axis-skill-create` | 扫描对话中的可复用技能机会，并判断是否适合创建公开安全的 Axis/Codex skill。 |
| Skill 生命周期 | `axis-skill-update` | 从 `axis-tools` 更新、刷新、重装或修复本地 Axis packaged skills。 |
| 代码平台 | `axis-integration-yunxiao-codeup` | 通过云效 Codeup OpenAPI 查询代码库、创建合并请求或接入 Git 评审操作。 |

### 准备事项

安装前需要准备：

1. `git`、`node` 和 `npm` 已在 `PATH` 中可用。
2. 本机可以访问 `https://github.com/togally/axis-tools`。
3. 需要安装 skill 的代理环境已存在：Codex 使用 `~/.codex/skills`，Claude Code 使用 `~/.claude/skills`。
4. 如果要运行 skill 校验，准备 Codex skill validator，默认路径为 `~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`。
5. 如果要发布 outbox 包到阿里云 OSS，只准备环境变量名和受控权限；不要把 AccessKey、token、cookie、私钥或连接串写入仓库、issue、评论或日志。

### 安装 axis-tools

推荐使用一键安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash
```

脚本会 clone 或更新 `~/axis-tools`，安装 npm 依赖，构建 CLI，并链接两个命令：

```text
axis
axis-tools
```

手动安装：

```bash
git clone https://github.com/togally/axis-tools.git ~/axis-tools
cd ~/axis-tools
npm install
npm run build
npm link
```

如果全局 npm bin 目录不在 `PATH` 中，请把 `~/.local/bin` 或 npm 全局 bin 路径加入 shell profile。

### 安装 skills

安装全部 packaged skills 到 Codex 和 Claude Code：

```bash
axis install --agent all
```

只安装到 Codex：

```bash
axis install --agent codex
```

只安装到 Claude Code：

```bash
axis install --agent claude-code
```

强制覆盖本地已安装 bundle：

```bash
axis install --agent codex --force
```

安装会复制完整 skill bundle，包括 `SKILL.md`、`agents/`、`references/` 和 `scripts/` 等目录。

### 刷新 skills

从仓库拉取最新版本、安装到本机并校验：

```bash
node scripts/axis-skill-update.mjs --repo ~/axis-tools --agent codex --json
```

不拉远程，只刷新当前 checkout：

```bash
node scripts/axis-skill-update.mjs --repo ~/axis-tools --agent codex --no-pull --json
```

开发当前 checkout 中尚未提交的 skill 时，可先预览并仅刷新指定 bundle：

```bash
node dist/cli.js install --agent codex --skill axis-doc-business-domain --dry-run --force
node dist/cli.js install --agent codex --skill axis-doc-business-domain --force
```

如果只想安装不校验，可加 `--no-validate`。

### 配置 Axis 项目

普通 skill 安装后无需全局配置。涉及 Axis v0.2 outbox、测试报告、执行报告或 OSS 发布时，需要在目标项目中完成对话式配置。

配置项目时，Skill 会先索要目标仓库路径，再逐字段展示检查结果。存量值由用户确认沿用或切换；旧协议字段先按相邻版本映射给出，再由用户确认。

```bash
axis project-init --repo /path/to/project --inspect --json
axis project-init --repo /path/to/project --answers-file /tmp/project-init-answers.json --apply
```

缺失的环境变量只展示变量名和 shell 设置命令，不索要密钥值。用户在自己的 shell 中设置后，Skill 会重新检查并等待确认。apply 会创建或更新：

```text
.axis/config.yml
.gitignore
```

v0.2 项目使用 organization registry 解析 OSS profile。项目配置只声明 `organization.id`、`project.slug` 和 `oss.profile`；`metadata.json` / `manifest.json` 中的 organization、project、OSS、repo/run 字段由工具生成快照，不需要也不允许人工二次配置。

`.axis/config.yml` 示例：

```yaml
contract_version: "0.2"
organization:
  id: org_axis_tools
  registry: .axis/organizations.yml
project:
  slug: axis-tools
  display_name: Axis Tools
package:
  outbox_dir: .axis/outbox
release:
  channel: private_beta
  gate: not_requested
oss:
  provider: aliyun-oss
  profile: private_beta_main
skills:
  project_init: axis-doc-project-init
  coding_capture: axis-code-capture
  test_report: axis-test-report
  oss_publish: axis-ops-oss-publish
```

`.axis/organizations.yml` 示例：

```yaml
schema: axis.organization_registry
schema_version: "0.2"
organizations:
  - id: org_axis_tools
    slug: axis-tools
    display_name: Axis Tools
    status: active
    oss_profiles:
      - name: private_beta_main
        provider: aliyun-oss
        bucket: axis-v02-private-beta-example
        prefix: axis/v0.2
        endpoint_env: ALIYUN_OSS_ENDPOINT
        region_env: ALIYUN_OSS_REGION
        access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID
        access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET
        security_token_env: ALIYUN_OSS_SECURITY_TOKEN
    products:
      - slug: axis-tools
        display_name: Axis Tools
        projects:
          - slug: axis-tools
            display_name: Axis Tools Repo
```

校验配置：

```bash
axis validate-config --repo /path/to/project
```

本地偏好可以放在 `.axis/config.local.yml`，例如 dry-run 或本地脱敏规则文件路径。该文件必须保持本地使用，不应提交；也不应包含真实凭据值。

### 项目知识协议

`docs/v0.2-project-knowledge-doc-protocol.md` 是四个项目知识 skills 的源控协议依据：`axis-doc-project-knowledge-bootstrap`、`axis-doc-business-domain`、`axis-doc-feature-detailed-design` 和 `axis-doc-drift-capture`。它规定 `.axis/docs/orgs/{organization_id}/projects/{project_slug}` 下的全局技术架构、全局业务架构、业务清单、每个 `business_id` 一份业务域详细设计、单功能详细设计、任务记录、版本记录和文档漂移记录结构，并要求缺失证据必须显式记录，不能编造业务或技术事实。单功能文档必须先通过功能定位确认门；零命中或多候选时不得生成。

v0.2 OSS 统一使用 `{prefix}/orgs/{organization_id}/projects/{project_slug}` 层级。项目知识直接同步到项目目录；其他报告包保存在该项目的 `packages/{run_id}` 下。

### 本地文档看板

页面已拆分到公开仓库 [togally/axis-document-review](https://github.com/togally/axis-document-review)。使用 `axis-doc-dashbord` skill 检查、启动并打开本地页面；若独立应用不存在，skill 会一次询问是拉取公开仓库还是使用内置模板本地自建，不会未经确认执行拉取。

OSS 发布前，在 shell 环境中设置 `.axis/config.yml` 里声明的环境变量：

```bash
export ALIYUN_OSS_ENDPOINT="https://oss-cn-example.aliyuncs.com"
export ALIYUN_OSS_REGION="cn-example"
export ALIYUN_OSS_ACCESS_KEY_ID="<from-secure-secret-store>"
export ALIYUN_OSS_ACCESS_KEY_SECRET="<from-secure-secret-store>"
```

如果使用 STS，再设置 `ALIYUN_OSS_SECURITY_TOKEN`。不要把这些值写入 README、issue、日志、报告或 outbox 包。

### Skill 创建与沉淀

扫描对话 transcript，判断是否存在适合公开沉淀的 skill 候选：

```bash
node scripts/axis-skill-create.mjs --scan-conversation /tmp/conversation.txt --json
```

创建已确认适合公开仓的 skill 并沉淀到本仓库：

```bash
node scripts/axis-skill-create.mjs \
  --repo ~/axis-tools \
  --source-root ~/.codex/skills \
  --name axis-skill-example \
  --description "Use when API evidence should become a reusable public-safe workflow." \
  --body-file /tmp/axis-skill-example.md \
  --deposit --commit --push --branch main
```

把已有本地 Codex skill 沉淀到本仓库：

```bash
node scripts/axis-skill-deposit.mjs --skill axis-skill-example
node scripts/axis-skill-deposit.mjs --skill axis-skill-example --commit --push --branch main
```

沉淀脚本会复制完整 bundle，使用 Codex `quick_validate.py` 校验，并更新 `skills/manifest.json`。

### 开发与验证

构建：

```bash
npm run build
```

运行全量测试：

```bash
npm test
```

聚焦测试：

```bash
npm run test:cli
npm run test:local-outbox
npm run test:skill-deposit
npm run test:axis-skills
npm run test:public-governance
```

直接校验某个 skill bundle：

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/axis-skill-create
```

提交 skill 变更前，至少运行：

```bash
npm run test:axis-skills
git diff --check
```

如果修改了 CLI、安装脚本、配置合同或 outbox 逻辑，请运行 `npm test`。

### 公共安全规则

`axis-tools` 面向公共复用，进入 `skills/`、`templates/`、`catalog/` 或示例配置的内容必须满足：

- 不包含真实密钥、token、cookie、私钥、服务器密码或连接串。
- 不包含私有主机、闭源仓库 URL、客户名称、未脱敏日志或生产数据。
- 使用泛化流程、mock 示例、占位路径和公开安全的 bucket/prefix 示例。
- 私有项目知识放在私有 memory、notes 或私有 skill 中，不沉淀到本仓库。
- outbox 包上传 OSS 前必须先完成本地校验、脱敏检查和 manifest 生成。

## English

### Product Positioning

`axis-tools` is the public-safe skill toolbox for Axis. It packages common engineering, testing, benchmarking, documentation, cloud-resource, experience-capture, and pre-release validation workflows as installable skills with a shared CLI and repository contract.

Use this repository when:

- A team wants Codex or Claude Code agents to use the same reviewed Axis workflows.
- Engineering tasks need consistent requirements, design, implementation, verification, deposition, and completion criteria.
- Projects need public-safe execution reports, test reports, or reusable experience cards.
- Reusable practices should become public skills without leaking credentials, private hosts, customer data, or closed-source project details.

### Why Use axis-tools

| Value | What it gives you |
| --- | --- |
| Standard workflows | Common task entry points are captured as skills instead of being redefined every run. |
| Public safety by default | Examples, configs, and deposited artifacts must avoid secrets, private URLs, customer identifiers, and unredacted logs. |
| Local verification | Skill bundles, project config, and outbox packages can be checked locally before handoff or upload. |
| Two agent targets | `axis install` supports both Codex and Claude Code skill directories. |
| Reusable learning | Every packaged skill should include `After Use Deposition` so reusable fixes and edge cases can be folded back into the skill. |

### Repository Structure

```text
axis-tools/
├── .axis/config.yml        # Axis v0.2 public-safe repo config for local outbox validation
├── .axis/organizations.yml # Organization registry and OSS profile names
├── catalog/                 # Public-safe catalog examples and indexes
├── docs/                    # Axis v0.2 contract, project knowledge, and expired v0.1 references
├── governance/              # Contribution, security, review, and deprecation rules
├── schemas/                 # JSON Schema for skills, assets, catalogs, and taxonomy
├── scripts/                 # Install, refresh, create, and deposit helper scripts
├── skills/                  # Installable packaged skill bundles
│   ├── axis-*/              # One directory per skill
│   └── manifest.json        # Current packaged skill inventory
├── src/cli.ts               # Source for the `axis` / `axis-tools` CLI
├── templates/               # Public-safe skill and document-asset templates
├── tests/                   # CLI, skill, governance, and outbox tests
├── package.json
└── README.md
```

Each `skills/<skill-name>/` directory is a complete bundle, usually with:

```text
SKILL.md                 # Skill instructions and execution rules
agents/openai.yaml       # Agent adapter configuration
references/              # Optional domain references
scripts/                 # Optional reusable validators or runners
```

### Available Skills

See [`docs/axis-skill-consolidation-audit.md`](docs/axis-skill-consolidation-audit.md) for consolidation and naming rules. All packaged skills use the `axis-{category}-xxx` naming format and are integrated by capability family instead of directory-level merges.

| Category | Skill | When to use it |
| --- | --- | --- |
| Cloud monitoring and platforms | `axis-ops-ali-dashboard` | Create, repair, or validate Alibaba Cloud CloudMonitor/SLS dashboard JSON, drilldowns, and business-flow dashboards. |
| Performance and capacity | `axis-test-benchmark` | Benchmark APIs, local modules, service dependency paths, throughput, latency, concurrency, or capacity. |
| Performance and capacity | `axis-code-api-performance-tuning` | Optimize slow read endpoints found by benchmarks or load tests while preserving correctness. |
| Bugfix and architecture | `axis-code-bugfix` | Diagnose and fix bugs, production errors, failed benchmarks, flaky behavior, or pasted log failures. |
| Bugfix and architecture | `axis-code-arch-optimize` | Promote local method fixes into shared architecture capabilities, middleware, adapters, or cross-cutting modules. |
| Implementation | `axis-test-tdd` | Define tests and acceptance criteria before implementing features, bugfixes, refactors, or behavior changes. |
| Testing and verification | `axis-test-side-effects` | Test backend actions with real external side effects, state changes, broker messages, async progress, or cleanup-sensitive operations. |
| Testing and verification | `axis-test-report` | Capture build, lint, test, benchmark, or pressure-test evidence as an Axis v0.2 test report package. |
| Documentation and design | `axis-doc-development` | Generate overview design, detailed design, database design, API docs, test plans, deployment docs, or Word documents. |
| Documentation and design | `axis-doc-tech-design` | Write, refine, or finalize technical design and solution design documents. |
| Documentation and design | `axis-doc-db-design` | Generate database design documents, data dictionaries, schema design, ER docs, or Word DBDD files. |
| Documentation and design | `axis-doc-project-knowledge-bootstrap` | Generate global technical and business architecture, business inventory, one detailed design per business domain, and the document gap report. |
| Documentation and design | `axis-doc-business-domain` | Reconcile existing designs into domain/business architecture, or design one requirement and summarize its architecture impact. |
| Documentation and design | `axis-doc-feature-detailed-design` | Generate a Chinese detailed design for one evidence-resolved, user-confirmed feature; stop and ask when resolution is missing or ambiguous. |
| Documentation and design | `axis-doc-drift-capture` | Record task execution, version iteration impact, and affected documents after a task or PR completes. |
| Document dashboard | `axis-doc-dashbord` | Start and open the standalone document dashboard; when missing, ask once before pulling or scaffolding it locally. |
| Documentation and design | `axis-doc-project-init` | Configure or migrate Axis v0.2 organization, project, OSS, release, directory, and language settings with one consolidated confirmation. |
| Deposition and release | `axis-code-capture` | Capture coding, refactor, bugfix, or architecture work as execution reports and experience cards. |
| Deposition and release | `axis-ops-oss-publish` | Validate, redact, dry-run, synchronize v0.2 project documents, or upload immutable packages inside a project. |
| Skill lifecycle | `axis-skill-create` | Scan conversations for reusable skill opportunities and decide whether to create a public-safe Axis/Codex skill. |
| Skill lifecycle | `axis-skill-update` | Update, refresh, reinstall, or repair local Axis packaged skills from `axis-tools`. |
| Code platform | `axis-integration-yunxiao-codeup` | Query Codeup repositories, create merge requests, or support Git review through Yunxiao Codeup OpenAPI. |

### Prerequisites

Before installing:

1. Make sure `git`, `node`, and `npm` are available on `PATH`.
2. Make sure the machine can access `https://github.com/togally/axis-tools`.
3. Make sure the target agent environment exists: Codex uses `~/.codex/skills`, and Claude Code uses `~/.claude/skills`.
4. To validate installed skills, prepare the Codex skill validator. The default path is `~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.
5. To publish outbox packages to Alibaba Cloud OSS, prepare controlled permissions through environment variables only. Do not write AccessKeys, tokens, cookies, private keys, or connection strings into repositories, issues, comments, or logs.

### Install axis-tools

Recommended bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash
```

The script clones or updates `~/axis-tools`, installs npm dependencies, builds the CLI, and links:

```text
axis
axis-tools
```

Manual install:

```bash
git clone https://github.com/togally/axis-tools.git ~/axis-tools
cd ~/axis-tools
npm install
npm run build
npm link
```

If the global npm bin directory is not on `PATH`, add `~/.local/bin` or the npm global bin path to the shell profile.

### Install Skills

Install all packaged skills for Codex and Claude Code:

```bash
axis install --agent all
```

Install only for Codex:

```bash
axis install --agent codex
```

Install only for Claude Code:

```bash
axis install --agent claude-code
```

Overwrite existing local bundles:

```bash
axis install --agent codex --force
```

Installation copies the full bundle, including `SKILL.md`, `agents/`, `references/`, and `scripts/` where present.

### Refresh Skills

Pull the latest repository version, install locally, and validate:

```bash
node scripts/axis-skill-update.mjs --repo ~/axis-tools --agent codex --json
```

Refresh the current checkout without pulling:

```bash
node scripts/axis-skill-update.mjs --repo ~/axis-tools --agent codex --no-pull --json
```

When developing uncommitted skill changes in the current checkout, preview and refresh only the named bundle:

```bash
node dist/cli.js install --agent codex --skill axis-doc-business-domain --dry-run --force
node dist/cli.js install --agent codex --skill axis-doc-business-domain --force
```

Add `--no-validate` when installation is enough.

### Configure an Axis Project

Most skills do not need global configuration after installation. Axis v0.2 outbox, test-report, execution-report, and OSS publishing workflows need conversational project configuration.

The Skill asks for the target repository path, shows stored or mapped fields one by one, confirms selector changes, recommends environment variable names, and checks presence without collecting secret values.

```bash
axis project-init --repo /path/to/project --inspect --json
axis project-init --repo /path/to/project --answers-file /tmp/project-init-answers.json --apply
```

The apply flow creates or updates:

```text
.axis/config.yml
.gitignore
```

Axis v0.2 projects resolve OSS profiles through an organization registry. Project config only declares `organization.id`, `project.slug`, and `oss.profile`; organization, project, OSS, and repo/run fields in `metadata.json` and `manifest.json` are generated snapshots, not manually duplicated configuration.

`.axis/config.yml` example:

```yaml
contract_version: "0.2"
organization:
  id: org_axis_tools
  registry: .axis/organizations.yml
project:
  slug: axis-tools
  display_name: Axis Tools
package:
  outbox_dir: .axis/outbox
release:
  channel: private_beta
  gate: not_requested
oss:
  provider: aliyun-oss
  profile: private_beta_main
skills:
  project_init: axis-doc-project-init
  coding_capture: axis-code-capture
  test_report: axis-test-report
  oss_publish: axis-ops-oss-publish
```

`.axis/organizations.yml` example:

```yaml
schema: axis.organization_registry
schema_version: "0.2"
organizations:
  - id: org_axis_tools
    slug: axis-tools
    display_name: Axis Tools
    status: active
    oss_profiles:
      - name: private_beta_main
        provider: aliyun-oss
        bucket: axis-v02-private-beta-example
        prefix: axis/v0.2
        endpoint_env: ALIYUN_OSS_ENDPOINT
        region_env: ALIYUN_OSS_REGION
        access_key_id_env: ALIYUN_OSS_ACCESS_KEY_ID
        access_key_secret_env: ALIYUN_OSS_ACCESS_KEY_SECRET
        security_token_env: ALIYUN_OSS_SECURITY_TOKEN
    products:
      - slug: axis-tools
        display_name: Axis Tools
        projects:
          - slug: axis-tools
            display_name: Axis Tools Repo
```

Validate config:

```bash
axis validate-config --repo /path/to/project
```

### Project Knowledge Protocol

`docs/v0.2-project-knowledge-doc-protocol.md` is the source-controlled protocol for `axis-doc-project-knowledge-bootstrap`, `axis-doc-business-domain`, `axis-doc-feature-detailed-design`, and `axis-doc-drift-capture`. It defines global technical and business architecture, business inventory, one detailed design per `business_id`, single-feature detailed designs, task records, version records, and document drift records under `.axis/docs/orgs/{organization_id}/projects/{project_slug}`. A feature design must pass the feature-resolution confirmation gate; zero or ambiguous matches stop generation and require user confirmation.

All v0.2 OSS targets use `{prefix}/orgs/{organization_id}/projects/{project_slug}`. Project knowledge synchronizes directly into the project directory; other report packages remain under that project's `packages/{run_id}` path.

### Local Document Dashboard

The page now lives in the public [togally/axis-document-review](https://github.com/togally/axis-document-review) repository. Use the `axis-doc-dashbord` skill to inspect, start, and open it. When the standalone app is missing, the skill asks once whether to pull the public repository or scaffold the bundled local template; it never pulls without confirmation.

Local preferences can live in `.axis/config.local.yml`, such as dry-run mode or a local redaction-pattern file path. Keep that file local, do not commit it, and do not place real credentials in it.

Before OSS publishing, set the environment variables declared in `.axis/config.yml`:

```bash
export ALIYUN_OSS_ENDPOINT="https://oss-cn-example.aliyuncs.com"
export ALIYUN_OSS_REGION="cn-example"
export ALIYUN_OSS_ACCESS_KEY_ID="<from-secure-secret-store>"
export ALIYUN_OSS_ACCESS_KEY_SECRET="<from-secure-secret-store>"
```

If STS is used, also set `ALIYUN_OSS_SECURITY_TOKEN`. Do not write these values into the README, issues, logs, reports, or outbox packages.

### Skill Creation and Deposition

Scan a conversation transcript for public-safe skill candidates:

```bash
node scripts/axis-skill-create.mjs --scan-conversation /tmp/conversation.txt --json
```

Create a confirmed public-safe skill and deposit it into the repo:

```bash
node scripts/axis-skill-create.mjs \
  --repo ~/axis-tools \
  --source-root ~/.codex/skills \
  --name axis-skill-example \
  --description "Use when API evidence should become a reusable public-safe workflow." \
  --body-file /tmp/axis-skill-example.md \
  --deposit --commit --push --branch main
```

Deposit an existing local Codex skill into this repository:

```bash
node scripts/axis-skill-deposit.mjs --skill axis-skill-example
node scripts/axis-skill-deposit.mjs --skill axis-skill-example --commit --push --branch main
```

The deposit script copies the full bundle, validates it with Codex `quick_validate.py`, and updates `skills/manifest.json`.

### Development and Verification

Build:

```bash
npm run build
```

Run the full test suite:

```bash
npm test
```

Focused tests:

```bash
npm run test:cli
npm run test:local-outbox
npm run test:skill-deposit
npm run test:axis-skills
npm run test:public-governance
```

Validate one skill bundle directly:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/axis-skill-create
```

Before committing skill changes, run at least:

```bash
npm run test:axis-skills
git diff --check
```

If the CLI, installer, config contract, or outbox behavior changed, run `npm test`.

### Public-Safe Rule

`axis-tools` is designed for public reuse. Content added to `skills/`, `templates/`, `catalog/`, or example config must satisfy these rules:

- Do not include real secrets, tokens, cookies, private keys, server passwords, or connection strings.
- Do not include private hosts, closed-repository URLs, customer names, unredacted logs, or production data.
- Use generic workflows, mock examples, placeholder paths, and public-safe bucket/prefix examples.
- Keep private project knowledge in private memory, notes, or private skills instead of this repository.
- Before uploading an outbox package to OSS, complete local validation, redaction checks, and manifest generation.
