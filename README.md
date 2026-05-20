# orbit-tools

Orbit 的本地工具仓库，覆盖 **Codex progress monitor CLI** 和 Orbit MCP / 项目绑定配置。

## 当前能力

- `orbit-tools codex-hook ingest`
  - 从 Codex 官方 hook stdin JSON 读取事件
  - 写入 `<repo>/.codex-status/latest.json`
  - 追加 `<repo>/.codex-status/events.jsonl`
- `orbit-tools codex-status current`
  - 查看当前状态
- `orbit-tools codex-status tail`
  - 查看最近事件流
- `orbit-tools codex-status summary`
  - 输出简版摘要
- `orbit-tools mcp install`
  - 把 Orbit HTTP MCP 写入 Hermes 配置
  - 同步保存 `~/.orbit/config.json`
- `orbit-tools login`
  - 显式登录共享 Orbit Hub backend，缓存 bearer token/session
- `orbit-tools me`
  - 调用 `/api/me` 查看当前账号、显示名、角色和权限
- `orbit-tools init`
  - 选择 Agent，并安装 packaged skills
  - 不选择产品线/项目，也不写 `.orbit/project.json`
- `orbit-tools bind`
  - 绑定单个项目 repo，或绑定一个产品线根目录及其直接子目录
  - 写入 `.orbit/project.json` / `.orbit/product-line.json`
- `orbit-tools pull`
  - 从 Orbit Hub 拉取产品线/项目结构，在本地创建目录
  - 项目维护了 repo 地址时会 clone；已有 git repo 时会安全 fetch/pull
- `orbit-tools init-product-line`
  - 兼容旧入口；新文档推荐使用 `orbit-tools bind`
- `orbit-tools install`
  - 安装本包 `skills/*/SKILL.md` 到 `~/.orbit/skills`，并按 `--agent` 同步到 Codex / Claude Code skill 目录
- `orbit-tools logout`
  - 清理 `~/.orbit/config.json` 中缓存的登录 token/session
- `orbit-tools project bind`
  - 高级非交互式绑定命令，保留给自动化脚本使用
- `orbit-tools project show`
  - 查看当前 repo 的 Orbit 绑定

## 仓库结构

