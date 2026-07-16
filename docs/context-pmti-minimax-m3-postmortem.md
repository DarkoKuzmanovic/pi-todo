# Context Package: MiniMax M3 as PMTI Executor — Post-Mortem and Reusable Contract

## 1. Root-Cause Analysis

**One invariant sentence:** MiniMax M3 violates the structural integrity of TypeScript source files when performing sequential multi-line edits (`edit.replace_lines` / `set_line`) because stale/shifted anchor hashes cause duplicate function bodies, orphan code fragments, and brace imbalance — and a "continuous multi-task pass" cadence compounds this by accumulating corrupt intermediate states across tasks without a re-read/clean-write checkpoint.

### Concrete failure signature (from M2 evidence)

MiniMax M3's continuous pass over M2-T1→T2→T3→T4 produced:

| File | Corruption | Recovery |
|------|-----------|----------|
| `src/tracker.ts` | Broken mid-function `validPriority` declaration + duplicate `extractBlockedBy` body after anchor shift | Full `write` rewrite of file |
| `src/deps.test.ts` | `require("./tracker")` under `"type": "module"` (ESM workspace) | Rewrite to top-level `import` |
| `src/commands.test.ts` | 4 progressive Vite/oxc parse errors: test-body insert inside existing `it()`/`describe` block, duplicate `it()` declaration, missing `});` closers, unbalanced braces | `deslopper` tokenizer-balance pass + manual `set_line` deletions |
| `src/e2e.test.ts` | `buildMockPi` duplicate (from M1-T4, same pattern) | — |

**Affected test files:** up to 7 files broke with vite:oxc parse errors before recovery.

### Historical pattern (across M0/M1/M2)

This is not M2-specific. The same pattern appears in smaller doses:

- **M1-T2 (DeepSeek v4 Pro):** `replace_lines` consumed `});` closing lines without restoring them; missed `TODO_WRITE`/`TODO_REMOVE` imports after import replacement. All caught by tests/Biome. ~15 min with recovery.
- **M1-T4 (MiniMax M3, single-task):** oxc transform rejected `?:` in inline type aliases; `replace_lines` left duplicate `registerCommand` parameter list. Caught by re-read + rewrite. ~15–20 min.
- **M2 (MiniMax M3, continuous):** 3 distinct editor/test incidents across 4 tasks; 2 required downstream agent cleanup. ~25–35 min including recovery.

**The continuous cadence makes it worse** because corrupt state from Task N carries into Task N+1, creating cascading parse errors. Per-task review gates would catch corruption before it propagates.

### Why this happens

The `edit.replace_lines` and `set_line` tools use LINE:HASH anchors that shift when content above the anchor changes. When MiniMax M3 performs multiple edits to the same file without re-reading between them, the second edit uses stale anchors from the pre-first-edit state. This can cause:
- Replacing the wrong region (duplicate insertion)
- Missing the closing delimiter (orphan `});` or `}`)
- Inserting content inside an existing block (test body inside `it()`)

---

## 2. Reusable META-PROMPT / Executor Contract for MiniMax M3

**Purpose:** Copy-paste this block into any PMTI task packet's "Worker must:" section before dispatching MiniMax M3. It encodes the lessons from M2's structural corruption failures.

