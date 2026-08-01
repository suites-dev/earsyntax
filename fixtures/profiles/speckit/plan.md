# Implementation Plan: Project Workspace Sharing

**Branch**: `014-workspace-sharing`

**Spec**: `specs/014-workspace-sharing/spec.md`

**Status**: Draft

## Technical Context

The workspace service already owns membership records. When the sharing feature
lands, it will reuse that table rather than introduce a parallel store. If the
audit-logging module is unavailable, the plan falls back to no-op recording so
the core invite flow still ships.

## Constitution Check

While the constitution requires every feature to stay testable in isolation,
this plan keeps invitation, role change, and audit logging on separate seams.
Where a gate would otherwise block the slice, the plan notes the exception here.

## Project Structure

```
specs/014-workspace-sharing/
  spec.md
  plan.md
  research.md
```

## Phase 0 - Research

The system shall reuse the existing email-identity provider. That sentence reads
like a requirement, but it lives in a plan narrative, not a Requirements
section, so the speckit locator must not treat it as a candidate.

## Phase 1 - Design Notes

When the design is settled, the team promotes these notes into the spec. Until
then nothing in this document is an EARS requirement and the extractor reports
zero candidates for it.
