# PLAN — M11: Delta ops (`todo_patch`)

Spec: [`docs/specs/2026-08-14-m11-todo-patch.md`](./docs/specs/2026-08-14-m11-todo-patch.md) (proposed 2026-08-14; confirmed for build).
Run branch: `crew/m11-todo-patch`, cut from `crew/migrate-crew-conventions` @ `ac8996b` (carries D8 roadmap trim + M11 spec; `main` lacks those docs commits).

## Scope decision

| Field | Value |
|---|---|
| Tier | **Standard** |
| Risk | **contained protected** (public tool contract + silent replay-corruption invariant; shared `todo_write` commit-tail blast radius) |
| Delivery | **local** — gated commits on the run branch only; no delivery push, no PR |
| started-at | 2026-08-14T02:08:15+02:00 |
| first-worker-at | 2026-08-14T00:09:58.887Z (M11-T1 wave) |
| completed-at | *(pending)* |

**Evidence (scope checkpoint before any child dispatch):**

1. **User-visible outcomes — 3 bounded.** M11.1 implement tool surface · M11.2 replay + verification suite · M11.3 docs rollout.
2. **Repos / release boundaries — 1 repo.** `origin` → `DarkoKuzmanovic/pi-todo`; delivery kept local by explicit choice.
3. **Unresolved architecture forks — none.** Spec §12 locked batch patches, content rename, and terse delta result text. Grill skipped by user choice after confirmed spec.
4. **Protected risk — yes, contained.** Missed replay inclusion silently resurrects pre-patch lists across `/tree`, forks, and post-compaction replay; desugar into shared commit tail means a mutation-path bug can also break `todo_write`.
5. **Reversibility / verification / confidence.** Fully reversible on the run branch. Verification strong (`vitest`, equivalence property, symmetry/replay, e2e). Requirement confidence high.

**Why Standard rather than Light.** Contained protected boundary + >5 cohesive tasks (schema, pure patch, shared commit extraction, tool wire/render/prompts, replay, multi-suite tests, docs). Architecture is resolved, so no planner dispatch. Judge (`pitaj` risk-check) confirmed Standard + contained protected — do not downgrade.

**Allowed ceremony.** Inline outcome map + typed DAG (no planner). One combined `reviewer` with protected-risk contract at each genuine outcome/integration boundary (M11.1, M11.2); M11.3 docs gate may fold into the M11.2 follow-through or a narrow docs check. Shared review-dispatch budget: one full-scope readiness review + at most one delta-only blocker follow-up per outcome boundary. Parent owns deterministic gates (`npm test`). No oracle unless a named trigger fires.

**Outcome dispatch ceilings.** Contained protected → budgets in the active DAG (`dispatch` 10 / `replan` 3 across the run). Per-task ceiling 2.

**Promotion triggers.** Discovery that shared commit extraction requires a new architectural surface (second mutation path); replay/details shape change forcing `TODO_SNAPSHOT_VERSION` bump; any credential/privilege surface entering tool grant; second repository entering scope.

**Review policy.** Risk-dominant single combined reviewer; PASS with zero findings valid once evidence holds. After a blocker: one fix worker + one delta-only reviewer follow-up; another blocker → stop/replan.

**Open crew issues swept:** none.

## Grill

Skipped by explicit user choice at start (spec §12 defaults already decided). Re-offer only on a qualitative boundary change (new repo, unresolved fork, destructive/data-integrity expansion, or materially expanded user-visible scope).

## Outcome map

- [x] **M11.1** — Implement `todo_patch` (schema, pure `applyPatch`, shared `commitTaskList`, register/execute, render, prompt guidelines)
- [x] **M11.2** — Replay inclusion + full §9 test obligations (equivalence, symmetry/replay, atomicity, B1, timestamps, e2e)
- [ ] **M11.3** — Docs rollout (README, CHANGELOG, ROADMAP, AGENTS lesson if warranted)

## Deferred

*(empty)*

## Conventions

- Worktree may be removed before parent integration; recover file bodies from child transcript write/edit payloads.
- `src/patch.test.ts` seeded by parent at T1 acceptance; T4 expands to full §9 (equivalence, tool-entry §3 rejects).

## Gate log

