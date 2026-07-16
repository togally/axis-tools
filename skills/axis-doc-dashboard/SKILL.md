---
name: axis-doc-dashboard
description: Use when a user wants to start, open, or verify the local Axis document dashboard and its current-document or archive catalog. / 用于启动、打开或核验本地 Axis 文档看板及其当前文档与历史存档目录。
---

# Axis Document Dashboard

Start the read-only Axis document dashboard for one target repository. The standalone public application is <https://github.com/togally/axis-document-review>.

## When to Use

- The user wants to browse an Axis document catalog, current project knowledge, or archive history.
- The local dashboard application may need to be located, cloned after confirmation, or scaffolded from the bundled template.
- A published project needs a visual catalog, navigation, checksum, or archive-traceability check.

## Do Not Use

- Do not generate, reconcile, approve, publish, or mutate project documents.
- Do not configure an Axis project or infer OSS upload consent.
- Do not use this skill for an Alibaba Cloud observability dashboard.

## Inputs

- target Axis project repository;
- dashboard application directory, or `${AXIS_DOC_DASHBOARD_DIR:-~/Documents/axis/axis-document-review}`;
- source: `local`, `oss`, or `all`;
- host and port, defaulting to `127.0.0.1:4177`;
- explicit `pull_public_repo` or `build_local_template` choice when the application is missing.

## Outputs

- application state and source (`existing`, `pull_public_repo`, or `build_local_template`);
- preview URL, process/log location, and source health;
- current-document and archive catalog verification, including any partial provider or stale-instance warning.

## Safety and Boundaries

- Run `status` before any mutation. **Do not clone before confirmation.** Never treat silence as consent.
- `scaffold` may write only to a nonexistent or empty target directory; never overwrite an existing application.
- Bind to localhost by default. Never expose OSS credentials, tokens, private document bodies, or environment values to the page, logs, or report.
- Reuse a port only when its `/api/health` identifies a healthy instance for the intended project; otherwise select a free port.
- The dashboard is read-only. It never uploads, deletes, or rewrites local or OSS documents.

## Three-Step Work Contract

1. Assess. Resolve the target project and application directory, run `status`, and identify the intended source and port from evidence.
2. Execute. Start the existing application, or pause for the one missing-repository choice and follow only the confirmed clone or scaffold path.
3. Verify. Check health and catalog APIs, open the preview, and report the exact project, source health, current-document counts, archive counts, and residual gaps.

## Workflow

Use the installed skill directory as `<skill-dir>`:

```bash
python3 <skill-dir>/scripts/axis_doc_dashboard.py status
```

If `state: repo_missing`, ask once:

- `pull_public_repo`: clone the public repository so future `git pull` updates remain possible;
- `build_local_template`: scaffold locally from the bundled public template without a network clone.

After the choice:

```bash
python3 <skill-dir>/scripts/axis_doc_dashboard.py clone --target ~/Documents/axis/axis-document-review
python3 <skill-dir>/scripts/axis_doc_dashboard.py scaffold --target ~/Documents/axis/axis-document-review
```

Run only the selected command. Then start and open:

```bash
python3 <skill-dir>/scripts/axis_doc_dashboard.py start \
  --target ~/Documents/axis/axis-document-review \
  --project /path/to/axis-project \
  --source all --host 127.0.0.1 --port 4177 --open
```

The current local catalog comes only from `.axis/docs/orgs/`; archives come only from `.axis/docs/_archive/orgs/`. The current OSS catalog comes from the latest published `_sync/manifest.json`. Archives are exposed only through `历史追溯` and never enter current counts, search results, default opening, or adjacent-document navigation.

## Light Adversarial Review

Spend no more than 30% of the interaction checking for a wrong project path, an old process on the chosen port, an unconfirmed clone, an overwrite risk, leaked credentials, or a catalog not backed by the real API. Once these risks are resolved, start and verify decisively.

## Checks

```bash
curl --fail http://127.0.0.1:4177/api/health
curl --fail http://127.0.0.1:4177/api/catalog
```

- Catalog identity matches the expected bucket, organization, and project.
- `totals.documents` and `document_count` count only current documents; `archives` and `archive_count` remain separate.
- Business architecture, level-1 overviews, secondary designs, adjacent navigation, and return links resolve without 404s.
- Reader-facing evidence shows a basename and useful lower-level locator, not an unnecessary absolute path.
- Published current paths agree with `_sync/manifest.json`; retained legacy objects do not reappear as current documents.
- Missing OSS credentials may yield `partial`, but must never be reported as complete synchronization.

## After Use Deposition

Check whether the run revealed a reusable startup, port-selection, catalog, navigation, or archive-verification correction. If yes, update this public-safe bundle, validate it, refresh the local install, and push when authorized. Otherwise report that no skill update is needed.
