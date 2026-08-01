# Add tiered artifact retention

## Purpose

Introduce tiered retention windows and a pinning control, tighten the expiry
rule, and drop the legacy fixed-window guarantee. This is a change delta in the
shape of `openspec/changes/<change>/specs/<capability>/spec.md`.

## ADDED Requirements

### Requirement: Tiered retention windows

The system shall retain build artifacts for the retention window of their assigned tier.

#### Scenario: Tier window applied

- **WHEN** an artifact is assigned to a retention tier
- **THEN** the system applies that tier's retention window to the artifact

### Requirement: Manual artifact pinning

When an operator pins an artifact, the system shall retain the artifact until the pin is removed.

#### Scenario: Pinned artifact survives expiry

- **WHEN** an operator pins an artifact
- **AND** the artifact passes its tier retention window
- **THEN** the system keeps the artifact until the pin is removed

## MODIFIED Requirements

### Requirement: Expiry of overdue artifacts

If an artifact exceeds its tier retention window and is unpinned, then the system shall schedule the artifact for deletion.

#### Scenario: Overdue unpinned artifact scheduled for deletion

- **WHEN** an artifact is past its tier retention window
- **AND** the artifact is not pinned
- **THEN** the system schedules the artifact for deletion

## REMOVED Requirements

### Requirement: Artifact retention window

The system shall retain build artifacts for the configured retention window.
