# Design Document

## Overview

This design accompanies the draft-sync requirements. It is deliberately shaped
like a Kiro design.md: narrative prose, headings that are not Acceptance
Criteria, and code fences that contain requirement-looking lines. The kiro
locator must extract zero candidates from this file, because it only targets
list items under a `#### Acceptance Criteria` heading and there is no such
heading here.

## Sync engine

When the connection drops the client keeps a local queue, and when it recovers
it replays that queue in order. The phrase "the system shall" appears in this
sentence as ordinary prose, not as a requirement, so it must not be extracted.
If a conflict is detected the resolver prefers the most recent write; this is a
design decision, not an acceptance criterion.

## Considerations

- While the queue drains the UI shows a subtle progress hint. This bullet sits
  under Considerations, not under Acceptance Criteria, so it is frame prose.
- Where bandwidth is constrained the client batches writes. Again a design
  note, not a requirement candidate.

## Example criteria (illustrative only)

The following fenced block shows the shape a requirement takes once it reaches
requirements.md. It is a code sample and the kiro profile ignores code fences,
so none of these lines are candidates:

```text
1. WHEN a user submits valid credentials THE SYSTEM SHALL establish a session.
2. IF a write conflict occurs THEN THE SYSTEM SHALL keep the most recent version.
3. THE SYSTEM SHALL retry a failed sync after two minutes.
```

## Sequence

The sign-in sequence is described in prose below. WHEN the token expires the
client silently refreshes it before retrying, and THE SYSTEM SHALL never block
the editor while it does so. These sentences are narrative and carry no
Acceptance Criteria heading, so the locator skips them.