```text
orbit-tools/
├── examples/
│   ├── hooks.json
│   ├── sample-pretool.json
│   └── sample-posttool.json
├── skills/
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

```bash
cd /home/jasperWei/orbit/orbit-tools
npm install
npm run build
bash scripts/install-codex-hook.sh
```

如果你只想安装 CLI 而不立刻接 hook：

```bash
cd /home/jasperWei/orbit/orbit-tools
npm install
npm run build
npm link
```

安装后可直接用：

```bash
orbit-tools codex-status current --repo /home/jasperWei/orbit/orbit-hub
```

## Orbit 登录、初始化、绑定与 Pull

推荐新流程：

```bash
orbit-tools login
orbit-tools init
orbit-tools bind
```

账号创建只在 Orbit Hub Web UI 完成；CLI 不提供注册命令。

`login` 会调用 `/api/login`，把同一 backend 的 bearer token/session 缓存在 `~/.orbit/config.json`。`me` 会调用 `/api/me`，输出当前 account、displayName、role 和 permissions。

`init` 只处理 packaged skill 安装。它会提示选择 Agent：`Codex`、`Claude Code/cc` 或 `None`，并把本包 `skills/*/SKILL.md` 安装到 `~/.orbit/skills`，必要时同步到对应 Agent skill 目录。

`init` 不会询问产品线/项目，也不会写当前 repo 的 `.orbit/project.json`。项目或产品线绑定由 `bind` 完成。

### 绑定本地目录

```bash
orbit-tools bind
```

`bind` 需要已经登录；如果本地没有 session，或 cached token 被 Orbit Hub 返回 401/403 拒绝，CLI 会提示重新执行 `orbit-tools login` 或联系 owner/admin 授权。

`bind` 会先确认绑定目标：

- 单个项目 repo：选择产品线，再选择项目，写入当前 repo 的 `.orbit/project.json`
- 产品线根目录：选择产品线，写入根目录 `.orbit/product-line.json`，扫描直接子目录并逐个绑定或跳过

绑定 JSON 会写入 `backendUrl`、登录/session 信息、产品线/项目 id/name、`repo`、`owner` 和更新时间。`mcpUrl` 默认不再写入；只有显式传 `--mcp-url`，或已有绑定里本来有 `mcpUrl` 时才会保留。

旧的 `orbit-tools init-product-line` 仍作为兼容入口保留，行为等同于产品线根目录绑定；新使用方式请优先用 `orbit-tools bind`。

### Pull 云端结构

```bash
orbit-tools pull
```

`pull` 需要已经登录；它会复用并校验 cached session，选择拉取全部产品线或某一个产品线，然后在当前目录下用安全 slug 创建产品线和项目目录。项目维护了 `repositoryAddress`、`repoPath`、`repositoryUrl`、`gitUrl` 或 `remoteUrl` 时：

- 目标目录不存在或为空：执行 `git clone`
- 目标目录已经是 git repo：执行 `git fetch --all --prune` 和 `git pull --ff-only`
- 目标目录非空且不是 git repo：不覆盖，只写入/更新绑定配置并在 summary 中标记跳过 clone

`pull` 会为产品线目录写 `.orbit/product-line.json`，为项目目录写 `.orbit/project.json`。owner 默认使用当前登录账号；`mcpUrl` 同样只在显式传入时写入。

### Orbit MCP

安装 Orbit HTTP MCP 到 Hermes：

```bash
orbit-tools mcp install \
  --backend-url http://117.72.14.134:18081 \
  --mcp-url http://117.72.14.134:18081/api/mcp
```

默认写入 `~/.hermes/config.yaml` 的 `mcp_servers.orbit`，并把 `backendUrl`、`mcpUrl`、`hermesConfigPath`、`mcpServerName` 同步保存到 `~/.orbit/config.json`。测试或临时环境可以用 `--config <path>` 指向独立 Hermes 配置文件。

MCP install 是独立步骤，仍允许使用显式 `--mcp-url`，未传时会用 `<backend-url>/api/mcp` 安装 Hermes MCP。这个默认值只用于 `mcp install`，不会让 `init`、`bind` 或 `pull` 默认写入绑定 JSON。

### 单独安装技能

也可以单独安装技能：

```bash
orbit-tools install --agent all
orbit-tools install --agent codex
orbit-tools install --agent claude-code
orbit-tools install --agent cc
```

`orbit-tools install` 默认等同于 `--agent all`。如果目标文件已经存在且内容一致，会直接跳过；如果目标文件被本地修改过，默认拒绝覆盖，传 `--force` 才会替换。这个不覆盖规则同样适用于 `gstack-office-hours` 依赖技能。

清理缓存登录：

```bash
orbit-tools me
orbit-tools logout
orbit-tools logout --backend-url http://117.72.14.134:18081
```

可选高级用法：自动化脚本仍可直接传 UUID 绑定，不进入交互提示。

```bash
orbit-tools project bind \
  --repo /path/to/repo \
  --product-line-uuid <product-line-uuid> \
  --project-uuid <project-uuid> \
  --owner <owner>
```

绑定会写入 `/path/to/repo/.orbit/project.json`。字段包括 `backendUrl`、登录/session 信息、`account`、`user`、`productLineUuid`、`productLineId`、`productLineName`、`projectUuid`、`projectId`、`projectName`、`repo`、`owner`、可选 repo 地址、可选 skill 路径和 `updatedAt`。`mcpUrl` 只有显式传入或已有绑定中存在时才会写入。高级 `project bind` 会继续写入 UUID 和兼容 ID 字段；如果已有配置里存在旧字段 `productLineId` / `projectId`，重新绑定时会保留这些字段用于兼容旧工具。

高级 UUID 示例：

```bash
orbit-tools project bind \
  --repo /home/jasperWei/orbit/orbit-tools \
  --backend-url http://117.72.14.134:18081 \
  --product-line-uuid 8f938fdc-f2be-44d6-8c48-91bc9156836d \
  --project-uuid 71533d74-80e3-4e7e-adbb-69c42a25db0c \
  --owner jasper
```

本地开发示例：

```bash
orbit-tools login \
  --backend-url http://127.0.0.1:18081

orbit-tools init \
  --repo /home/jasperWei/orbit/orbit-tools \
  --backend-url http://127.0.0.1:18081

cd /home/team/orbit/product-line-root
orbit-tools bind \
  --root /home/team/orbit/product-line-root \
  --backend-url http://127.0.0.1:18081 \
  --owner jasper
```

查看绑定：

```bash
orbit-tools project show --repo /path/to/repo
orbit-tools project show --repo /path/to/repo --json
```

## WorkItem 生命周期

`orbit-tools` 目前只负责本地 CLI、Hermes MCP 配置和 repo 绑定；没有实现 `claim/start/complete` 这类生命周期 CLI 子命令。模型或 CLI 侧应通过已配置的 Orbit MCP server 调用 Orbit Hub 工具，或直接调用 Orbit Hub backend API。

MCP 工具：

- `orbit_work_items_list`: 列出项目池。参数：`{ "projectId": "<projectUuid>", "pool": "requirement|bug|improvement" }`
- `orbit_work_item_lifecycle`: 更新 WorkItem 生命周期。参数：`{ "workItemId": "<workItemId>", "action": "claim|assign|start|complete", "owner": "<owner>" }`

推荐流程：

1. 列池：分别调用 `orbit_work_items_list`，pool 为 `requirement`、`bug`、`improvement`。
2. 认领：对选中的 WorkItem 调用 `orbit_work_item_lifecycle`，`action: "claim"`。
3. 开发：开始需求/改进开发时调用 `orbit_work_item_lifecycle`，`action: "start"`。
4. 修复：BUG 池同样先 `claim` 再 `start`，并在说明里保留复现与修复证据。
5. 完成：验证通过后调用 `orbit_work_item_lifecycle`，`action: "complete"`。
6. 回写：在完成备注或关联记录里写回 branch/commit、验证命令和结果；当前 `orbit_work_item_lifecycle` 工具负责状态流转，详细 notes/writeback 能力以 Orbit Hub 当前 MCP/API 暴露为准。

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
cd /home/jasperWei/orbit/orbit-tools
npm run test:mcp
npm run test:sample
```

预期：
- `test:mcp` 会在临时目录验证 Hermes JSON/YAML 配置写入和 `.orbit/project.json` 绑定
- `/home/jasperWei/orbit/orbit-hub/.codex-status/latest.json` 被写入
- `/home/jasperWei/orbit/orbit-hub/.codex-status/events.jsonl` 被追加
- current / tail / summary 都能读取 `--repo /home/jasperWei/orbit/orbit-hub`

## 接入 Codex hook

### 方式一：一键安装脚本（推荐）

```bash
cd /home/jasperWei/orbit/orbit-tools
bash scripts/install-codex-hook.sh
```

卸载：

```bash
cd /home/jasperWei/orbit/orbit-tools
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
如果担心 Codex hook 环境拿不到 `orbit-tools`，把 `examples/hooks.json` 里的 command 改成：

```bash
node /home/jasperWei/orbit/orbit-tools/dist/cli.js codex-hook ingest
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
- 让 Orbit Hub 直接读取 `.codex-status/latest.json`