- **2026-08-14T07:36Z — M11.2 protected review PASS-WITH-NOTES.** Reviewer ce2093a8 found no blockers or should-fixes. It accepted §3 rejection coverage in `src/e2e.test.ts` as stronger equivalent evidence through the real registered tool path, with pure §2 rules remaining in `src/patch.test.ts`. Residual note: no independent static typecheck exists without a repo `tsconfig.json`; M11.3 docs remain required before release. Review-dispatches: 1/2 for M11.2 boundary used. Parent consulted the active Pi v24.15.0 `docs/extensions.md`, `docs/session-format.md`, `docs/sessions.md`, `docs/compaction.md`, `examples/extensions/README.md`, and shipped `todo.ts` example.

- **2026-08-14T07:33Z — M11-T4 accepted; M11.2 complete pending protected review.** Worker 4d8c4411 added 34 tests across patch, replay, symmetry, and e2e suites. Parent recovered the pruned worktree from transcript edit payloads and integrated only the four declared test files. `npm test`: 15 files / 403 tests passed. Biome check on the four changed files passed. `tsc --noEmit` is unavailable because this repo has no `tsconfig.json` (compiler printed help and exited 1); the two worker-reported cast errors were corrected during integration. §3 rejections are pinned through the real `todo_patch` entry point in `src/e2e.test.ts`; pure `src/patch.test.ts` owns §2 merge/clear rules. Documentation: README — no test-only delta; M11.3 owns the shipped tool docs. AGENTS — no durable lesson yet; worktree-pruning recovery is already recorded in Conventions.

- **2026-08-14T00:26Z — M11-T3 accepted.** TODO_PATCH added to replay recognition set; TODO_SNAPSHOT_VERSION stays 1. npm test 369 passed. Round-trip proof deferred to T4.

- **2026-08-14T00:24Z — M11.1 review PASS (delta).** Initial FIX-FIRST (self-heal rejects + metadata warnings) fixed in 11f1406; delta reviewer ea2ccd07 PASS. Review-dispatches: 2/2 for M11.1 boundary used.

- **2026-08-14T00:19Z — M11-T2 accepted; M11.1 complete pending protected review.** Worker bd1cc038 wired todo_patch via shared commitTaskList in src/index.ts (prompt guidelines live in registerTool; src/prompt.ts unchanged). npm test 368 passed. Deferred: widen runtime.processToolResult for todo_patch (currently commitTaskList passes gate-compatible "todo_write" for widget refresh).

- **2026-08-14 — scheduler.mode → hard.** M11-T2/T4 use `effort: hard`; standard mode defers them as `route_unavailable`. Mode raised so hard tasks can schedule (ceilings.hard remains 1).

- **2026-08-14T00:14Z — M11-T1 accepted.** Worker 96262f99 delivered src/schemas.ts + src/patch.ts (recovered from worktree transcript after cleanup). Parent added src/patch.test.ts (7 cases) for T1 acceptance; T4 expands §9. npm test: 368 passed. Outcome review deferred until M11.1 (after T2).

## Crew v2 active DAG

