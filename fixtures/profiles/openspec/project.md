# Project Context

This is an `openspec/project.md`-shaped document. It carries project conventions
and narrative context, not requirements. It must produce zero requirement
candidates under the openspec profile even though several lines below open with
EARS keywords, because the locator targets only `### Requirement:` and
`#### Scenario:` blocks, never free prose.

## Overview

When the team plans a change, they write a proposal under `openspec/changes/`.
If a reviewer requests edits, the author revises the delta before archiving.
The system shall remain the source of truth for retention behavior; this
sentence is narrative and must not be extracted as a requirement.

## Conventions

- While a change is in review, keep its delta small and focused.
- Where a capability already exists, extend its spec rather than duplicating it.

## Example

```bash
openspec validate add-tiered-retention
```

The paragraph above and the fenced block are context only. No `### Requirement:`
heading opens a block here, so nothing on this page is a candidate.
