# axis-tools

AxisNode 的本地工具仓库，覆盖 **Codex progress monitor CLI** 和 AxisNode MCP / 项目绑定配置。

公共 CLI 主命令是 `axis`。`axis-tools` 是同入口别名，`orbit` 和 `orbit-tools` 仍作为兼容别名保留；仓库名和 npm package 名是 `axis-tools`。

## 当前能力

- `axis codex-hook ingest`
  - 从 Codex 官方 hook stdin JSON 读取事件
  - 写入 `<repo>/.codex-status/latest.json`
  - 追加 `<repo>/.codex-status/events.jsonl`
- `axis codex-status current`
  - 查看当前状态
- `axis codex-status tail`
  - 查看最近事件流
- `axis codex-status summary`
  - 输出简版摘要
- `axis mcp install`
  - 把 AxisNode HTTP MCP 写入 Hermes 配置
  - 同步保存 `~/.orbit/config.json`
- `axis login`
  - 提示账号和隐藏密码，登录共享 AxisNode backend，缓存 bearer token/session
- `axis me`
  - 调用 `/api/me` 查看当前账号、显示名、角色和权限
- `axis init`
  - 选择 Agent，并安装 packaged skills
  - 不选择产品线/项目，也不写 `.axis/project.json (or legacy .orbit/project.json)`
- `axis bind`
  - 绑定单个项目 repo，或绑定一个产品线根目录及其直接子目录
  - 写入 `.axis/project.json (or legacy .orbit/project.json)` / `.axis/product-line.json (or legacy .orbit/product-line.json)`
- `axis pull`
  - 从 AxisNode 拉取产品线/项目结构，只为可 clone 的维护仓库创建本地目录
  - 项目维护了 clone URL 时会 clone；已有 git repo 时会安全 fetch/pull
- `axis init-product-line`
  - 兼容旧入口；新文档推荐使用 `axis bind`
- `axis install`
  - 安装本包 `skills/*/SKILL.md` 到 `~/.orbit/skills`，并按 `--agent` 同步到 Codex / Claude Code skill 目录
- `axis logout`
  - 清理 `~/.orbit/config.json` 中缓存的登录 token/session
- `axis project bind`
  - 高级非交互式绑定命令，保留给自动化脚本使用
- `axis project show`
  - 查看当前 repo 的 AxisNode 绑定
- `axis work once` / `axis work loop`
  - `once` 默认探测 Hub 队列；`once --spawn` 和 `loop` 会运行 bounded refine worker，把待确认 seed 转成 pool document / WorkItems

## 仓库结构

```text
axis-tools/
├── examples/
│   ├── hooks.json
│   ├── sample-pretool.json
│   └── sample-posttool.json
├── skills/
│   ├── orbit-requirement/
│   │   └── SKILL.md
│   ├── orbit-workflow/
│   │   └── SKILL.md
│   └── oribit-idea/
│       └── SKILL.md
├── src/
│   └── cli.ts
├── package.json
└── tsconfig.json
```

## 安装

新电脑推荐一键安装 / 更新（macOS 和 Linux）：

```bash
curl -fsSL https://raw.githubusercontent.com/togally/axis-tools/main/scripts/install-axis-tools.sh | bash
```

脚本默认把仓库安装到 `~/axis-tools`，如果目录不存在会 clone；如果目录已经是 `https://github.com/togally/axis-tools.git` 的 git repo，会安全更新到 `origin/main`，然后自动执行：

```bash
npm install
npm run build
npm link
```

如果 `npm link` 的全局 bin 目录不在 `PATH` 里，安装脚本会把 Axis 命令链接到 `~/.local/bin`。如果安装后当前 shell 仍找不到 `axis`，把 `~/.local/bin` 加到 `PATH` 后重新打开 shell，或运行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

本地已有脚本时也可以直接运行：

```bash
bash scripts/install-axis-tools.sh
```

可选环境变量：

```bash
AXIS_TOOLS_DIR="$HOME/axis-tools" \
AXIS_TOOLS_REPO="https://github.com/togally/axis-tools.git" \
AXIS_TOOLS_BRANCH="main" \
bash scripts/install-axis-tools.sh
```

