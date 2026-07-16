# Decisions

Append-only durable decisions. Newest entries go to the bottom. Never renumber.

> **Provenance.** This log was curated from `.pi/pmti/project/decisions.md` on 2026-07-16 (oracle advisory). The migration dropped ephemeral workflow tooling entries (executor trials, workspace strategies, superseded PMTI scaffolding) and kept only the **load-bearing design forks** a future maintainer would want to revisit. Original PMTI decision IDs are cited in each entry so commit-archaeology queries still resolve (`git log --grep M4-c` etc.). The full PMTI state is preserved verbatim under `docs/archive/pmti/`.

---

## D1 — Merge `oh-my-todo` into `pi-todo`

**Date:** 2026-06-01
**Source:** the `## Decision: should oh-my-todo remain separate?` block in the project root's `IMPLEMENTATION_PLAN.md` (now retired); reconfirmed by `.pi/pmti/project/decisions.md ## M0-a–b` and `roadmap.md ## M0/M5`.
**Status:** accepted

**Decision:** Standalone `oh-my-todo` does not remain a second extension. It depends on `pi-todo` internals and adds presentation polish only; keeping it separate creates avoidable coupling — two extension load points, two widget keys, duplicate session reconstruction, command-ownership confusion around `/todos`, `/start`, `/done`, `/next`, `/pause`, and double package-list maintenance.

**Consequences:**
- `pi-todo` is the single todo extension.
- M5 retired the standalone `oh-my-todo` folder via recoverable move + targeted `find -delete`. `pi.extensions` had been `[]` since M0, so the deletion was cleanup-only with no behavior change.

---

## D2 — Keep explicit `todo_write` / `todo_read` / `todo_remove`; never adopt an action-multiplexed API

**Date:** 2026-05-31 (P0-b) and reconfirmed across M0–M4 (2026-06-01..02)
**Source:** `.pi/pmti/project/decisions.md ## P0-b Preserve explicit todo tools`.
**Status:** accepted

**Decision:** Keep `todo_write`, `todo_read`, and `todo_remove` as the public task tools. Do **not** adopt the `rpiv-todo` single `todo({ action })` API.

**Rationale:** Local agent discipline and PMTI-era skill expectations rely on explicit tools and auditable `todo_write` updates. Borrowed `rpiv-todo` ideas must fit the existing tool model.

**Folded-in discipline (from M0 / M4-d):** Slash-helper commands (`/done`, `/start`, `/next`, `/pause`) send auditable follow-up instructions via `todo_write`; they **never** mutate task state behind the model. Same single-source-of-truth principle as D2 itself — helpers are recommendations, not direct state writers. Any future helper or surface must route mutations through `todo_write`.

**Consequences:**
- The three explicit tool names are part of the public contract.
- New tools must be additive, optional, and named explicitly; never introduced as `toolName({action})` or similar.

---

## D3 — Tombstone model: hidden everywhere, retained everywhere, authoritative resurrection

**Date:** 2026-06-01 (M3-a), confirmed 2026-06-02 (M4-d amendment)
**Source:** `.pi/pmti/project/decisions.md ## M3-a` and `.pi/pmti/milestones/M3.md ## Status / Constraints / invariants`.
**Status:** accepted

**Decision:** `todo_remove` soft-deletes by default via an additive optional `deletedAt?: number`. Tombstones are fully hidden from every normal surface — prompt injection, `formatListForLLM()`, `/todos` (LLM-text + interactive `TodoViewComponent`), compact widget, derived counts, slash-command selection, blocked labels. They are retained in canonical state + history and preserved through `todo_write` full-replace (B1: `setTasks([...validatedCandidates, ...preservedTombstones])`), `pi-todo:snapshot`, and compaction reconstruction.

**Resurrection (I2):** Re-sending a tombstoned id via `todo_write` resurrects to live; the new payload's rich fields are authoritative (no merge-back from the audit-retained pre-tombstone payload).

**Single replay invariant:** `extractTasks()` extracts `deletedAt` with safe coercion; replay is **not** a tombstoning boundary.

**Rationale:** Soft-delete-by-default matches the "removals preserve history" intent while preserving the public `todo_remove` tool (D2) and the additive-schema discipline (M2-style). Replay faithfulness keeps tombstones durable through compaction.

**Consequences:**
- `src/tombstone.ts` owns pure helpers (`isTombstoned`, `activeTasks`). `src/deps.ts:activeBlockerIds(task, allTasks)` mirrors `isBlocked`'s predicate so blocked listing labels never print tombstoned dependency IDs (D4).
- The `/todos` reveal toggle is parked; tombstones stay fully hidden until the model proves stable (see `IDEAS.md ## Inherited parking lot`).

---

## D4 — `blockedBy` is advisory metadata; any helper that prints blockers must use `activeBlockerIds`, never raw `task.blockedBy`

**Date:** 2026-06-01 (M2 boundary-validation work), 2026-06-02 (M4-d accessor-rule amendment)
**Source:** `.pi/pmti/milestones/M2.md ## Constraints / invariants` + `.pi/pmti/project/decisions.md ## M4-d`.
**Status:** accepted

**Decision:**
- `blockedBy?: string[]` is **advisory metadata**. Blocked state is **derived** (never persisted as a separate flag in M2).
- Validation runs at the `todo_write` input boundary only — **not** at replay/extraction: strip self-dependencies and duplicate dependency IDs silently, strip unknown IDs with a named warning in the tool result, allow dependencies on completed tasks, and **reject cycles atomically** (return a content error without changing canonical state, including `idCounter` rollback).
- M2 dependency handling is independent of M3 tombstones: tombstoned deps are treated as gone (D3), and `isBlocked` ignores tombstoned tasks as a defense-in-depth for reconstructed display state.
- **Critical.** Any helper that prints a task's blockers — `/start`/`/next` follow-up text, `/todos` UI labels, prompt-blocked-section suffix, blocked listing — must use `src/deps.ts:activeBlockerIds(task, activeTasks([...tracker.tasks]))`, never raw `task.blockedBy`. This is the easiest future violation; raw `blockedBy` is a private array.

