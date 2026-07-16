# Meta-Prompt: MiniMax M3 PMTI Executor Contract

**Goal:** Prevent MiniMax M3's structural edit corruption when executing PMTI task packets by injecting an explicit edit-discipline contract into the worker handoff.

**Context/evidence:** See `context.md` sections 1–3 for the full root-cause analysis, historical failure patterns, and cadence decision matrix derived from M0–M2 bake-off evidence.

---

## Copy-pasteable executor contract

Inject this block into any PMTI task packet's "Worker must:" section before dispatching MiniMax M3.

```
## MiniMax M3 Executor Contract (structural-edit safety)

You are executing a PMTI task packet with `minimax/MiniMax-M3`.

### EDIT DISCIPLINE (non-negotiable)

1. **Re-read before every edit.** After any `edit.replace_lines`, `set_line`, or `insert_after` call to a file, re-read the affected file (or at minimum the 30 lines surrounding your edit) before the next edit to that file. Never assume the previous edit landed correctly.

2. **Prefer full-file `write` over multi-anchor edits on TypeScript files.** For any `.ts` file where you need to touch more than one location, or where the edit involves adding/removing a function body, use `write` to replace the entire file rather than stacking multiple `set_line`/`replace_lines` calls. The risk of stale-anchor corruption is too high with multi-step edits.

3. **One logical edit per file, then re-read.** Do not batch multiple edits to the same file in a single turn. Make one edit, verify it landed (re-read), then make the next. If you see a re-read mismatch, stop and rewrite the file cleanly.

4. **Hard stop after 2 failed edits on the same file.** If an edit produces a warning, anchor mismatch, or the re-read shows unexpected content, attempt ONE clean re-read + rewrite. If that also fails, STOP EXECUTION and report the file, the error, and the intended change. Do not continue to the next task with a corrupt file.

5. **Brace/structure self-check after every test file edit.** After editing any `.test.ts` file, count opening and closing braces/parens. If you added a `describe()` or `it()` block, verify the matching `});` closer is present.

6. **No `require()` in ESM workspaces.** This project has `"type": "module"` in `package.json`. Use only ESM `import` syntax.

7. **No non-null assertions (`!`).** Use optional chaining (`?.`) or explicit null checks.

8. **Do not make architectural decisions.** If the task packet says "implement the oracle-specified policy", implement exactly that. If you encounter ambiguity, STOP and report.

### SCOPE DISCIPLINE

9. **Touch only files listed in the milestone scope.** If you need to modify a file not listed, STOP and report why.

10. **Do not modify durable PMTI state.** Orchestrator owns final status, session logs, and close-out.

### VERIFICATION DISCIPLINE

11. **Run focused tests after each task boundary.** Even in a continuous pass, run `npm test -- src/<task-relevant-files>` after each step before proceeding.

12. **Run full `npm test` at the end.** Report the result (pass/fail, count, duration).

13. **Run Biome check.** `bunx --bun @biomejs/biome check .` — report result. New errors beyond the pre-existing `src/state.test.ts:225` unused `before` warning are a STOP condition.
```

---

## Orchestrator verification checklist (post-pass)

Run independently after any MiniMax M3 pass:

```bash
cd /home/quzma/.pi/agent/extensions/pi-todo

# 1. Full test suite
npm test

# 2. Biome
bunx --bun @biomejs/biome check /home/quzma/.pi/agent/extensions/pi-todo

# 3. Duplicate declaration scan
grep -n 'function \|export const \|export function \|export interface ' src/tracker.ts src/deps.ts src/commands.ts src/index.ts | sort -t: -k2 | uniq -d -f1

# 4. ESM compliance
grep -rn 'require(' src/ --include='*.ts' --include='*.test.ts'

# 5. Brace balance on test files
for f in src/commands.test.ts src/e2e.test.ts src/deps.test.ts src/compact-widget.test.ts; do
  echo "$f: open=$(grep -o '{' "$f" | wc -l) close=$(grep -o '}' "$f" | wc -l)"
done

# 6. Fresh-context reviewer on full diff
# 7. Manual live trial per milestone checklist
```

---

## Success criteria (for the next agent)

- [ ] The executor contract block is present in the task packet before MiniMax dispatch
- [ ] The cadence decision matrix has been consulted: if ≥3 "per-task mandatory" dimensions, per-task gates are used instead of continuous pass
- [ ] Post-pass verification checklist is run independently by the orchestrator
- [ ] No `require()` calls exist in `.ts` files
- [ ] No duplicate function/const/interface declarations in touched files
- [ ] `npm test` and Biome pass with no new errors

## Hard constraints

- Do NOT remove or weaken rules from the executor contract — each rule maps to a specific M2 failure mode
- Do NOT skip the structural corruption scan (step 3 in verification) — it catches the primary M2 failure pattern
- Max 2 fix-back rounds before escalation
- The executor contract is a safety invariant, not a suggestion — it should be injected verbatim

## Resolved questions

1. **Why not use a different model entirely?** MiniMax M3 uses ~5% of the 5h quota pool vs GLM 5.1's ~49%. The corruption is preventable with the contract.
2. **Is the continuous cadence ever safe?** Yes — for ≤2 tasks touching ≤3 files with pure additions and no boundary crossings. The decision matrix in `context.md` section 3 provides the explicit criteria.
3. **What recovery path when MiniMax corrupts a file?** Full `write` rewrite, not more `set_line` calls. The contract's rule #4 (hard stop after 2 failed edits) prevents escalation.
