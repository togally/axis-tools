---
name: axis-petmall-cache
description: Use when working in PetMallPlatform on backend cache design, Spring Cache/Redis query caching, cache eviction on writes, cache key/TTL rules, or explaining when cached data is created.
---

# PetMall Cache

Use this skill to add, repair, or explain PetMall backend cache behavior without turning cache work into a second architecture. The default pattern is Redis-backed Spring Cache: query methods populate cache on misses, and write methods evict stale keys.

## When to Use

- The user says `加缓存`, `查询缓存`, `缓存删除`, `缓存什么时候新增`, `Spring Cache`, `Redis缓存`, `缓存架构`, or asks whether an interface can be cached.
- Work is in `PetMallPlatform`, especially modules under `platform-app`, `platform-mall`, `platform-marketing`, `platform-social`, `platform-system`, or shared cache infrastructure.
- The endpoint is read-heavy and low-risk: home modules, categories, banners, product/detail/SKU/catalog data, shop/merchant basics, config/options, static menus, reviews, UGC detail/comments, or other catalog-like reads.

Do not cache by default for order submit, payment/callback, cart mutations, queue/ticket live state, login/session, uploads, admin audit writes, highly personalized data, or search ranking. For LBS queries with `lat/lng`, cache only the no-location path unless the key includes a deliberate location bucket.

## Workflow

1. Ground the repo first.
   - Run `git status --short --branch`.
   - Read existing cache constants in `platform-common/.../CacheNames.java`.
   - Search existing `@Cacheable`, `@CacheEvict`, `@Caching`, and cache contract tests before inventing a new style.

2. Pick cache targets conservatively.
   - Prefer service-layer `@Cacheable`, not controller-layer annotations, unless that is the established local pattern.
   - Cache only stable return shapes. Use `unless` to avoid caching `null` or empty results.
   - Include tenant/user/location/category parameters in the key when they affect the result. If the correct key is hard to define, skip caching.

3. Define cache names in `CacheNames`.
   - Use the repo format: `name#ttl#maxIdle#maxSize#localFlag`.
   - For Redis-only caches, keep `localFlag` as `0`.
   - Choose short TTLs for volatile pages and longer TTLs for catalog/config data.

4. Add write-side invalidation at every data producer.
   - Use `@CacheEvict` for one cache and `@Caching` when one write affects multiple caches.
   - If the mutation may not include the precise ID needed for the key, prefer `allEntries = true` over a fragile key.
   - Evict aggregate caches when child data changes. Example: SKU writes usually clear SKU cache and home/recommend aggregate caches.
   - When multiple read surfaces consume the same source table, evict all of them from the source write service.

5. Explain cache creation correctly.
   - Cache is "新增" lazily: first query misses Redis, method runs, Spring writes the result if `unless` allows it.
   - Write methods delete stale cache; the next read rebuilds it.

## Verification

Add or update reflection contract tests so cache annotations are not accidental. Prefer focused tests near the consuming module, for example `platform-modules/platform-app/src/test/java/com/whale/app/cache/` for App-facing caches. For shared/system caches, mirror the nearest existing contract-test style.

Useful PetMall commands:

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 17) /usr/local/maven/bin/mvn \
  -pl platform-modules/platform-app -am -Dmaven.test.skip=true install

JAVA_HOME=$(/usr/libexec/java_home -v 17) /usr/local/maven/bin/mvn \
  -pl platform-modules/platform-app \
  -DskipTests=false \
  -Dtest=AppCacheArchitectureContractTest,AppCacheArchitecturePhaseTwoContractTest,AppCacheArchitecturePhaseThreeContractTest \
  test
```

Before commit or push, run:

```bash
git diff --cached --name-status
git diff --cached --check
```

## Common Mistakes

- Adding `@Cacheable` without the matching write-side `@CacheEvict`.
- Caching user-specific, payment, order, cart, queue, or live operational state as if it were catalog data.
- Using a cache key that differs from method normalization, for example treating blank banner position differently from the default position.
- Evicting by `#bo.shopId` when update requests may only carry an entity ID.
- Staging unrelated long-lived dirty files in the PetMall worktree.

## Acceptance Check

A complete cache change should show: cache constants with TTL policy, read methods with deterministic keys and `unless`, write methods evicting all affected caches, focused cache contract tests passing, a correct explanation of lazy cache creation, and a staged diff containing only the intended cache files.