`AXIS_TOOLS_REPO` 默认使用预期的新仓库 `https://github.com/togally/axis-tools.git`。如果当前 checkout 仍托管在旧地址或私有 fork，请显式覆盖 `AXIS_TOOLS_REPO`。旧的 `ORBIT_TOOLS_*` 环境变量仍作为兼容 fallback 生效，`scripts/install-orbit-tools.sh` 也保留为调用 Axis installer 的兼容入口。

默认不会覆盖本地修改。如果本地 repo 有未提交修改、未跟踪文件、本地提交或分叉历史，脚本会停止并提示先 commit/stash。确认要丢弃本地变更时，可以显式使用：

```bash
AXIS_TOOLS_FORCE=1 bash scripts/install-axis-tools.sh
```

手动安装：

```bash
cd /home/jasperWei/orbit/axis-tools
npm install
npm run build
bash scripts/install-codex-hook.sh
```

如果你只想安装 CLI 而不立刻接 hook：

```bash
cd /home/jasperWei/orbit/axis-tools
npm install
npm run build
npm link
```

安装后可直接用：

```bash
axis codex-status current --repo /home/jasperWei/orbit/axis-hub
```

旧命令 `orbit`、`orbit-tools`、`orbit-req`、`orbit-bug`、`orbit-sug`、`orbit-ide` 仅作为兼容别名保留；新文档和脚本应优先使用 `axis` / `axis-tools` / `axis-*`。

## AxisNode 登录、初始化、绑定与 Pull

推荐新流程：

```bash
axis login
axis init
axis bind
```

账号创建只在 AxisNode Web UI 完成；CLI 不提供注册命令。

`login` 会提示 account 和隐藏输入的 password，调用 `/api/login`，把同一 backend 的 bearer token/session 缓存在 `~/.orbit/config.json`。`me` 会调用 `/api/me`，输出当前 account、displayName、role 和 permissions。

`init` 只处理 packaged skill 安装。它会提示选择 Agent：`Codex`、`Claude Code/cc` 或 `None`，并把本包 `skills/*/SKILL.md` 安装到 `~/.orbit/skills`，必要时同步到对应 Agent skill 目录。

当前 packaged skills：

- `orbit-workflow`: 通过 AxisNode MCP 处理 discussion、requirement、bug、improvement 池和 WorkItem 生命周期。
- `orbit-requirement`: 把用户 seed 结合云端模板和项目上下文整理成 requirement 文档，并生成可入池 WorkItems。
- `oribit-idea`: 保留现有拼写，把早期想法结合云端模板整理成 AxisNode-ready artifact。

`init` 不会询问产品线/项目，也不会写当前 repo 的 `.axis/project.json (or legacy .orbit/project.json)`。项目或产品线绑定由 `bind` 完成。

### Pool CLI

四个池命令是业务入口。最终用户只需要输入一句 seed；CLI 会读取 repo 绑定和登录 token，优先提交到 AxisNode Hub 的 `/api/projects/{projectId}/pool-seeds`，状态为 `pending-confirmation`，然后立即返回。默认不会提示选择 Agent，也不会启动 Codex / Claude Code。

```bash
axis-req "商品评价支持图片"
axis-bug "登录失败"
axis-sug "优化按钮文案"
axis-ide "AI宠物健康顾问"
```

默认输出会包含 `kind`、`title`、`mode=hub-seed`、`id`、`status` 和 `url`；`--json` 输出机器可读 JSON。没有绑定、没有登录 token 或 Hub 不可用时，CLI 会把 seed 保存到本地 `.axis/pool-seeds/`，并明确输出 `mode=local-seed` 和 “seed saved locally” 类 warning。

通用查询/删除形态：

```bash
axis-req --list
axis-bug --delete
```

普通用户直接运行 `--list` 会进入交互分页，默认每页 10 条，可输入 `n`/`p` 翻页、`d` 删除某条、`q` 退出。直接运行 `--delete` 会先列出当前池子条目供选择；`--delete <id>` 会展示目标并要求输入 `yes` 才会删除，默认不删除。`--yes` 只用于脚本/CI 的非交互删除确认。

机器模式保留 `--json`：

```bash
axis-req --list --page 1 --page-size 20 --json
axis-bug --delete bug-1 --yes --json
```

