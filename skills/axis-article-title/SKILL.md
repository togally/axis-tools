---
name: axis-article-title
description: Use when the user asks to generate, refine, score, or learn from article titles and title performance feedback. / 用于生成、优化、评分并沉淀文章标题偏好和发布数据反馈。
---

# Article Title Skill

Use this skill to generate, refine, score, and learn from article titles. It is designed for recurring content work where the user's title preferences and later publishing feedback should improve the next round of titles.

Keep the reusable skill public-safe. Do not embed private account strategy, private repository paths, customer names, credentials, raw analytics exports, platform cookies, or unpublished business secrets in the skill bundle. Task-specific preferences and metrics belong in the active content asset or local workspace, not in this public skill text.

## When To Use

- The user asks to 起标题, 改标题, 标题优化, 标题库, 公众号标题, 小红书标题, 知乎标题, B 站标题, article title, headline, hook, or title A/B options.
- The user wants title candidates for an article idea, topic brief, mother draft, platform draft, video script, carousel, or published content follow-up.
- The user gives corrections such as "这个太生硬", "更口语", "要蹭热点", "不要挂靠这个模型", "保留这几个字", or asks the agent to remember title preferences.
- The user provides publishing feedback such as reads, impressions, open rate, click-through rate, likes, favorites, comments, follows, homepage visits, shares, completion rate, or qualitative reader objections.

Do not use this skill for writing the whole article unless the user also asks for drafting. Pair it with a content-creation skill when the task includes topic brief, mother draft, and platform-specific copy.

## Title Input Contract

Before generating titles, gather or infer the smallest useful input set:

- Article subject, core claim, target reader, and platform.
- The current draft title, if any.
- The user's literal wording that must be preserved.
- Facts that require source support, especially title claims such as "first", "best", "比肩", "暴涨", "爆了", or named competitor comparisons.
- Desired tone: direct, sharp, explanatory, practical, contrarian, data-driven, calm, or conversational.
- Forbidden tone: hype, anxiety, fake certainty, clickbait, awkward jargon, private account strategy, or claims unsupported by the article.
- Publishing stage: idea, draft, scheduled, published waiting 24h, published waiting 72h, or post-feedback revision.

If the user has already supplied enough context, do not slow the work with a form. State the assumptions and generate a focused set of candidates.

## Preference Memory

At the start of each use, look for existing preference and title-feedback records in the active workspace. Prefer files near the content task, then shared knowledge files:

- `content/<article-name>/data/title-feedback.md`
- `content/<article-name>/data/deposition.md`
- `content/<article-name>/decisions.md`
- `knowledge/patterns/index.md`
- `knowledge/platform-notes/index.md`
- `knowledge/objections/index.md`
- `.axis/title-feedback/`

Apply stable preferences directly. Treat candidate preferences as constraints to test. Treat raw single-use observations as reminders, not permanent rules. Use `raw / candidate / stable` labels consistently so title learning can become stricter only after enough evidence.

Preserve the user's latest title correction literally. If the user changes a title from one phrasing to another, do not drift back to the older phrasing in later candidates unless explicitly asked.

## Candidate Generation

Produce title candidates in distinct groups instead of a flat list when useful:

- Direct practical: clear benefit and topic.
- Curiosity gap: one tension or unanswered question without fake suspense.
- Contrarian: challenges a common mistake.
- Hotspot bridge: connects a current event to a durable lesson.
- Comparison: compares models, tools, companies, or approaches only when the article supports it.
- Platform-native: adjusted for WeChat, Xiaohongshu, Zhihu, Bilibili, or Douyin.

For each group, keep candidates short enough for the target platform and avoid repeating the same syntactic pattern. Include one recommended title and explain why it fits the user's stated preference.

## Title Scoring

Score shortlists when the user needs a decision. Use a 100-point rubric:

| Dimension | Points | Meaning |
| --- | ---: | --- |
| Positioning fit | 20 | Matches the account, series, and target reader. |
| Clarity | 20 | Reader can immediately tell what the article is about. |
| Curiosity / tension | 20 | Gives a reason to click without fake suspense. |
| Platform fit | 15 | Uses the right density and style for the platform. |
| Evidence safety | 15 | Claims are supportable by the article or marked for verification. |
| User preference fit | 10 | Respects the user's latest title corrections and style preference. |

Flag risky claims separately from the score. For example, a title can be strong but require source support before publishing.

## Feedback Deposition

After each title-selection or title-feedback interaction, decide whether there is reusable learning to record.

Write task-local records first when a content directory exists:

```text
content/<article-name>/data/title-feedback.md
```

Use this compact structure:

```markdown
# Title Feedback

## Title Decision

| Field | Value |
| --- | --- |
| Date | YYYY-MM-DD |
| Platform |  |
| Chosen title |  |
| Previous title |  |
| Rejected titles |  |
| User correction |  |
| Reason |  |
| Claims needing support |  |

## Preference Learning

- `raw`: <single observation>
- `candidate`: <repeated or high-confidence preference>
- `stable`: <preference proven across multiple uses or feedback cycles>

## Publishing Feedback

| Window | Impressions | Reads/Views | CTR/Open rate | Likes | Favorites | Comments | Follows | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 24h |  |  |  |  |  |  |  |  |
| 72h |  |  |  |  |  |  |  |  |

## Next Title Constraint

- <what to try next time>
```

When the learning is reusable across content tasks, also update one shared file if present:

- `knowledge/patterns/index.md` for title structures and stable phrasing patterns.
- `knowledge/platform-notes/index.md` for platform-specific title behavior.
- `knowledge/objections/index.md` for reader misunderstandings caused by title wording.

Do not record final publishing links, private analytics screenshots, account strategy, or personal identifiers unless the active private asset workflow explicitly asks for them.

## Feedback Optimization Rules

- Do not overfit to one weak sample. A low 24h read count without impressions/open-rate data is not enough to declare a title pattern bad.
- Separate distribution problems from title problems. Low reads may come from low impressions, weak opening, wrong platform, timing, or topic mismatch.
- Prefer rate metrics when available: CTR, open rate, read-through, favorite/view, comment/view, follow/view.
- Record exact user corrections as stronger evidence than model preference.
- Upgrade a preference from raw to candidate only after repeated corrections or meaningful data. Upgrade to stable only after multiple posts or explicit user confirmation.
- Keep old preferences reversible. If a later correction conflicts with an older rule, write the conflict and use the latest user correction for the current task.

## Output Format

For a normal title request:

1. State the assumed platform and reader in one line.
2. Provide 8-12 candidates grouped by style when useful.
3. Recommend 1-3 titles with short reasons.
4. Flag claims that need fact support before publishing.
5. Ask for the user's pick or correction only if needed before platform-specific drafting.

For feedback review:

1. Summarize the selected title and available data.
2. Separate what the data proves from what remains ambiguous.
3. Record raw/candidate/stable learning.
4. Suggest the next title constraint and one or two title variants to test.

## Public-Safe Boundary

This public skill teaches the workflow. It must not contain the user's private title preferences, private account names, analytics exports, platform cookies, customer names, or unpublished business details. Store those only in the active private content asset, local workspace, or memory system selected by the user.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
