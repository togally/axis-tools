---
name: axis-doc-dashbord
description: Use when a user wants to start and open the local Axis document dashboard, and the standalone application may need to be pulled or scaffolded first. / 用于启动并打开本地 Axis 文档看板；当独立应用不存在时，先让用户选择拉取公开仓库或使用内置模板本地自建。
---

# Axis Document Dashbord

启动只读的 Axis 文档看板，按 `bucket / organization / project` 查看本地与 OSS 当前文档，通过折叠树浏览业务架构、能力总览和二级能力设计，并通过独立“历史追溯”面板查阅 `_archive` 中的修订快照。独立应用公开仓库为 <https://github.com/togally/axis-document-review>。

## Three-Step Work Contract

1. **Assess**：确认目标项目路径，运行 `status` 检查独立应用是否已存在；明确数据源和端口，不猜测路径或配置。
2. **Execute**：应用存在时直接 `start`；应用不存在时执行下面的确认门，随后只走用户选择的 `clone` 或 `scaffold` 路径。
3. **Verify**：确认 `/api/health` 可访问、`/api/catalog` 分离返回当前文档与 `archives`，并打开 `http://127.0.0.1:<port>` 预览页面。

## Defaults

- 应用目录：`${AXIS_DOC_DASHBORD_DIR:-~/Documents/axis/axis-document-review}`。默认复用同一台电脑上的共享应用目录；只有显式设置环境变量时才改用其他位置。
- 项目目录：用户指定的 Axis 项目仓库；未指定时使用当前工作目录。
- 地址：`http://127.0.0.1:4177`。
- 数据源：`all`，即本地文档与项目配置声明的 OSS；健康 OSS 是默认跨组织/跨项目阅读源，本地仅用于当前仓库核验；凭据只留在本地服务进程。
- Dashboard 不后台轮询或自动替换正在阅读的文档。文档生产流程负责及时同步 OSS，用户需要时点击“刷新”重新读取所有 Provider。
- 本地当前文档只从 `.axis/docs/orgs/` 进入默认目录、搜索、计数和默认打开逻辑；OSS 当前文档以项目最新已发布的 `_sync/manifest.json` 为准，未被该 manifest 声明的旧对象不得混入当前列表。
- 存档只从 `.axis/docs/_archive/orgs/` 进入项目级 `archives`，通过当前文档的“历史追溯”按钮查阅，不得混入当前文档列表。

脚本路径：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py status
```

脚本未传 `--target` 时使用 `~/Documents/axis/axis-document-review`；如已设置 `AXIS_DOC_DASHBORD_DIR`，则优先使用该环境变量。

## Missing Repository Confirmation Gate

当 `status` 返回 `state: repo_missing` 时，只向用户发起一次合并确认，说明两个互斥选项：

- `pull_public_repo`：从公开仓库拉取，便于后续 `git pull` 更新。
- `build_local_template`：不联网拉取，使用 skill 内置公开模板在本地自建并启动。

**Do not clone before confirmation.** 不得在用户确认前运行 `clone`，也不得把“未回复”视为同意。用户表示“不拉取”“本地自建”或等价意思时，选择 `build_local_template`；用户明确同意拉取时，选择 `pull_public_repo`。

### 拉取公开仓库

仅在用户确认 `pull_public_repo` 后执行：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py clone \
  --target ~/Documents/axis/axis-document-review \
  --repo-url https://github.com/togally/axis-document-review.git
```

### 本地自建

用户选择 `build_local_template` 后执行：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py scaffold \
  --target ~/Documents/axis/axis-document-review
```

`scaffold` 只写入不存在或空的目标目录，不覆盖已有应用。

## Start And Open

应用就绪后安装缺失依赖、后台启动、等待健康检查并打开预览：

```bash
python3 <skill-dir>/scripts/axis_doc_dashbord.py start \
  --target ~/Documents/axis/axis-document-review \
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

检查 catalog 是否含预期的 bucket、organization、project。`totals.documents` 和项目 `document_count` 只统计当前文档，`archives` / `archive_count` 独立统计存档。对已发布 project-knowledge 项目，确认当前列表与 `_sync/manifest.json` 声明的项目文档一致，旧 `business/domains/` 等已迁移对象即使仍保留在 OSS 也不再出现。能力目录应按总览/二级文档折叠；业务架构应能进入能力总览，能力总览应能返回业务架构并切换相邻能力，二级文档应能返回能力总览并切换相邻二级能力。有历史的当前文档应显示“历史追溯”，可查看 revision、时间、修改原因和哈希，并可“返回当前版本”。默认项目选择、当前文档列表、搜索、复制、全屏和深链接不得被存档污染。

OSS 缺少凭据时可为 partial，但本地数据源应保持可用；不要把 partial 描述为全量同步成功。

## Light Adversarial Review

用不超过总工作量 30% 的时间检查：是否误用了别的项目目录、是否未经确认拉取、是否覆盖了用户已有目录、端口是否指向旧进程、页面是否暴露 OSS 凭据、catalog 是否来自真实 API。

## After Use Deposition

结束时记录：应用来源（已有、`pull_public_repo` 或 `build_local_template`）、应用目录、目标项目目录、预览 URL、数据源健康状态和验证结果。不得记录 AccessKey、Secret、Token 或文档私密正文。