高级 artifact 流程保留给 Agent/skill 或调试场景，必须显式使用 `run`、`prepare` 或 `import`：

```bash
axis-req run "商品评价支持图片" --agent none
axis-bug run "登录失败" --agent codex
axis-sug import --stdin
axis-ide prepare --json
```

`run` / `import` 会先尝试 AxisNode：

- 模板：`GET /api/projects/{projectId}/pool-templates?kind=requirement|idea|bug|suggestion`，失败时使用 CLI 内置中文 fallback 模板。
- 上传：优先 `POST /api/projects/{projectId}/pool-documents`；老 Hub 对 requirement 返回 404 时 fallback 到 `POST /api/projects/{projectId}/requirements`。
- 缓存：Hub 上传成功后默认保存一份 `source: hub-cache` 到 `docs/requirements`、`docs/ideas`、`docs/bugs` 或 `docs/suggestions`；`--no-doc` 跳过缓存。

默认 seed 提交流程中 `--local`/`--save-local` 强制只保存本地 seed，`--save` 作为旧别名保留。高级 artifact 流程中 `--local`/`--save-local` 强制只保存本地 artifact，`--dry-run` 只生成 artifact，不提交也不保存。`--agent` 只在显式 `run` 路径生效。

### Work CLI

`axis work` 是后续自动化开发循环的命令契约。`axis work once` 默认只做安全探测，不启动 Agent；`axis work once --spawn` 和 `axis work loop` 会启动 refine worker。`loop` 默认只跑 1 次，最多按显式上限跑 bounded iterations，不会常驻后台或无限循环：

```bash
axis work once --repo /path/to/repo
axis work once --repo /path/to/repo --json
axis work once --repo /path/to/repo --spawn --json
axis work loop --repo /path/to/repo --iterations 1 --json
axis work loop --repo /path/to/repo --max-iterations 3 --interval 30
```

代码和输出里固定建模两条 lane：

- `refine`: 读取 `pending-confirmation` 的 pool seeds；`axis work once --spawn` 或 `axis work loop` 会启动 refine worker，把 seed 转成 pool document / WorkItems。
- `execute`: 读取 confirmed / ready requirements 或 work-items，未来由 execute 子 Agent claim、实现、验证并写回状态。

`axis work loop` 支持：

- `--iterations <n>` / `--max-iterations <n>`：bounded 迭代次数，默认 1，上限由 CLI clamp，避免误开无限循环。
- `--interval <seconds>` / `--sleep <seconds>`：多次迭代之间的等待时间；默认 0，不 sleep。
- `--agent <codex|claude-code|none>`：选择 refine worker Agent；未传时沿用项目绑定或本机可用 Agent。
- `--json`：输出 `mode: "loop-work"`、`maxIterations`、`intervalSeconds`、`iterations[]`、`summary`、`warning` 和 `stopReason`。每个 `iterations[]` entry 都是一次真实 `work-once` run，包含 iteration number、refine results、warnings 和提交结果。

如果没有项目绑定、绑定缺少 project id、没有 pending seeds、没有可用 Agent 或 worker 转换失败，`loop` 会 cleanly stop，输出 warning / summary / stopReason，而不是继续空转。

refine worker 会把 seed kind 映射到方法论技能，并把本机 `SKILL.md` 内容直接注入传给 Agent 的 prompt/context，而不是只写一个技能名：

- idea / `axis-ide`: `plan-ceo-review`；如果 Hermes 中存在 `gstack-plan-ceo-review` 目录，则使用 `gstack-plan-ceo-review`。
- requirement / `axis-req`: `superpowers:brainstorm`。
- bug / `axis-bug`: `superpowers:systematic-debugging`。
- suggestion / `axis-sug`: `superpowers:brainstorm`。

idea 方法论内容按顺序查找：`~/.hermes/skills/gstack-plan-ceo-review/SKILL.md`、`~/.hermes/skills/plan-ceo-review/SKILL.md`、`~/gstack/.hermes/skills/*/SKILL.md` 和 gstack checkout 生成路径。Superpowers 方法论优先使用 `~/.codex/skills/superpowers/{brainstorming,systematic-debugging}/SKILL.md`，找不到时再查 Codex plugin cache 或 `AXIS_CODEX_SUPERPOWERS_SOURCE`。注入内容会做长度上限保护、二进制跳过和明显密钥片段 redaction；`axis work --json` 的每个 refine result 会返回 `methodologySkill`、`methodologySource`、`methodologyPath`、`methodologyInjected`、`methodologyWarning` 和 `methodologyTruncated`。

