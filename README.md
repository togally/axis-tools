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
- `orbit-tools project bind`
  - 交互式选择产品线，再选择该产品线下的项目，把当前 repo 绑定到 Orbit Hub 项目
  - 写入 `<repo>/.orbit/project.json`
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
│   └── orbit-workflow/
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
  --backend-url http://127.0.0.1:3000 \
  --mcp-url http://127.0.0.1:3000/api/mcp
```

默认写入 `~/.hermes/config.yaml` 的 `mcp_servers.orbit`，并把 `backendUrl`、`mcpUrl`、`hermesConfigPath`、`mcpServerName` 同步保存到 `~/.orbit/config.json`。测试或临时环境可以用 `--config <path>` 指向独立 Hermes 配置文件。

把 repo 绑定到 Orbit Hub 的产品线和项目。推荐使用交互式两步流程：先选产品线，再选该产品线下的项目。

```bash
orbit-tools project bind \
  --interactive \
  --repo /path/to/repo \
  --owner <owner>
```

CLI 会从 `--backend-url` 或 `ORBIT_BACKEND_URL` 指向的 backend 读取 `/api/products`，列出产品线；选中产品线后读取 `/api/products/<product-line-id>`，列出该产品线下的项目。默认 backend 是 `http://127.0.0.1:3000`，默认 MCP URL 是 `<backend-url>/api/mcp`。

可选高级用法：自动化脚本仍可直接传 UUID 绑定，不进入交互提示。

```bash
orbit-tools project bind \
  --repo /path/to/repo \
  --product-line-uuid <product-line-uuid> \
  --project-uuid <project-uuid> \
  --owner <owner>
```

绑定会写入 `/path/to/repo/.orbit/project.json`，字段包括 `backendUrl`、`mcpUrl`、`productLineUuid`、`projectUuid`、`owner`、`repo`、`updatedAt`。如果已有配置里存在旧字段 `productLineId` / `projectId`，重新绑定时会保留这些字段用于兼容旧工具。

示例：

```bash
orbit-tools project bind \
  --interactive \
  --repo /home/jasperWei/orbit/orbit-tools \
  --backend-url http://127.0.0.1:18081 \
  --mcp-url http://127.0.0.1:18181/mcp \
  --owner jasper
```

高级 UUID 示例：

```bash
orbit-tools project bind \
  --repo /home/jasperWei/orbit/orbit-tools \
  --backend-url http://127.0.0.1:18081 \
  --mcp-url http://127.0.0.1:18181/mcp \
  --product-line-uuid 8f938fdc-f2be-44d6-8c48-91bc9156836d \
  --project-uuid 71533d74-80e3-4e7e-adbb-69c42a25db0c \
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
curl -sS 'http://127.0.0.1:18081/api/projects/<projectUuid>/work-items?pool=bug'

curl -sS -X POST 'http://127.0.0.1:18081/api/work-items/<workItemId>/claim' \
  -H 'content-type: application/json' \
  -d '{"owner":"codex-agent"}'

curl -sS -X POST 'http://127.0.0.1:18081/api/work-items/<workItemId>/start' \
  -H 'content-type: application/json' \
  -d '{"owner":"codex-agent"}'

curl -sS -X POST 'http://127.0.0.1:18081/api/work-items/<workItemId>/complete' \
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