```json
{
  "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
  "budgets": {
    "dispatch": {
      "limit": 10,
      "used": 5
    },
    "replan": {
      "limit": 3,
      "used": 0
    }
  },
  "historicalTasks": [],
  "scheduler": {
    "ceilings": {
      "hard": 1,
      "readers": 2,
      "writers": 1
    },
    "mode": "hard",
    "ordering": "outcome-task-id-v1"
  },
  "tasks": [
    {
      "contract": {
        "acceptance": [
          "TodoPatchParams validates patches minItems 1 with id-required fields from spec §2.",
          "npm test -- src/patch.test.ts passes for pure merge/reject cases that do not need the live tool.",
          "src/patch.ts exports pure applyPatch covering every §2 merge/clear rule including appendDescription and metadata null-deletes."
        ],
        "dependsOn": [],
        "invariant": "todo_patch schema and pure applyPatch desugar merge rules without mutating store state.",
        "kind": "implementation",
        "milestone": "M11",
        "outcome": "M11.1",
        "ownershipLocks": [
          "todo:patch-core"
        ],
        "readSet": [
          "docs/specs/2026-08-14-m11-todo-patch.md",
          "src/deps.ts",
          "src/rich-fields.ts",
          "src/types.ts"
        ],
        "replanTriggers": [
          "A required edit falls outside writeSet.",
          "Acceptance cannot be proven from declared evidence."
        ],
        "reviewProperties": [
          "Absent fields leave task values unchanged.",
          "metadata null delete markers never persist as stored null (I1 preserved)."
        ],
        "risk": "protected",
        "route": {
          "role": "worker"
        },
        "writeSet": [
          "src/patch.ts",
          "src/schemas.ts"
        ]
      },
      "contractHash": "sha256:aed153f362e61106199017146e5308b94e38b315f1d28e3d0afd08d929d19255",
      "id": "M11-T1",
      "state": {
        "attempts": 1,
        "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
        "ceiling": 2,
        "effort": "normal",
        "receipt": {
          "artifactPath": "/home/quzma/.pi/agent/sessions/--home-quzma-.pi-agent-extensions-pi-todo--/subagent-artifacts/outputs/call-4617a45e-8b34-42be-a772-948756c1e61a-61fc_4829fee1-30d7-99de-8fcb-e779a7b3c6d9_0/M11-T1.md",
          "basisDagHash": "sha256:aaaf7dd97ba688f47726524d868b5ec64898e43e83e896734b4172634f22f323",
          "capabilityHash": "sha256:663eca05e409cb503ab7dadd3534a8419e1baf46f9fd4884dd007c775e5d9896",
          "model": "deepseek/deepseek-v4-flash:max",
          "outputState": "present",
          "receiptClass": "child_result",
          "requestedRoute": {
            "role": "worker"
          },
          "runId": "96262f99",
          "source": "foreground",
          "success": true,
          "waveId": "sha256:573bf4a091b39fe76b15040f0d96a80221ab5ba0d8018010c3027ccc8b9fcba4"
        },
        "status": "accepted",
        "supersedes": null
      }
    },
    {
      "contract": {
        "acceptance": [
          "Prompt guidelines prefer todo_patch for status flips without growing guideline count materially.",
          "Success content is terse delta + counts; reject content includes formatListForLLM().",
          "Whole-call rejects cover unknown/tombstoned id, duplicate id, description+appendDescription, malformed metadata container, and dependency cycles.",
          "npm test passes for focused suites covering the wired tool path.",
          "renderCall shows compact per-patch segments; renderResult reuses TodoViewComponent.renderTaskResult.",
          "todo_patch tool is registered and desugars into commitTaskList shared with todo_write."
        ],
        "dependsOn": [
          "M11-T1"
        ],
        "invariant": "todo_patch executes through the shared todo_write commit tail with terse success content and self-healing reject content.",
        "kind": "implementation",
        "milestone": "M11",
        "outcome": "M11.1",
        "ownershipLocks": [
          "todo:tool-surface"
        ],
        "readSet": [
          "docs/specs/2026-08-14-m11-todo-patch.md",
          "src/component.ts",
          "src/deps.ts",
          "src/patch.ts",
          "src/rich-fields.ts",
          "src/runtime.ts",
          "src/schemas.ts",
          "src/state.ts",
          "src/tombstone.ts",
          "src/types.ts"
        ],
        "replanTriggers": [
          "A required edit falls outside writeSet.",
          "Acceptance cannot be proven from declared evidence.",
          "Shared commit extraction cannot preserve todo_write behavior."
        ],
        "reviewProperties": [
          "Atomic reject leaves canonical store and idCounter untouched.",
          "No second state-mutation path exists beside the shared commit tail."
        ],
        "risk": "protected",
        "route": {
          "role": "worker"
        },
        "writeSet": [
          "src/index.ts",
          "src/prompt.ts"
        ]
      },
      "contractHash": "sha256:d96170d2dad4e9b3dafc993b6b9506c9596af64b152a56275b226836c3265a10",
      "id": "M11-T2",
      "state": {
        "attempts": 1,
        "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
        "ceiling": 2,
        "effort": "hard",
        "receipt": {
          "artifactPath": "/home/quzma/.pi/agent/sessions/--home-quzma-.pi-agent-extensions-pi-todo--/subagent-artifacts/outputs/call-360f294f-7b2a-4266-bc61-dddade0f3d31-100fc_13c1db47-95d0-9050-bd53-965388984daa_1/M11-T2.md",
          "basisDagHash": "sha256:1c014f0d502405f5b08a3ee12aee3dbb52fbc89c5ca643a6842570c8073d126f",
          "capabilityHash": "sha256:663eca05e409cb503ab7dadd3534a8419e1baf46f9fd4884dd007c775e5d9896",
          "model": "deepseek/deepseek-v4-flash:max",
          "outputState": "present",
          "receiptClass": "child_result",
          "requestedRoute": {
            "role": "worker"
          },
          "runId": "bd1cc038",
          "source": "foreground",
          "success": true,
          "waveId": "sha256:0f5e055f2def84c4ddf9615e6a801a9823a2f8f356a304aec0fec00bd534db5a"
        },
        "status": "accepted",
        "supersedes": null
      }
    },
    {
      "contract": {
        "acceptance": [
          "A branch whose latest mutation is a todo_patch result reconstructs the patched list in store and tracker.",
          "TODO_PATCH constant exists and TodoToolName / isTodoToolName include todo_patch.",
          "TODO_SNAPSHOT_VERSION remains 1."
        ],
        "dependsOn": [
          "M11-T2"
        ],
        "invariant": "todo_patch tool results are visible to reconstructState and tracker replay exactly like todo_write/todo_remove.",
        "kind": "implementation",
        "milestone": "M11",
        "outcome": "M11.2",
        "ownershipLocks": [
          "todo:replay"
        ],
        "readSet": [
          "docs/specs/2026-08-14-m11-todo-patch.md",
          "src/index.ts",
          "src/types.ts"
        ],
        "replanTriggers": [
          "A required edit falls outside writeSet.",
          "Replay shape for todo_patch diverges from TaskDetails used by todo_write."
        ],
        "reviewProperties": [
          "Missing replay inclusion cannot silently resurrect a pre-patch list."
        ],
        "risk": "protected",
        "route": {
          "role": "worker"
        },
        "writeSet": [
          "src/replay.ts"
        ]
      },
      "contractHash": "sha256:97fbc5f16e4a9c9c1ace4912f3010311957ecaa12d4d036b10152c52357b50a5",
      "id": "M11-T3",
      "state": {
        "attempts": 1,
        "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
        "ceiling": 2,
        "effort": "normal",
        "receipt": {
          "artifactPath": "/home/quzma/.pi/agent/sessions/--home-quzma-.pi-agent-extensions-pi-todo--/subagent-artifacts/outputs/call-82e4b8e6-79a5-4899-a44d-bccf7ea781db-126fc_e931f2d8-fdc3-9ddb-bb36-2fc017697385_1/M11-T3.md",
          "basisDagHash": "sha256:31f38ab9564496280172051c96ad885c0e73076c2b01ef654afb28556ddd6c5d",
          "capabilityHash": "sha256:663eca05e409cb503ab7dadd3534a8419e1baf46f9fd4884dd007c775e5d9896",
          "model": "deepseek/deepseek-v4-flash:max",
          "outputState": "present",
          "receiptClass": "child_result",
          "requestedRoute": {
            "role": "worker"
          },
          "runId": "5b354407",
          "source": "foreground",
          "success": true,
          "waveId": "sha256:2e31fae47ca35cb101c2015152d7d5c86cf71294de7335c5103a6fc8b98c1bc5"
        },
        "status": "accepted",
        "supersedes": null
      }
    },
    {
      "contract": {
        "acceptance": [
          "Atomicity, B1/tombstone, and timestamp assertions pass through the todo_patch entry point.",
          "Equivalence property: valid patches leave state byte-identical to todo_write(fullMergedList).",
          "Replay/symmetry coverage proves todo_patch as latest mutation reconstructs store and tracker.",
          "e2e covers plan via todo_write, flip via todo_patch, widget counts, prompt block, /todos, and terse content.",
          "npm test is green.",
          "src/patch.test.ts covers every §2 merge/clear rule and each §3 rejection."
        ],
        "dependsOn": [
          "M11-T3"
        ],
        "invariant": "Spec §9 testing obligations pin merge rules, equivalence to todo_write, atomicity, B1, timestamps, replay/symmetry, and e2e plan→patch flow.",
        "kind": "test",
        "milestone": "M11",
        "outcome": "M11.2",
        "ownershipLocks": [
          "todo:tests-m11"
        ],
        "readSet": [
          "docs/specs/2026-08-14-m11-todo-patch.md",
          "src/index.ts",
          "src/patch.ts",
          "src/prompt.ts",
          "src/replay.ts",
          "src/schemas.ts"
        ],
        "replanTriggers": [
          "A required edit falls outside writeSet.",
          "Equivalence property cannot be expressed against current APIs."
        ],
        "reviewProperties": [
          "Equivalence and replay round-trip tests are present and failing-closed for missed replay inclusion."
        ],
        "risk": "protected",
        "route": {
          "role": "worker"
        },
        "writeSet": [
          "src/e2e.test.ts",
          "src/patch.test.ts",
          "src/replay.test.ts",
          "src/symmetry.test.ts"
        ]
      },
      "contractHash": "sha256:2dfbd098a45513d74506dd39c731cfb99b93ef278c72aadfe782b1d9e32b220b",
      "id": "M11-T4",
      "state": {
        "attempts": 1,
        "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
        "ceiling": 2,
        "effort": "hard",
        "receipt": {
          "artifactPath": "/home/quzma/.pi/agent/sessions/--home-quzma-.pi-agent-extensions-pi-todo--/subagent-artifacts/outputs/call_WeSUF8adVnRrxKhL35ILORw5|fc_01eef2a672bcf2d5016a7ec16c9f0c819182f5926a7428bb32/M11-T4.md",
          "basisDagHash": "sha256:9db62ebdd70afa57f32fa0d8fb6a86aa2dd979990c1c417070192ca88affbbf5",
          "capabilityHash": "sha256:ce3b879c7678f904bec795a0781d7d3024dc1d18f557ec78098f11332171d0bc",
          "model": "deepseek/deepseek-v4-flash:max",
          "outputState": "present",
          "receiptClass": "child_result",
          "requestedRoute": {
            "role": "worker"
          },
          "runId": "4d8c4411",
          "source": "foreground",
          "success": true,
          "waveId": "sha256:5eac2adb4b6c012792cc2ff4dfe4e7457144da8e784e23963ad565fc85c786b1"
        },
        "status": "accepted",
        "supersedes": null
      }
    },
    {
      "contract": {
        "acceptance": [
          "AGENTS.md Lessons updated only if equivalence/replay work surfaced a durable lesson.",
          "CHANGELOG Unreleased Added entry covers todo_patch.",
          "README tool table and plan/progress/remove contract mention todo_patch; blockedBy/rich-fields note patch-boundary clears.",
          "ROADMAP moves M11 appropriately for an in-progress or completed build per close-out stage."
        ],
        "dependsOn": [
          "M11-T4"
        ],
        "invariant": "User-facing and agent docs describe plan/progress/remove with todo_patch semantics; CHANGELOG and ROADMAP reflect M11 shipping state.",
        "kind": "docs",
        "milestone": "M11",
        "outcome": "M11.3",
        "ownershipLocks": [
          "todo:docs-m11"
        ],
        "readSet": [
          "docs/specs/2026-08-14-m11-todo-patch.md",
          "src/index.ts",
          "src/prompt.ts"
        ],
        "replanTriggers": [
          "A required edit falls outside writeSet.",
          "Documentation evidence cannot be reconciled with shipped delta."
        ],
        "reviewProperties": [
          "Docs match shipped behavior; no placeholder or stale tool list."
        ],
        "risk": "normal",
        "route": {
          "role": "worker"
        },
        "writeSet": [
          "AGENTS.md",
          "CHANGELOG.md",
          "README.md",
          "ROADMAP.md"
        ]
      },
      "contractHash": "sha256:8e1d83902d865e1734dcb9dd73f196ef60464933145d5eabf5347893f19d99af",
      "id": "M11-T5",
      "state": {
        "attempts": 1,
        "baseRevision": "5ea31a90d495c1d14f1e8289081cb8c224bb277d",
        "ceiling": 2,
        "effort": "micro",
        "receipt": {
          "artifactPath": null,
          "basisDagHash": "sha256:bb55ad4df809de706e1b7ce7d3f56071865e151cab0be8e756db4b0998291500",
          "capabilityHash": "sha256:ce3b879c7678f904bec795a0781d7d3024dc1d18f557ec78098f11332171d0bc",
          "outputState": null,
          "receiptClass": null,
          "requestedRoute": {
            "role": "worker"
          },
          "runId": null,
          "source": null,
          "success": null,
          "waveId": "sha256:ea7a662db58778dad39b91d240ef63627f4647e3008a0282a50e44e25cd8f3f6"
        },
        "status": "in_flight",
        "supersedes": null
      }
    }
  ],
  "version": 3
}
```