worker prompt 会把交互式方法论改成一次性自动输出：Agent 不得向用户提问或停下来等确认；如果方法论原本要提问，必须把问题写进 artifact markdown 的 structured Decision block，列出 options、明确 recommended option 和 rationale，然后在同一轮里按 recommended option 继续生成并上传。多个可行路径会被追加/更新到 `可选方案 / 推荐方案` 章节，并标出推荐方案。Hub seed/context 里如果带有已有 document、sourceArtifact、artifact、markdown、selectedOption、feedback 等字段，worker 会把它当成用户编辑反馈来重新 review/refine；用户已经改写或选择的方案优先保留，仍有歧义时继续给出可选方案并选一个推荐默认值。

启动 worker 前会检查本机前置条件：gstack/Hermes skill docs、Codex Superpowers skills。缺失时 CLI 会做 best-effort 用户本地安装/修复：更新或 clone `~/gstack`，执行 `bun install` 和 `bun run gen:skill-docs --host hermes`，复制 `~/gstack/.hermes/skills` 到 `~/.hermes/skills`，把 `bin`/`browse`/`ETHOS.md` 链到 `gstack*` skill 目录，并把 Codex Superpowers plugin cache 中的 skills 链接或复制到 `~/.codex/skills/superpowers`。网络命令会继承代理环境，并在未设置时使用 NAS 默认代理 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7890`、`ALL_PROXY=socks5://127.0.0.1:7891`。这些修复只在 `axis work once --spawn` 或 `axis work loop` 且存在待 refine seeds 时发生；普通 `axis-ide` / `axis-req` / `axis-bug` / `axis-sug` 的 `"text"` 入口仍然只提交 raw seed，不启动 Agent。

### 绑定本地目录

```bash
axis bind
```

`bind` 需要已经登录；如果本地没有 session，或 cached token 被 AxisNode 返回 401/403 拒绝，CLI 会提示重新执行 `axis login` 或联系 owner/admin 授权。

`bind` 会先确认绑定目标：

- 单个项目 repo：选择产品线，再选择项目，写入当前 repo 的 `.axis/project.json (or legacy .orbit/project.json)`
- 产品线根目录：选择产品线，写入根目录 `.axis/product-line.json (or legacy .orbit/product-line.json)`，扫描直接子目录并逐个绑定或跳过

绑定 JSON 会写入 `backendUrl`、登录/session 信息、产品线/项目 id/name、`repo`、`owner` 和更新时间。`mcpUrl` 默认不再写入；只有显式传 `--mcp-url`，或已有绑定里本来有 `mcpUrl` 时才会保留。

旧的 `axis init-product-line` 仍作为兼容入口保留，行为等同于产品线根目录绑定；新使用方式请优先用 `axis bind`。

### Pull 云端结构

```bash
axis pull
```

`pull` 需要已经登录；它会复用并校验 cached session，选择拉取全部产品线或某一个产品线，然后在当前目录下用安全 slug 创建产品线和项目目录。只有项目维护了 clone URL 时才会创建本地项目目录：`repositoryAddress`、`repositoryUrl`、`gitUrl`、`remoteUrl`、`githubRepo` 或 `sourceRepo`。仅有旧机器上的绝对 `repoPath` 不会被当成可 clone 地址。

- 目标目录不存在或为空：执行 `git clone`
- 目标目录已经是 git repo：执行 `git fetch --all --prune` 和 `git pull --ff-only`
- 目标目录非空且不是 git repo：不覆盖，不写入绑定配置，并在 summary 中标记跳过 clone
- 项目没有 clone URL：标记为 `skipped-no-repo`，不创建项目目录或 `.axis/project.json (or legacy .orbit/project.json)`

`pull` 只会在该产品线至少有一个项目成功 clone/pull 后写产品线目录的 `.axis/product-line.json (or legacy .orbit/product-line.json)`，并只为成功 clone/pull 的项目写 `.axis/project.json (or legacy .orbit/project.json)`。owner 默认使用当前登录账号；`mcpUrl` 同样只在显式传入时写入。

