---
name: axis-ai-content-ops
description: Use when turning one AI or technical source idea into platform-native content, soft lead-in copy, publish tracking, and 24h/72h review. / 用于把一个 AI 或技术选题沉淀为多平台原生内容、柔性引导、发布记录和 24h/72h 复盘流程。
---

# AI Content Ops

Use this skill when a user wants to turn one source idea, source material, or published draft into a reusable personal AI content operation package across WeChat, Xiaohongshu, Zhihu, Bilibili, or similar platforms.

The goal is not to create spammy reposts. The goal is to preserve one clear idea, adapt it to each platform's native reading habit, publish with a light attribution path, and retain feedback as a data flywheel for the next iteration.

## Boundary

- Keep the workflow public-safe. Do not bake in personal account names, private screenshots, unreleased metrics, credentials, QR codes, private URLs, or platform cookies.
- Do not promise automated posting unless a real posting tool is available and explicitly requested. Default to producing ready-to-paste copy, asset briefs, image prompts, and a publish log.
- Avoid hard growth-hacking language unless the user explicitly asks for it. Prefer soft lead-in language such as same-name account cues, public experiment framing, open notes, or follow-up logs.
- Keep provocative viewpoints defensible. If the user wants heat or debate, sharpen the angle with evidence and trade-offs rather than unsupported personal, ethnic, medical, legal, or financial claims.
- When platform rules, product behavior, factual claims, or current market examples matter, verify with current official or primary sources where feasible and separate sourced facts from opinion.

## Core Outputs

Produce only the outputs the user needs, but keep this default package in mind:

```markdown
# Content Ops Package

## Positioning
- Public persona:
- Audience:
- Topic lane:
- Tone:
- Forbidden language:

## Mother Draft
- Working title:
- One-sentence thesis:
- Reader promise:
- Outline:
- Evidence or examples:
- Soft lead-in:

## Platform-Native Variants
### WeChat
### Xiaohongshu
### Zhihu
### Bilibili

## Visual Brief
- Cover or first-page text:
- Scene:
- Style:
- Avoid:
- Size:

## Publish Log
| Platform | Status | Published At | URL/ID | Hook | Soft Lead-In | 24h Data | 72h Data | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Data Flywheel
- Useful feedback:
- Unexpected objections:
- Reusable examples:
- Next iteration:
```

## Output Path Convention

For every single content run, write artifacts under:

```text
content/{article-name}/
```

Use the user's article title as `{article-name}` when it is filesystem-safe. If the title is too long or contains awkward punctuation, normalize it lightly while preserving the literal meaning.

Default structure:

```text
content/{article-name}/
  README.md
  content-stats.md
  source/
    mother-draft.md
  wechat/
    article-copy.md
  xiaohongshu/
    carousel-copy.md
  zhihu/
    answer.md
  bilibili/
    script.md
  assets/
    wechat/
    xiaohongshu/
    bilibili/
  data/
    publish-log.md
```

Only create platform folders that are actually used. Keep global logs or account-level files at the repository root, but create per-article slices under `content/{article-name}/data/`.

## Workflow

1. Frame the content lane.
   Clarify the user's public persona, target reader, platform list, topic, desired sharpness, and words to avoid. Preserve the user's literal naming and positioning choices once corrected. If a phrase makes the account feel too commercial, offer a calmer alternative.

2. Create the mother draft.
   Extract one central thesis from the source material. Build a compact mother draft with title options, opening hook, argument chain, examples, and a soft lead-in. Do not over-polish away the user's personal voice.

3. Adapt into platform-native variants.
   - WeChat: long-form structure, readable section rhythm, title, cover brief, collection/category suggestion, and closing note.
   - Xiaohongshu: 6 to 10 page carousel outline, per-page headline/body, caption, tags, and comment prompt. Keep each page visually scannable.
   - Zhihu: answer opener, stance, evidence chain, counterargument, concise close, and a soft identity line. Avoid obvious traffic diversion.
   - Bilibili: title, intro hook, talking points, chapter rhythm, and description if the user asks for video.

4. Add visual and asset direction.
   For covers or carousel images, specify size, main copy, secondary copy, realistic scene, style, color accents, and forbidden motifs. If a requested external tool is unavailable, state the blocker and provide a local or tool-agnostic fallback.

5. Plan soft lead-in.
   Use low-friction cues such as "same name across platforms", "public experiment notes", "follow-up review", or "I will keep updating this process". Avoid manipulative calls like "private message for materials" unless the user explicitly chooses that strategy and platform rules allow it.

6. Track publication.
   Create or update `content/{article-name}/data/publish-log.md` with platform, title, status, URL or placeholder, publish time, hook, soft lead-in, and metric slots. If there is also a global publish log, keep it as the cross-article index and mirror only the relevant per-article slice into the content folder. If automation tools are available and the user asks for reminders, schedule 24h and 72h review checkpoints.

7. Review the data flywheel.
   At 24h and 72h, collect views, reads, likes, comments, saves, shares, follows, useful replies, and objections. Convert the result into next topics, wording adjustments, examples to retain, and reusable lessons.

## Quality Gates

- One source idea should become one mother draft first, then platform variants. Do not rewrite separately from scratch for each platform unless the user asks.
- Each platform variant must feel native to that platform's consumption pattern.
- The soft lead-in should be present but not louder than the content.
- Strong factual claims must be sourced or softened.
- The publish log must include 24h and 72h slots when the user is actively publishing.
- Single-run artifacts must be placed under `content/{article-name}/` unless the user specifies another path.
- Asset briefs must include positive direction and explicit "avoid" constraints.
- Public-safe output must exclude account-private metrics, credentials, private URLs, cookies, and personal identifiers unless the user explicitly wants them in the current local artifact.

## Common Mistakes

- Treating "content ops" as copy-paste distribution instead of platform-native adaptation.
- Making every post sound like a course launch, recruitment funnel, or success story.
- Adding a hard lead-in that damages trust or violates platform norms.
- Hiding the user's useful rough edges behind generic marketing language.
- Keeping metrics only in chat instead of retaining them in a publish log.
- Skipping the 24h and 72h review, which breaks the data flywheel.

## Three-Step Work Contract

For coding and design work, run the workflow in three steps:

1. Co-create with the user: clarify what they want, preserve their exact business wording, identify acceptance criteria, and gather the code, schema, logs, docs, credentials, endpoints, or environment details needed to execute the next step.
2. Execute the result: implement the code change, write the design, or produce the requested artifact using the agreed scope and the repository's existing patterns.
3. Verify the result: run focused tests, validators, benchmarks, document checks, or review passes that prove the result matches the request, then report what passed and what remains unverified.

Keep light adversarial review to no more than 30% of the interaction. Calibrate it to the risk: challenge missing evidence, unsafe shortcuts, or unclear ownership, but do not let critique replace execution once the next step is sufficiently specified.

## Light Adversarial Review

For coding, architecture, optimization, testing, database, or design-document workflows, use a lightly adversarial stance: verify the user's goal against code or evidence, surface hidden assumptions, name correctness and risk trade-offs, and challenge unsafe shortcuts before implementing or finalizing. Keep it constructive and below 30% of the interaction: preserve the user's explicit business wording, avoid debate for its own sake, and become decisive once evidence is sufficient.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