**Rationale:** `extractTasks()` in `src/tracker.ts` extracts `blockedBy` faithfully from stored details — replay is not a normalization boundary. Normalization and cycle detection are `todo_write` input-boundary concerns only. The accessor rule enforces D3's "dead id never printed" invariant everywhere blockers are interpolated.

**Consequences:**
- `/next` selects only unblocked pending tasks when possible and reports "All pending tasks are blocked — complete their dependencies first." otherwise.
- `/start <blocked-id>` still sends the audited follow-up but is annotated "incomplete dependencies"; helper commands are recommendations, never direct mutations (D2).

---

## D5 — Visibility map for rich task fields

**Date:** 2026-06-02 (M4-c)
**Source:** `.pi/pmti/milestones/M4.md ## M4-c` (user-picked M-c over the original prompt-description choice).
**Status:** accepted

**Decision:** Apply the M-c visibility map exactly:

| Field | `formatListForLLM` (prompt + `/todos`-LLM) | `buildSystemPromptBlock` (prompt active label) | `TodoViewComponent` (interactive `/todos`) | compact widget | `renderTaskResult` (tool result card) |
|---|---|---|---|---|---|
| `description` | `/todos`-LLM only | — | yes | yes (active-task suffix ` — <description>`) | yes |
| `activeForm` | yes (when on active task) | yes (active-task label, I3-escaped) | yes | — | yes |
| `owner` | `/todos`-LLM only | — | yes | — | yes |
| `metadata` | **hidden everywhere** | **hidden** | **hidden** | **hidden** | **hidden** |

**Rationale:** Description in the prompt would bloat prompt budget with content the agent doesn't need to act on. `activeForm` gives a present-progressive label useful for `/start` and `/next` follow-up phrasing. Metadata is intentionally hidden to avoid leaking into prompt injection or `/todos` output; it is purely a canonical-state / replay field for audit and inter-extension communication.

**Consequences:**
- `extractRichFields` is the single chokepoint that promotes extracted rich-field objects onto `Task`.
- `metadata` is never passed to any rendering function; hidden everywhere.
- I3 prompt safety for `activeForm` lives in test+code comment territory (U+2018 substitution per the `M4.md ## M4-e` amendment).

---

## D6 — Metadata validation: per-key drop with named warning; whole-task reject on malformed container

**Date:** 2026-06-02 (M4-b)
**Source:** `.pi/pmti/project/decisions.md ## M4-b`.
**Status:** accepted

**Decision:** For each task, validate `metadata` per-key: drop bad keys (nested objects, arrays, null, unsupported types) with a **named** warning in the tool result — e.g. `metadata.foo dropped: nested objects not allowed`. If the metadata **container itself** is malformed (not an object, is an array, is null), the entire `todo_write` is atomic-rejected with a content error — no ID minted, no partial state, `idCounter` rolled back.

Other rich fields (`description`, `owner`, `activeForm`) are passed through as-is; missing/null/undefined are accepted (additive optional).

**Rationale:** Per-key drop keeps the store healthy when one bad key is mixed with good keys; whole-task reject on a malformed container prevents silent data loss when the agent sends a wrong shape (e.g. `metadata: "tag1,tag2"` from a stringified tag bag). The combination matches the M2/M3 schema-additive discipline: existing tasks without the new fields remain valid, and no public tool name changes (D2). The malformed-container check is implemented as a pre-flight in `execute()` (not just in the TypeBox schema) because direct handler invocations may bypass the schema.

**Consequences:**
- `src/rich-fields.ts` owns `validateMetadata()` + `describeType()` + per-key drop.
- The pre-flight in `src/index.ts:execute()` runs before candidate construction; on rejection it returns a content error with the unchanged store.
- `TodoWriteParams` schema stays strict (TypeBox rejects non-record metadata at the type level) but the pre-flight is defense-in-depth.

---

## D7 — Branch-replay persistence (no disk) — to be revised by M7

**Date:** 2026-06-01 (M1 confirmed), reconfirmed 2026-06-02 (M3-T3 persistence symmetry)
**Source:** `.pi/pmti/milestones/M1.md ## Status`; `.pi/pmti/milestones/M3.md ## M3-T3`.
**Status:** accepted — to be revised by M7 (planned disk fallback)

**Decision:** Canonical store and runtime `TaskTracker` reconstruct from branch entries (`getBranch()` includes old tool results even after compaction) plus an extension-owned `pi-todo:snapshot` `CustomEntry` appended on `session_before_compact`. No disk persistence in the M0–M5 era.

**Rationale:** Branch replay provides accidental correctness; M1 hardens it into intentional resilience. Custom-entry snapshots add explicit resilience for branches pruned by external tooling. The single-replay invariant (store and tracker agree on compacted, malformed, empty, and later-tool-result branches) is enforced by the shared `extractTasks()` boundary.

**Why record this explicitly:** M7 (`ROADMAP.md ## Planned`) will introduce a disk fallback (`~/.pi/xtodo/<safe-session-id>.json`) for branches pruned before the snapshot was appended. Recording the current rule makes M7 an **honest revision of a documented decision** rather than silent drift.

**Consequences:**
- `session_before_compact` persists the snapshot; `session_compact` refreshes widgets/state. `session_start` does **not** fire after compaction (`session_compact` is the post-compaction event).
- A malformed latest replay input clears store and tracker symmetrically; both projections must agree or the invariant is broken.
