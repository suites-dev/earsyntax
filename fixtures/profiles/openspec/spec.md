# Artifact Retention Specification

## Purpose

Define how the system retains, holds, replicates, and expires build artifacts so
that storage stays bounded while audit and compliance holds are honored. This is
a base capability spec in the shape of `openspec/specs/<capability>/spec.md`.

## Command Syntax

```bash
retain set-window <capability> --days 30
retain hold <artifact-id>
```

Options:

- `--days`: retention window length in days.
- `--force`: skip the confirmation prompt.

## Requirements

### Requirement: Artifact retention window

The system shall retain build artifacts for the configured retention window.

#### Scenario: Artifact within the retention window

- **WHEN** an artifact is younger than the retention window
- **THEN** the system retains the artifact and its metadata

### Requirement: Retention deadline on build completion

When a build completes, the system shall record the artifact retention deadline.

#### Scenario: Deadline recorded at completion

- **WHEN** a build finishes successfully
- **THEN** the system stores a retention deadline computed from the completion time
- **AND** the deadline is visible in the artifact metadata

### Requirement: Retention hold exemption

While a retention hold is active, the system shall exempt held artifacts from deletion.

#### Scenario: Hold blocks expiry

- **WHEN** a retention hold covers an artifact
- **AND** the artifact has passed its retention deadline
- **THEN** the system keeps the artifact until the hold is released

### Requirement: Remote replication of retained artifacts

Where remote storage is configured, the system shall replicate retained artifacts to the remote bucket.

#### Scenario: Replication to remote bucket

- **WHEN** remote storage is configured
- **AND** an artifact is retained
- **THEN** the system copies the artifact to the remote bucket

### Requirement: Expiry of overdue artifacts

If an artifact exceeds its retention deadline, then the system shall schedule the artifact for deletion.

#### Scenario: Overdue artifact scheduled for deletion

- **WHEN** an artifact is past its retention deadline
- **AND** no retention hold applies
- **THEN** the system schedules the artifact for deletion
