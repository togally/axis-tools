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
- `orbit-tools init`
  - 完整交互式初始化当前 repo：登录 Orbit Hub、选择产品线、选择项目、选择 Agent，并安装 orbit-tools skill
  - 同一 `backendUrl` 的登录会缓存到 `~/.orbit/config.json`，后续初始化默认复用 session
  - 写入 `<repo>/.orbit/project.json`
- `orbit-tools init-product-line`
  - 从产品线根目录运行：登录 Orbit Hub、选择产品线、扫描当前根目录下一层子目录
  - 对每个子目录逐个选择绑定到该产品线下的项目，或明确 skip
  - 写入根目录 `.orbit/product-line.json`，并为已绑定子目录写入 `<child>/.orbit/project.json`
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

## Orbit MCP 与项目绑定

安装 Orbit HTTP MCP 到 Hermes：

```bash
orbit-tools mcp install \
  --backend-url http://117.72.14.134:18081 \
  --mcp-url http://117.72.14.134:18081/api/mcp
```

默认写入 `~/.hermes/config.yaml` 的 `mcp_servers.orbit`，并把 `backendUrl`、`mcpUrl`、`hermesConfigPath`、`mcpServerName` 同步保存到 `~/.orbit/config.json`。测试或临时环境可以用 `--config <path>` 指向独立 Hermes 配置文件。

把 repo 绑定到 Orbit Hub 的产品线和项目。推荐主流程是 `orbit-tools init`：首次针对某个 `backendUrl` 运行时输入 Orbit 账号/密码，CLI 调用共享 backend 的 `/api/login`；当前登录是模拟实现，只要求账号密码非空，并返回固定 `token/key/session` 与用户信息。登录成功后 session 会按 `backendUrl` 缓存到 `~/.orbit/config.json`，后续 `init` / `init-product-line` 使用同一个 backend 时会直接复用，不再提示账号密码。传 `--login` 或 `--force-login` 可强制重新登录。随后 CLI 会先选产品线，再选该产品线下的项目，最后选择 Agent。`orbit-tools setup` 仅作为旧脚本兼容别名保留。

```bash
orbit-tools init
```

CLI 默认绑定当前目录，owner 默认使用登录的 Orbit 账号。它会从共享 Orbit Hub backend `http://117.72.14.134:18081` 读取 `/api/products`，列出产品线；选中产品线后读取 `/api/products/<product-line-id>`，列出该产品线下的项目。默认 MCP URL 是 `<backend-url>/api/mcp`。`--backend-url` 和 `ORBIT_BACKEND_URL` 仍可覆盖 backend，本地开发和测试请显式传本机地址。

Agent 选择支持 `Codex`、`Claude Code/cc` 或 `None`。安装器会把本仓库的所有 `skills/*/SKILL.md` 复制到稳定路径 `~/.orbit/skills/<skill>/SKILL.md`；选择 Codex 时也复制到 `~/.codex/skills/<skill>/SKILL.md`，选择 Claude Code/cc 时复制到 `~/.claude/skills/<skill>/SKILL.md`。安装 `oribit-idea` 时，还会为选中的 Agent 目标确保 `gstack-office-hours` 依赖技能存在：优先复制本机 Hermes 的 `~/.hermes/skills/gstack-office-hours/SKILL.md`，不存在时写入最小依赖说明。这些路径会写入本地绑定和 `~/.orbit/config.json`，不会清空其他技能目录。

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

绑定会写入 `/path/to/repo/.orbit/project.json`。`orbit-tools init` 写入字段包括 `backendUrl`、`mcpUrl`、`token`、`key`、`session`、`account`、`user`、`productLineUuid`、`productLineId`、`productLineName`、`projectUuid`、`projectId`、`projectName`、`repo`、`owner`、`selectedAgent`、`skillPath`、`agentSkillPath`、`updatedAt`。高级 `project bind` 会继续写入 UUID 和兼容 ID 字段；如果已有配置里存在旧字段 `productLineId` / `projectId`，重新绑定时会保留这些字段用于兼容旧工具。

产品线根目录可以用 `orbit-tools init-product-line` 一次绑定多个子项目。默认从当前目录运行，也可用 `--root <root-path>` 指定产品线根目录。CLI 会复用同一 backend 的缓存登录；没有缓存时才提示账号密码。读取产品线列表，选择产品线后写入 `<root>/.orbit/product-line.json`，字段包括 `backendUrl`、`mcpUrl`、`token`、`key`、`session`、`account`、`user`、`productLineUuid`、`productLineId`、`productLineName`、`rootPath`、`updatedAt`。

随后 CLI 扫描根目录的直接子目录作为候选项目，排除隐藏目录、`.git`、`node_modules`、`dist`、`build`、`cache`。有 `package.json`、`tsconfig.json`、`pyproject.toml`、`go.mod`、`Cargo.toml` 等标记的目录会显示对应 marker；没有 marker 的目录仍会出现，并标记为 `plain folder`。每个候选目录都会依次提示：选择该产品线下的一个项目完成绑定，或显式选择 `Skip` 后继续下一个目录。

```bash
cd /home/team/orbit/product-line-root
orbit-tools init-product-line
```

已绑定的子目录会写入 `<child>/.orbit/project.json`，字段与 `orbit-tools init` 的项目绑定一致，包括 `backendUrl`、`mcpUrl`、`token`、`key`、`session`、`account`、`user`、选中的产品线、选中的项目、`repo`、`owner`、`updatedAt`。默认不会为每个子目录要求 Agent 选择或安装 skill；只有显式传 `--agent codex`、`--agent claude-code`、`--agent cc` 或 `--agent none` 时，才会按 `init` 的逻辑复制全部 packaged skills，并在根配置和子项目配置里记录 `selectedAgent`、`skillPath`、`agentSkillPath`。命令末尾会打印 summary，包括 bound 数量、skipped 数量和写入的 config path。

示例：

```bash
orbit-tools init
```

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
orbit-tools init \
  --repo /home/jasperWei/orbit/orbit-tools \
  --backend-url http://127.0.0.1:18081 \
  --owner jasper

cd /home/team/orbit/product-line-root
orbit-tools init-product-line \
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