```
## MiniMax M3 Executor Contract (structural-edit safety)

You are executing a PMTI task packet with `minimax/MiniMax-M3`.

### EDIT DISCIPLINE (non-negotiable)

1. **Re-read before every edit.** After any `edit.replace_lines`, `set_line`, or `insert_after` call to a file, re-read the affected file (or at minimum the 30 lines surrounding your edit) before the next edit to that file. Never assume the previous edit landed correctly.

2. **Prefer full-file `write` over multi-anchor edits on TypeScript files.** For any `.ts` file where you need to touch more than one location, or where the edit involves adding/removing a function body, use `write` to replace the entire file rather than stacking multiple `set_line`/`replace_lines` calls. The risk of stale-anchor corruption is too high with multi-step edits.

3. **One logical edit per file, then re-read.** Do not batch multiple edits to the same file in a single turn. Make one edit, verify it landed (re-read), then make the next. If you see a re-read mismatch, stop and rewrite the file cleanly.

4. **Hard stop after 2 failed edits on the same file.** If an edit produces a warning, anchor mismatch, or the re-read shows unexpected content, attempt ONE clean re-read + rewrite. If that also fails, STOP EXECUTION and report the file, the error, and the intended change. Do not continue to the next task with a corrupt file.

5. **Brace/structure self-check after every test file edit.** After editing any `.test.ts` file, count opening and closing braces/parens. If you added a `describe()` or `it()` block, verify the matching `});` closer is present. A quick mental token-count is sufficient — but if you are unsure, re-read the full file.

6. **No `require()` in ESM workspaces.** This project has `"type": "module"` in `package.json`. Use only ESM `import` syntax. Never use `require()`.

7. **No non-null assertions (`!`).** Use optional chaining (`?.`) or explicit null checks.

8. **Do not make architectural decisions.** If the task packet says "implement the oracle-specified policy" or "follow the pattern in X", implement exactly that. If you encounter ambiguity not covered by the packet, STOP and report it rather than making a design choice.

### SCOPE DISCIPLINE

9. **Touch only files listed in the milestone scope.** If you need to modify a file not listed in "Scope:", STOP and report why.

10. **Do not modify durable PMTI state.** Orchestrator owns final status, session logs, and close-out.

### VERIFICATION DISCIPLINE

11. **Run focused tests after each task boundary.** Even in a continuous pass, run `npm test -- src/<task-relevant-files>` after each M2-TN step before proceeding to the next.

12. **Run full `npm test` at the end.** Report the result (pass/fail, count, duration).

13. **Run Biome check.** `bunx --bun @biomejs/biome check .` — report result. New errors beyond the pre-existing `src/state.test.ts:225` unused `before` warning are a STOP condition.
```

---

## 3. Cadence Decision Matrix

When is a continuous MiniMax M3 pass safe vs. when are per-task orchestrator review gates mandatory?

| Dimension | Continuous-pass safe | Per-task review gates mandatory |
|-----------|---------------------|-------------------------------|
| **File count** | ≤3 source files, ≤2 test files | >3 source files OR >2 test files |
| **Edit type** | Pure additions (new files, new functions, new imports) | Edits to existing function bodies, imports, or type signatures |
| **Hook/lifecycle involvement** | None — no `session_start`, `session_before_compact`, `session_compact`, `before_agent_start` changes | Any lifecycle hook modification |
| **Schema involvement** | Additive only (new optional field) | Structural schema change, required field addition/removal, type narrowing |
| **Boundary crossing** | Single module boundary (e.g., new file consumed by one other file) | Multiple module boundaries (e.g., schema → tracker → store → index → commands) |
| **Task count in milestone** | ≤2 tasks | ≥3 tasks |
| **Invariants at risk** | None — no replay symmetry, no atomicity, no backward-compat concern | Any invariant (replay symmetry, store/tracker parity, backward compatibility, atomic validation) |
| **Prior MiniMax failures on similar scope** | Clean (M1-T1: 1 new file, 0 incidents) | Corrupted (M2: 8+ files, 3 incidents) |

**Decision rule:** If ≥3 dimensions land in the "per-task review gates mandatory" column, use per-task review. The continuous cadence saves ~20% planning overhead but risks 2–3× more fix-back cycles when the scope crosses module boundaries.

**Historical calibration:**
- M1-T1 (1 new file, 0 boundaries): continuous safe. ✅ Zero incidents.
- M1-T4 (1 new test file, 0 boundaries): continuous safe. ✅ Two small incidents, self-recovered.
- M2 (8+ files, 4 boundaries: schema↔tracker↔store↔commands↔prompt↔widget): continuous NOT safe. ❌ 3 incidents, 2 required external recovery.

---

## 4. Orchestrator Verification Checklist (Post-MiniMax Pass)

