---
name: axis-doc-dashbord
description: Use when a user wants to start and open the local Axis document dashboard, and the standalone application may need to be pulled or scaffolded first. / 用于启动并打开本地 Axis 文档看板；当独立应用不存在时，先让用户选择拉取公开仓库或使用内置模板本地自建。
---

# Axis Document Dashbord

启动只读的 Axis 文档看板，按 `bucket / organization / project` 查看本地与 OSS 文档。独立应用公开仓库为 <https://github.com/togally/axis-document-review>。

## Three-Step Work Contract

1. **Assess**：确认目标项目路径，运行 `status` 检查独立应用是否已存在；明确数据源和端口，不猜测路径或配置。
2. **Execute**：应用存在时直接 `start`；应用不存在时执行下面的确认门，随后只走用户选择的 `clone` 或 `scaffold` 路径。
3. **Verify**：确认 `/api/health` 可访问、`/api/catalog` 返回目录，并打开 `http://127.0.0.1:<port>` 预览页面。

## Defaults

- 应用目录：`${AXIS_DOC_DASHBORD_DIR:-~/axis-document-review}`。
- 项目目录：用户指定的 Axis 项目仓库；未指定时使用当前工作目录。
- 地址：`http://127.0.0.1:4177`。
- 数据源：`all`，即本地文档与项目配置声明的 OSS；凭据只留在本地服务进程。

脚本路径：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py status --target "$AXIS_DOC_DASHBORD_DIR"
```

若环境变量未设置，将 `--target` 替换为 `~/axis-document-review`。

## Missing Repository Confirmation Gate

当 `status` 返回 `state: repo_missing` 时，只向用户发起一次合并确认，说明两个互斥选项：

- `pull_public_repo`：从公开仓库拉取，便于后续 `git pull` 更新。
- `build_local_template`：不联网拉取，使用 skill 内置公开模板在本地自建并启动。

**Do not clone before confirmation.** 不得在用户确认前运行 `clone`，也不得把“未回复”视为同意。用户表示“不拉取”“本地自建”或等价意思时，选择 `build_local_template`；用户明确同意拉取时，选择 `pull_public_repo`。

### 拉取公开仓库

仅在用户确认 `pull_public_repo` 后执行：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py clone \
  --target ~/axis-document-review \
  --repo-url https://github.com/togally/axis-document-review.git
```

### 本地自建

用户选择 `build_local_template` 后执行：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py scaffold \
  --target ~/axis-document-review
```

`scaffold` 只写入不存在或空的目标目录，不覆盖已有应用。

## Start And Open

应用就绪后安装缺失依赖、后台启动、等待健康检查并打开预览：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py start \
  --target ~/axis-document-review \
  --project /path/to/axis-project \
  --source all \
  --host 127.0.0.1 \
  --port 4177 \
  --open
```

如果 Codex 提供浏览器控制能力，也可以在脚本启动成功后用浏览器工具打开返回的 `url`。不要用 `file://` 直接打开静态 HTML，因为目录和文档内容来自本地 API。

若端口已有健康实例，脚本复用该实例并返回 `state: running`。启动失败时读取 JSON 中的 `log` 路径，报告具体错误；不要伪造成功。

## Verification

至少完成：

```bash
curl --fail http://127.0.0.1:4177/api/health
curl --fail http://127.0.0.1:4177/api/catalog
```

检查 catalog 是否含预期的 bucket、organization、project。OSS 缺少凭据时可为 partial，但本地数据源应保持可用；不要把 partial 描述为全量同步成功。

## Light Adversarial Review

用不超过总工作量 30% 的时间检查：是否误用了别的项目目录、是否未经确认拉取、是否覆盖了用户已有目录、端口是否指向旧进程、页面是否暴露 OSS 凭据、catalog 是否来自真实 API。

## After Use Deposition

结束时记录：应用来源（已有、`pull_public_repo` 或 `build_local_template`）、应用目录、目标项目目录、预览 URL、数据源健康状态和验证结果。不得记录 AccessKey、Secret、Token 或文档私密正文。
