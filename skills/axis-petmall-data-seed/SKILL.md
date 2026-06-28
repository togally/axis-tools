---
name: axis-petmall-data-seed
description: Use when preparing PetMallPlatform test or benchmark data, seeding large users/orders/products/UGC/pets/merchants, rebuilding App Elasticsearch indices, or diagnosing MySQL and ES count mismatches.
---

# PetMall Data Seed

Use this skill to prepare or verify PetMall test and benchmark data without losing track of which MySQL database or Elasticsearch index received the rows. The repeatable pattern is: confirm target, dry-run, seed MySQL, rebuild ES from the same MySQL source, then prove counts on both sides.

## When to Use

- The user says `刷数据`, `生成10w用户`, `压测数据`, `测试库数据不对`, `ES里数据是对的`, `重建ES`, `商品/sku/订单/ugc/宠物/商家数据`, or asks whether benchmark data is representative.
- Work is in `PetMallPlatform` and touches scripts such as `seed_large_table_data.py`, `mass_register_members.py`, `seed_ugc_pet_demo_via_api.py`, or `rebuild_app_search_es.py`.
- The goal is test/staging data for API benchmarks, ES search verification, large-table query tests, or local startup checks.

Do not seed production by default. If the user explicitly asks for production, restate the exact host, database, ES environment, and destructive scope before running writes.

## Workflow

1. Ground the checkout and current scripts.
   - Run `git status --short --branch`.
   - Inspect `scripts/` before writing anything new.
   - Prefer existing scripts over one-off SQL or temporary Python.

2. Confirm the target before any write.
   - MySQL: record host, port, database, user, and charset. Use `PETMALL_DB_HOST`, `PETMALL_DB_PORT`, `PETMALL_DB_NAME`, `PETMALL_DB_USER`, `PETMALL_DB_PASSWORD`, or explicit flags.
   - ES: record `ELASTICSEARCH_URIS`, username, project, and environment. The index prefix normally follows `petmall_<environment>_<index>`.
   - Run a read-only DB identity query such as `SELECT DATABASE()` and count current key tables.
   - If DB and ES disagree, assume wrong MySQL source/target until proven otherwise.

3. Dry-run first.

```bash
python3 scripts/seed_large_table_data.py \
  --host <mysql-host> --port <mysql-port> --database <db-name> \
  --user <user> --password '<password>' \
  --count 100000 --sample 3
```

For API-path member creation, use `mass_register_members.py`; for UGC/pet creation through normal business APIs, use `seed_ugc_pet_demo_via_api.py`. Both should start with `--dry-run` or a tiny sample before large runs.

4. Execute in bounded batches.

```bash
python3 scripts/seed_large_table_data.py \
  --host <mysql-host> --port <mysql-port> --database <db-name> \
  --user <user> --password '<password>' \
  --count 100000 --batch-size 1000 --execute
```

Keep output artifacts and success/failure JSONL files. Use resume flags when the script supports them instead of restarting blindly.

5. Rebuild ES from the same MySQL source.

```bash
python3 scripts/rebuild_app_search_es.py \
  --mysql-host <mysql-host> --mysql-port <mysql-port> --mysql-database <db-name> \
  --mysql-user <user> --mysql-password '<password>' \
  --es-uris <es-url> --es-username <es-user> --es-password '<es-password>' \
  --project petmall --environment test \
  --indices all --dry-run

python3 scripts/rebuild_app_search_es.py \
  --mysql-host <mysql-host> --mysql-port <mysql-port> --mysql-database <db-name> \
  --mysql-user <user> --mysql-password '<password>' \
  --es-uris <es-url> --es-username <es-user> --es-password '<es-password>' \
  --project petmall --environment test \
  --indices all --recreate --keyset --progress
```

Use the environment that matches the DB, for example `test` with `pet_mall_test`. Do not let ES rebuild default to localhost or the wrong prefix.

## Verification

- Run script tests when ES rebuild code changed:

```bash
python3 scripts/test_rebuild_app_search_es.py
```

- Count MySQL rows after seeding. Include representative tables such as `member`, `member_pet_profile`, `ugc_post`, `trade_order`, `mall_order`, `grooming_booking`, `health_queue_ticket`, `mall_product_spu`, and `mall_product_sku`.
- Count ES docs after rebuild, using the exact prefixed index names.
- Compare requested scale to actual counts. If the user requested `10w users`, verify user count and dependent rows such as pets, UGC, orders, and SKUs separately.
- Only run API benchmarks after DB and ES counts match the intended scale.

Before commit or push, stage only seed/rebuild scripts, tests, docs, or config actually changed:

```bash
git diff --cached --name-status
git diff --cached --check
```

## Common Mistakes

- Seeding `pet_mall` or another default database while the test app points to `pet_mall_test`.
- Rebuilding ES from one MySQL database while checking another database afterward.
- Trusting ES counts alone; ES can be correct even when the app DB target is wrong.
- Running large writes before a dry-run and a tiny sample.
- Forgetting `--environment`, causing ES index names to land under the wrong prefix.
- Treating generated benchmark data as production-realistic without explaining its distribution and hot-key limits.

## Acceptance Check

A complete PetMall seed run should report: exact MySQL target, exact ES target and index prefix, dry-run result, execute command, DB counts, ES counts, any failures/resume files, whether the scale matches the benchmark goal, and the staged-file scope if code changed.
