# Ideas

Bucket of parked ideas. Capture when it shows up; promote to `ROADMAP.md ## Planned` when ready to ship; ship → `ROADMAP.md ## Released`.

## Inherited parking lot (migrated from `.pi/pmti/project/roadmap.md ## Parking lot`, 2026-07-16)

- **Tombstone `/todos` reveal toggle.** Optional UI toggle for tombstoned tasks after the D3 tombstone model proves stable. Currently parked: tombstones stay fully hidden from every surface.
- **Compact-widget refinements.** Considered after the first merged version is used in normal Pi work (i.e. once a real post-M4 session exercises the polished widget).
- **ANSI-aware truncation for the compact widget.** If real themed output shows narrow-width escape-sequence artifacts, switch truncation from naive byte cuts to strip-then-truncate-then-restore.

## Cherry-pick parking lot

Sourced from the 2026-06-02 comparison sweep of `@juicesharp/rpiv-todo`, `@firstpick/pi-extension-todo-progress`, `@xaccefy/pi-xtodo`, `@pi-archimedes/todo`, `@xynogen/pix-todo`. Items NOT promoted to `ROADMAP.md ## Planned`, with reasons:

- **Single `todo({ action })` action-multiplexer** — rejected; see `DECISIONS.md ## D2`.
- **Verbatim port of every third-party field** — only fields that fix a specific gap in M0–M5 graduate to `ROADMAP.md ## Planned` (M6–M10).

## Surface-level / ergonomic

- `/todos --reveal-tombstones` CLI flag — defer until a concrete user need shows the price is worth paying.
- `/start <next>` shorthand for `/next && /start` — defer.
- Merge-back for `activeForm` on resurrection — track as a future D-amendment, not the default. Currently the new payload is authoritative; see `DECISIONS.md ## D3 ## Resurrection`.

## How to add an idea

One bullet, one line, one date. Long-form proposals belong in a milestone plan, not here.
