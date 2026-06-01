# Roadmap

This roadmap stays high-level. Detailed scope, task decomposition, dependencies, and review state live in `.pi/pmti/milestones/MN.md`.

## Current milestone

- **M0:** Completed 2026-06-01 — merged `oh-my-todo` polish into `pi-todo` while preserving the existing explicit tool API. Standalone `oh-my-todo` deactivation is staged but deferred until reload/trial verification.

## Candidate milestones

- **M1:** Add compaction-aware replay so todo state, tracker state, and compact widget refresh correctly after `session_compact`.
- **M2:** Add optional `blockedBy` dependency metadata with validation, cycle detection, and compact blocked-state display.
- **M3:** Add audit-friendly tombstones so removals can preserve history while hiding deleted tasks from normal prompt/UI views.
- **M4:** Add optional rich task fields (`description`, `owner`, `metadata`, `activeForm`) without changing existing task validity.
- **M5:** Safely deactivate standalone `oh-my-todo` after reload/manual workflow verification.

## Parking lot

- Optional `/todos` UI toggle for deleted/tombstoned tasks after the tombstone model proves stable.
- Decide later whether the old `oh-my-todo/` folder should be archived or deleted after at least one stable normal work session.
