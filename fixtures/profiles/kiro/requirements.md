# Requirements Document

## Introduction

This document captures the requirements for the draft-sync feature of the
notes application. Each requirement pairs a user story with acceptance criteria
written in EARS notation, following the house style Kiro generates: all-caps
keywords, the literal phrase THE SYSTEM as the system name, and no comma after a
leading clause.

## Requirements

### Requirement 1

**User Story:** As a registered user, I want to sign in with my email and
password, so that I can reach my saved drafts from any device.

#### Acceptance Criteria

1. WHEN a user submits valid credentials THE SYSTEM SHALL establish an authenticated session.
2. WHEN a user submits an unrecognized email THE SYSTEM SHALL display a sign-in error that does not reveal which field was wrong.
3. IF five consecutive sign-in attempts fail THEN THE SYSTEM SHALL lock the account for fifteen minutes.

### Requirement 2

**User Story:** As an author, I want my work saved automatically, so that I do
not lose changes when the connection drops.

#### Acceptance Criteria

1. WHILE a background sync is in progress THE SYSTEM SHALL disable the manual save control.
2. WHERE offline mode is enabled THE SYSTEM SHALL queue outbound changes on the local device.
3. THE SYSTEM SHALL persist the working draft every thirty seconds.

### Requirement 3

**User Story:** As an author, I want to be told when a sync fails, so that I can
retry before closing the application.

#### Acceptance Criteria

1. WHEN a sync request returns a network error THE SYSTEM SHALL show a retry banner above the editor.
2. IF the retry banner is dismissed THEN THE SYSTEM SHALL schedule a silent retry after two minutes.
3. WHEN the access token expires THE SYSTEM SHALL redirect the author to the sign-in page.
