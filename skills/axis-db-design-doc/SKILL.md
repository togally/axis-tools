---
name: axis-db-design-doc
description: Use when the user asks for a database design document, data dictionary, schema design, ER/table structure documentation, or a Word DBDD using a formal or industry-standard template.
---

# Database Design Document

Use this skill to turn a codebase, schema dump, migration folder, or pasted table definition into a professional database design document. Keep this skill generic and public-safe; repository-specific table names, hostnames, customers, and business terms belong only in the generated document for that task.

## When to Use

- The user asks for a database design document, data dictionary, table-structure design, schema design, ER relationship summary, or DBDD.
- The user asks for a Word version of a database design document.
- The user asks to use an industry-standard or formal template.
- The source of truth is scattered across SQL migrations, ORM entities, mapper XML, DTOs, service code, or a pasted schema.

Do not use this for a tiny one-table explanation, a pure API document, a changelog, or a document that intentionally ignores database structure.

## Core Principle

Ground the document in the real schema first, then format it using a standard document structure. Do not turn an implementation story into a design document unless the user explicitly asks for migration history.

## Workflow

### 1. Ground the Schema

Inspect the live source of truth before writing:

- SQL DDL, migration scripts, seed scripts, and incremental ALTER files.
- ORM/entity classes and annotations.
- Mapper/query files when relationships or derived fields are not obvious from DDL.
- Service code for lifecycle rules, state transitions, computed fields, and fallback rules.
- Existing docs only as supporting context, not as final authority.

Separate these categories:

- persisted columns;
- indexes and constraints;
- logical relationships;
- status/enumeration values;
- derived fields that are not stored;
- lifecycle rules such as import, calculation, edit, archive, delete, and rebuild.

### 2. Choose a Standard Template

If the user names a standard, follow it. If they only ask for an industry-standard template, use a recognized database design document shape. A practical default is:

1. Document Control
2. Template Basis / References
3. Introduction
4. External Design
5. Structural Design
6. Operational Design
7. DDL / Migration Appendix
8. Design Notes and Risks

When standards or official links matter, verify them from current public sources before citing them.

### 3. Write the Design Content

Include the sections a reviewer naturally expects:

- document purpose, scope, terms, and references;
- table inventory with responsibility for each table;
- ER or relationship summary;
- common field conventions;
- per-table field dictionary with type, default, nullability, and description;
- per-table index dictionary;
- state machines and enum values;
- computed/derived field rules;
- statistics and aggregation口径 when relevant;
- data lifecycle and deletion/archive rules;
- security, privacy, audit, and operational notes;
- DDL script list or migration order.

Prefer final design wording. Avoid "we changed from X to Y" unless the user asks for migration notes.

### 4. Generate Word When Requested

For DOCX deliverables:

- Create a cover page, revision table, template/reference section, and table of contents.
- Use wide page layout when field dictionaries are large.
- Use consistent heading levels and readable table styling.
- Keep tables legible; split long tables naturally across pages.
- Keep generated artifacts under an output/doc-style directory when the workspace has no stronger convention.

Use available document tooling such as python-docx, LibreOffice, or the local document skill/tooling. Do not just rename Markdown to .docx.

### 5. Verify Before Delivery

Before claiming the Word document is ready:

- Open or parse the DOCX to confirm expected headings and table count.
- Render DOCX to PDF or page images when tooling is available.
- Inspect representative pages: cover, references/TOC, a dense field table, a lifecycle/statistics page, and the final page.
- Check for empty TOC placeholders, clipped table text, page-footer overlap, Markdown artifacts, and missing standard/template references.
- Clean temporary render files unless the user asks to keep them.

Report what was verified and where the final file was written.

## Acceptance Checklist

- The document is based on real schema/code evidence, not guesses.
- Persistent fields are distinguished from derived response/display fields.
- Table relationships and indexes are documented.
- The chosen standard/template basis is named and, when needed, linked.
- DOCX output is rendered or visually checked before delivery.
- The reusable skill content does not contain private project names, private paths, hostnames, credentials, or customer-specific facts.

## Common Mistakes

- Treating service-derived fields as database columns.
- Using a generic template without verifying the actual table DDL.
- Copying private table names or business details into the reusable skill itself.
- Leaving an empty auto-generated table of contents in the final Word document.
- Skipping visual review of dense tables.

## After Use Deposition

After using this skill, check whether the session produced reusable corrections, examples, validation commands, or edge cases. If yes, update the skill bundle, validate it, install or refresh the local copy, and push to the remote repository when permissions allow. If no reusable change exists, say that no skill update is needed.