Run this checklist after any MiniMax M3 continuous pass, INDEPENDENTLY (do not trust MiniMax's self-report):

```bash
# 1. Independent full test suite (don't trust worker's self-report)
cd /home/quzma/.pi/agent/extensions/pi-todo
npm test

# 2. Biome lint/format check
bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo

# 3. Structural corruption scan — look for duplicate function/const/let declarations
#    in the files MiniMax touched. This catches the M2 pattern (duplicate extractBlockedBy,
#    duplicate DepValidationOk, duplicate buildMockPi).
grep -n 'function \|export const \|export function \|export interface ' src/tracker.ts src/deps.ts src/commands.ts src/index.ts | sort -t: -k2 | uniq -d -f1

# 4. Check for require() in ESM workspace (should never appear)
grep -rn 'require(' src/ --include='*.ts' --include='*.test.ts'

# 5. Brace balance quick-scan on touched test files
#    (counts { vs } — should be equal)
for f in src/commands.test.ts src/e2e.test.ts src/deps.test.ts src/compact-widget.test.ts; do
  echo "$f: open=$(grep -o '{' "$f" | wc -l) close=$(grep -o '}' "$f" | wc -l)"
done

# 6. Fresh-context reviewer on full diff
#    Use the `reviewer` agent with a clean context window reading ALL changed files.
#    This catches integration issues MiniMax's in-context testing misses.

# 7. Manual live trial (after review passes):
#    - Create a dependency graph via todo_write
#    - Verify blocked display in prompt/widget
#    - Run /next to confirm blocked is skipped
#    - Complete a dependency and confirm unblock
#    - Run /todos
#    - Run /compact or equivalent replay trial to confirm blockedBy survives
```

**Stop conditions for the orchestrator:**
- `npm test` fails → dispatch fix-back OR escalate
- Biome new errors → dispatch fix-back OR escalate
- Duplicate function declarations found → dispatch a `write`-based cleanup pass before any other work
- `require()` found in `.ts` files → dispatch fix-back
- Brace imbalance >1 in any test file → dispatch fix-back
- Fresh-context reviewer finds Critical or Important → dispatch fix-back, max 2 rounds before escalation

---

## 5. Evidence Sources

| Source | Path | Key content |
|--------|------|-------------|
| M2 MiniMax report | `.pi/tmp/m2-minimax-implementation.md` | Section 4: 3 incidents, failure modes, ~25–35 min wall-clock, recommendation to revert to per-task gates |
| M2 Oracle review | `.pi/tmp/m2-oracle-review.md` | Validation policy, mandatory stop conditions, "review after pass, not per-task" guidance |
| Decisions log | `.pi/pmti/project/decisions.md` | M0-c (bake-off), M0-d (GLM paused), M1-a (DeepSeek trial), M1-b (Sonnet trial), M2-a (continuous MiniMax) |
| Session log | `.pi/pmti/project/session-log/2026-06-01-001.md` | Full M0–M2 timeline with per-task model evidence |
| M2 milestone | `.pi/pmti/milestones/M2.md` | Task decomposition, scope boundaries, close-out gates |
| M1-T2 DeepSeek | `.pi/tmp/m1-t2-deepseek-implementation.md` | Same brace/import pattern in milder form |
| M1-T4 MiniMax | `.pi/tmp/m1-t4-minimax-implementation.md` | Same pattern even on single-task scope |
| Source: tracker.ts | `src/tracker.ts:128-177` | Where duplicate `extractBlockedBy` corruption landed |
| Source: deps.ts | `src/deps.ts:21-31` | Where duplicate `DepValidationOk` corruption landed |
| package.json | `package.json:10` | `"type": "module"` — explains `require()` failures |

---

## 6. Model Bake-Off Summary (M0–M2)

| Model | Milestone | Quota cost | Scope discipline | Fix-back burden | Failure pattern |
|-------|-----------|-----------|------------------|----------------|----------------|
| GLM 5.1 | M0-T1, M0-T4 | ~49% of 5h pool | Excellent | 0–1 fix-backs | None significant (but too costly) |
| MiniMax M3 | M0-T2/T3, M1-T1/T4, M2 | ~5% of 5h pool | Excellent | 1–3 fix-backs per task | Stale anchor corruption under continuous cadence |
| DeepSeek v4 Pro | M1-T2 | Not visible | Good | 2–3 fix-backs | Brace closing + import omissions |
| Sonnet 4.6 | M1-T3 | Not visible | Excellent | 1–2 fix-backs | Malformed-task normalization gaps |

**Operational conclusion:** MiniMax M3 is the right default executor for this workflow (~5% quota vs GLM's ~49%), but it MUST be constrained with the executor contract above. Its edit corruption is predictable and preventable — the contract is the mitigation.
