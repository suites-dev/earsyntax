# Feature Specification: Project Workspace Sharing

**Feature Branch**: `014-workspace-sharing`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Let a workspace owner invite teammates and control what they can edit."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Invite a teammate (Priority: P1)

A workspace owner opens the members panel and sends an invitation to a teammate email.
When the teammate accepts, they gain access at the role the owner chose.
While the invitation is pending, the owner can revoke it at any time.

**Why this priority**: Sharing is the core of the feature; nothing else is usable until an owner can bring a second person into a workspace.

**Independent Test**: Can be fully tested by inviting one teammate and confirming their access, without any other story implemented.

**Acceptance Scenarios**:

1. **Given** an owner on the members panel, **When** they invite a valid email, **Then** a pending invitation appears.
2. **Given** a pending invitation, **When** the teammate accepts, **Then** they receive the assigned role.

---

### User Story 2 - Adjust a member role (Priority: P2)

If a teammate needs broader access, the owner promotes them from viewer to editor.
Where the workspace has audit logging turned on, every role change is recorded for later review.

**Why this priority**: Role changes are common but the workspace is still viable with invite-only access if this ships later.

**Independent Test**: Can be tested by changing one member between roles and observing the effective permissions.

**Acceptance Scenarios**:

1. **Given** an editor and a viewer, **When** the owner swaps their roles, **Then** permissions swap accordingly.

---

### Edge Cases

- What happens when an invitation is sent to an email that already has access?
- When the last owner tries to demote themselves, the panel blocks the change to keep the workspace owned.
- How does the system handle an invitation link opened after it has expired?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system shall allow a workspace owner to invite a teammate by email address.
- **FR-002**: When a teammate accepts an invitation, the system shall grant them the role recorded on that invitation.
- **FR-003**: While an invitation is pending, the system shall allow the owner to revoke it.
- **FR-004**: Where the workspace has audit logging enabled, the system shall record every member role change.
- **FR-005**: If an owner attempts to demote the last remaining owner, then the system shall reject the change.

### Key Entities _(include if feature involves data)_

- **Workspace**: The shared container that members belong to; owns projects and the member roster.
- **Invitation**: A pending grant of access; carries the target email, the assigned role, and an expiry.
- **Membership**: The link between a person and a workspace, holding the effective role.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can invite a teammate in under 30 seconds from the members panel.
- **SC-002**: 95% of accepted invitations grant the correct role on the first attempt.

## Assumptions

- The existing authentication system supplies verified email identities.
- Cross-workspace sharing is out of scope for this version.
