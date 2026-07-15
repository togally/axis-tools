---
name: axis-doc-contract-review
description: Use when a user needs a Word/DOCX contract or user agreement reviewed comment by comment, revised with current legal grounds, and delivered as separate annotated-response and publication-clean files. / 用于逐条评审 Word/DOCX 合同或用户协议，依据现行法律修订，并分别交付批注回应版和清洁版。
---

# Axis Contract Review

## Use When

Use this skill when a user provides a Word/DOCX contract, user agreement, terms of service, or policy and needs an independently reviewable legal-drafting outcome:

- comment-by-comment assessment of whether each concern is meaningful and whether the marked clause is actually defective;
- revision notes, reasoning, and current legal grounds for substantive changes;
- a full-document review beyond the supplied comments;
- separate annotated response and publication-clean DOCX deliverables;
- deterministic OOXML checks plus rendered page inspection.

Use the general document skill for DOCX mechanics when available. This skill owns the contract-risk reasoning, legal-source discipline, response structure, and delivery acceptance criteria. Use `$axis-doc-development` for software requirements and engineering design documents instead.

## Do Not Use

Do not use this skill for legal representation, litigation strategy, a guarantee of compliance, typography-only editing, or final jurisdiction-specific conclusions when the target jurisdiction or material operating facts are unknown. If jurisdiction changes the answer and cannot be established from the document, ask before making a binding-law conclusion. Recommend qualified local counsel for regulated activity, multi-jurisdiction release, launch-critical uncertainty, or material unresolved risk.

## Inputs and Outputs

Required inputs are the source DOCX, target jurisdiction, review date, document purpose, contracting-party roles, target version, output location, and the user's clean-format profile. Gather related privacy terms, merchant terms, payment/refund flows, licensing facts, and platform procedures when they materially affect the clauses. Preserve missing entity data, licences, dates, addresses, contacts, or product capabilities as explicit placeholders rather than inventing them.

Default outputs are:

1. `annotated-response/`: an annotated response DOCX plus a review memo;
2. `clean/`: one publication-clean DOCX whose approved body matches the annotated version.

The clean filename must use the publication name and must not contain clean or 清洁版 unless the user explicitly requests that token. Never modify the supplied source file in place.

## Acceptance Checks First

Before editing, record the source hash, paragraph/table/comment/tracked-change counts, comment IDs and anchors including point comments, version labels, placeholders, expected folder and filename contract, and the agreed treatment of headings, warnings, hyperlinks, highlights, shading, and font colors. Write the final acceptance checks before creating the deliverables.

## Three-Step Work Contract

### 1. Co-create with the user

Confirm jurisdiction, party roles, intended operation, version, output structure, and publication blockers. Preserve the user's literal business wording once clarified. Render the source before evaluating it, and separate verified facts, reviewer inference, and missing facts.

### 2. Execute the result

Extract all comments and tracked changes, adjudicate every comment, revise proportionately, and then review the complete document for definitions, scope, consent, unilateral rule changes, account enforcement and appeal, fees/refunds, platform and counterparty liability, privacy, minors, content licensing, AI content, termination, notice, dispute resolution, cross-document consistency, and unresolved placeholders when applicable. Generate the annotated response, clean version, and review memo.

### 3. Verify and report

Run the legal-source, comment-coverage, OOXML, cross-version, rendering, filename, folder, and package-integrity checks below. Report exact counts, passed checks, unresolved facts, placeholders, publication blockers, and any advice that still requires qualified counsel.

## Comment-by-Comment Adjudication

For each source comment, answer two separate questions:

1. Is the concern meaningful or useful?
2. Is the marked clause actually defective under the document facts and applicable law?

Classify the decision as `accept`, `partially accept`, `reject`, or `needs facts`. Each row must contain the original comment and anchor, value assessment, defect judgment, decision, revised wording, modification note, reasoning, legal or contractual basis, and residual dependency. Use [review-matrix.md](references/review-matrix.md) for the detailed schema.

Every substantive modification needs an applicable authority or an explicit contractual-risk rationale. Label purely editorial changes as editorial with no legal rule invoked; never fabricate a citation for wording or typography.

## Legal Source Rules

- Determine the target jurisdiction and effective review date first.
- Because legal rules change, verify every legal claim against current official primary sources: enacted legislation, regulator publications, official court materials, or another authoritative first-party source.
- Record source title, provision, effective status, direct URL, retrieval date, and the exact proposition it supports.
- Distinguish binding law, regulatory guidance, draft rules, and reviewer inference. Do not present a draft, repealed rule, unofficial summary, or out-of-jurisdiction material as binding.
- Cite sources near the supported conclusion and keep quotations within applicable limits.

## Safety Rules

- Do not state that the agreement has zero legal risk or is conclusively compliant.
- Do not invent facts or silently broaden authorization beyond the user's request.
- Do not automatically accept every comment or optimize uniformly for one party; assess enforceability, fairness, operational truth, and allocation of responsibility.
- Preserve confidential source content locally and do not publish or upload it unnecessarily.
- Do not remove intentional legally significant formatting unless the clean-format profile requires it; distinguish review artifacts from deliberate headings, links, warnings, and placeholders.
- Stop and request direction when missing jurisdiction, licences, payment structure, party identity, or actual product behavior would materially change the revision.

## Validation

### Source and comment coverage

- The original source remains unchanged and its hash is recorded.
- Source comment count equals reviewed-comment count; every definition, range start/end, reference, and relationship is valid and unique.
- Point comments and range comments are both preserved in the annotated response.

### Publication-clean OOXML

- No comments part, comment relationship, comment range/reference, tracked insertion/deletion, or move revision remains.
- No review-only highlight, review-only shading, or review-only font colors remain under the agreed clean-format profile.
- Intentional heading, hyperlink, warning, and placeholder formatting matches the profile exactly.

Use `scripts/validate_agreement_docx.py` to compare packages, check comment anchors and tracked changes, forbid agreed review colors or shading, enforce filename tokens, and verify normalized text parity.

### Cross-version parity and delivery

- Normalized body and table text is identical between the annotated response and publication-clean version.
- Version labels, placeholders, operator names, and cross-document references are consistent.
- Annotated and clean deliverables live in separate folders; temporary renders and old delivery duplicates are not presented as final output.

### Rendering and package integrity

- Render every page of every deliverable and visually inspect at readable zoom.
- Check CJK font substitution, clipping, overlap, blank pages, broken tables, orphan headings, isolated final lines, orientation, margins, headers, footers, and page numbers.
- Open and parse each DOCX as a ZIP/OOXML package, reopen with a DOCX library when available, and record page, comment, placeholder, and validation counts.
- Use explicit font mapping when the renderer substitutes unavailable fonts.

## Light Adversarial Review

Keep challenge and critique below 30% of the interaction. Verify comments and user assumptions against the actual clause, document structure, operating facts, and current law. Surface blanket exclusions, absolute obligations, missing appeal/refund paths, conflicting definitions, unclear ownership, and unsupported compliance claims. Preserve clarified business semantics and execute decisively once evidence is sufficient.

## Model Reasoning Level

Default: `max`, because legal review is high stakes and law is time-sensitive. Downgrade to `high` for a narrow clause review with known jurisdiction and complete facts, or to `medium` only for formatting cleanup that makes no legal judgment. Do not upgrade without explicit stopping rules and current-source verification.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