### AxisNode MCP

安装 AxisNode HTTP MCP 到 Hermes：

```bash
axis mcp install \
  --backend-url http://117.72.14.134:18081 \
  --mcp-url http://117.72.14.134:18081/api/mcp
```

默认写入 `~/.hermes/config.yaml` 的 `mcp_servers.orbit`，并把 `backendUrl`、`mcpUrl`、`hermesConfigPath`、`mcpServerName` 同步保存到 `~/.orbit/config.json`。测试或临时环境可以用 `--config <path>` 指向独立 Hermes 配置文件。

MCP install 是独立步骤，仍允许使用显式 `--mcp-url`，未传时会用 `<backend-url>/api/mcp` 安装 Hermes MCP。这个默认值只用于 `mcp install`，不会让 `init`、`bind` 或 `pull` 默认写入绑定 JSON。

### 单独安装技能

也可以单独安装技能：

```bash
axis install --agent all
axis install --agent codex
axis install --agent claude-code
axis install --agent cc
```

`axis install` 默认等同于 `--agent all`。如果目标文件已经存在且内容一致，会直接跳过；如果目标文件被本地修改过，默认拒绝覆盖，传 `--force` 才会替换。这个不覆盖规则同样适用于 `gstack-office-hours` 依赖技能。

清理缓存登录：

```bash
axis me
axis logout
axis logout --backend-url http://117.72.14.134:18081
```

可选高级用法：自动化脚本仍可直接传 UUID 绑定，不进入交互提示。

```bash
axis project bind \
  --repo /path/to/repo \
  --product-line-uuid <product-line-uuid> \
  --project-uuid <project-uuid> \
  --owner <owner>
```

绑定会写入 `/path/to/repo/.axis/project.json (or legacy .orbit/project.json)`。字段包括 `backendUrl`、登录/session 信息、`account`、`user`、`productLineUuid`、`productLineId`、`productLineName`、`projectUuid`、`projectId`、`projectName`、`repo`、`owner`、可选 repo 地址、可选 skill 路径和 `updatedAt`。`mcpUrl` 只有显式传入或已有绑定中存在时才会写入。高级 `project bind` 会继续写入 UUID 和兼容 ID 字段；如果已有配置里存在旧字段 `productLineId` / `projectId`，重新绑定时会保留这些字段用于兼容旧工具。

产品线和项目元数据只写入当前目录的 `.axis/product-line.json (or legacy .orbit/product-line.json)` / `.axis/project.json (or legacy .orbit/project.json)`；`~/.orbit/config.json` 只保存登录、后端地址、MCP 和默认 agent/skill 等全局 CLI 配置。

高级 UUID 示例：

```bash
axis project bind \
  --repo /home/jasperWei/orbit/axis-tools \
  --backend-url http://117.72.14.134:18081 \
  --product-line-uuid 8f938fdc-f2be-44d6-8c48-91bc9156836d \
  --project-uuid 71533d74-80e3-4e7e-adbb-69c42a25db0c \
  --owner jasper
```

本地开发示例：

```bash
axis login \
  --backend-url http://127.0.0.1:18081

axis init \
  --repo /home/jasperWei/orbit/axis-tools \
  --backend-url http://127.0.0.1:18081

cd /home/team/orbit/product-line-root
axis bind \
  --root /home/team/orbit/product-line-root \
  --backend-url http://127.0.0.1:18081 \
  --owner jasper
```

查看绑定：

```bash
axis project show --repo /path/to/repo
axis project show --repo /path/to/repo --json
```

## WorkItem 生命周期

`axis` CLI 目前只负责本地 CLI、Hermes MCP 配置和 repo 绑定；没有实现 `claim/start/complete` 这类生命周期 CLI 子命令。模型或 CLI 侧应通过已配置的 AxisNode MCP server 调用 AxisNode 工具，或直接调用 AxisNode backend API。

MCP 工具：

- `orbit_work_items_list`: 列出项目池。参数：`{ "projectId": "<projectUuid>", "pool": "requirement|bug|improvement" }`
- `orbit_work_item_lifecycle`: 更新 WorkItem 生命周期。参数：`{ "workItemId": "<workItemId>", "action": "claim|assign|start|complete", "owner": "<owner>" }`

