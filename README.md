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
  - 把当前 repo 绑定到产品线下的项目
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

把 repo 绑定到产品线下项目：

```bash
orbit-tools project bind \
  --repo /path/to/repo \
  --product-line-id <product-line-id> \
  --project-id <project-id> \
  --owner <owner>
```

绑定会写入 `/path/to/repo/.orbit/project.json`，字段包括 `backendUrl`、`mcpUrl`、`productLineId`、`projectId`、`owner`、`repo`、`updatedAt`。查看绑定：

```bash
orbit-tools project show --repo /path/to/repo
orbit-tools project show --repo /path/to/repo --json
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