推荐流程：

1. 列池：分别调用 `orbit_work_items_list`，pool 为 `requirement`、`bug`、`improvement`。
2. 认领：对选中的 WorkItem 调用 `orbit_work_item_lifecycle`，`action: "claim"`。
3. 开发：开始需求/改进开发时调用 `orbit_work_item_lifecycle`，`action: "start"`。
4. 修复：BUG 池同样先 `claim` 再 `start`，并在说明里保留复现与修复证据。
5. 完成：验证通过后调用 `orbit_work_item_lifecycle`，`action: "complete"`。
6. 回写：在完成备注或关联记录里写回 branch/commit、验证命令和结果；当前 `orbit_work_item_lifecycle` 工具负责状态流转，详细 notes/writeback 能力以 AxisNode 当前 MCP/API 暴露为准。

对应 backend API：

```bash
curl -sS 'http://117.72.14.134:18081/api/projects/<projectUuid>/work-items?pool=bug'

curl -sS -X POST 'http://117.72.14.134:18081/api/work-items/<workItemId>/claim' \
  -H 'content-type: application/json' \
  -d '{"owner":"codex-agent"}'

curl -sS -X POST 'http://117.72.14.134:18081/api/work-items/<workItemId>/start' \
  -H 'content-type: application/json' \
  -d '{"owner":"codex-agent"}'

curl -sS -X POST 'http://117.72.14.134:18081/api/work-items/<workItemId>/complete' \
  -H 'content-type: application/json' \
  -d '{"owner":"codex-agent"}'
```

## 本地自测

```bash
cd /home/jasperWei/orbit/axis-tools
npm run test:mcp
npm run test:sample
```

预期：
- `test:mcp` 会在临时目录验证 Hermes JSON/YAML 配置写入和 `.axis/project.json (or legacy .orbit/project.json)` 绑定
- `/home/jasperWei/orbit/axis-hub/.codex-status/latest.json` 被写入
- `/home/jasperWei/orbit/axis-hub/.codex-status/events.jsonl` 被追加
- current / tail / summary 都能读取 `--repo /home/jasperWei/orbit/axis-hub`

## 接入 Codex hook

### 方式一：一键安装脚本（推荐）

```bash
cd /home/jasperWei/orbit/axis-tools
bash scripts/install-codex-hook.sh
```

卸载：

```bash
cd /home/jasperWei/orbit/axis-tools
bash scripts/uninstall-codex-hook.sh
```

### 方式二：在你的 Codex 插件里声明 hooks.json
把 `examples/hooks.json` 的内容放进你的插件目录，并让 `plugin.json` 指向：

```json
{
  "hooks": "./hooks.json"
}
```

### 方式二：把命令改成绝对路径，减少 PATH 依赖
如果担心 Codex hook 环境拿不到 `axis`，把 `examples/hooks.json` 里的 command 改成：

```bash
node /home/jasperWei/orbit/axis-tools/dist/cli.js codex-hook ingest
```
```

这样不依赖 `npm link`。

## 当前 phase 推导规则

- `SessionStart` -> `starting`
- `UserPromptSubmit` -> `waiting_prompt`
- `PermissionRequest` -> `waiting_permission`
- `PreCompact` / `PostCompact` -> `compacting`
- `Stop` -> `stopped`
- `Read/Grep/Glob/Search` -> `reading`
- `Write/Edit/Patch` -> `editing`
- `pytest/test/jest/vitest/mocha` -> `testing`
- `Bash/Shell/Command/npm/pnpm/yarn/node` -> `executing`

## 已知边界

- 这是 **粗粒度进度监控**，不是完整任务 telemetry。
- 目前没有统一文件级变更追踪；如需精确文件列表，要再解析 `tool_input/tool_response` 或补 `git diff`。
- `Stop` 只能表示一次停止/结束检查，不等于官方专门的任务完成事件。

## 下一步建议

- 加 `session` 子目录做多会话聚合
- 加 `watch` 命令持续刷状态
- 加 `--repo auto` 智能回落
- 加 Claude Code adapter
- 让 AxisNode 直接读取 `.codex-status/latest.json`
