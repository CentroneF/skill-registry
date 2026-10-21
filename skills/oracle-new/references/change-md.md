# `change.md` Reference

Each `context/changes/<change-id>/change.md` is the change's lifecycle identity file. Tiny — frontmatter + an optional `## Notes` body.

## File shape

```markdown
---
change_id: <kebab-case-id> # required, must match folder name
title: <human-readable title> # required
status: <status> # required, see allowed values below
created: YYYY-MM-DD # required, set at /oracle-new time
updated: YYYY-MM-DD # required, last lifecycle skill write
archived_at: <iso-datetime> # null until /oracle-archive runs
issue_url: <canonical-github-issue-url> # optional; set by /oracle-new
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
```

## Issue-linked change fields

`/oracle-new` adds this optional frontmatter field when a change begins from a GitHub issue:

- `issue_url`: the canonical GitHub issue URL returned by GitHub CLI.

The same URL is repeated in `## Notes` as a human-readable link. This field is omitted for changes created through workflows that do not start from a GitHub issue.

## Allowed `status` values

`new`, `preparing`, `planned`, `plan_reviewed`, `implementing`, `implemented`, `impl_reviewed`, `archived`, `blocked`

### Transitions

| From            | To              | Triggered by                                         |
| --------------- | --------------- | ---------------------------------------------------- |
| (none)          | `new`           | `/oracle-new`                                        |
| `new`           | `preparing`     | first of `/oracle-research` or `/oracle-frame`        |
| `preparing`     | `planned`       | `/oracle-plan`                                       |
| `new`           | `planned`       | `/oracle-plan` (when research/frame skipped)         |
| `planned`       | `plan_reviewed` | `/oracle-plan-review`                                |
| `plan_reviewed` | `implementing`  | `/oracle-implement` (first phase)                    |
| `planned`       | `implementing`  | `/oracle-implement` (when plan-review skipped)       |
| `implementing`  | `implemented`   | `/oracle-implement` (last phase complete)            |
| `implemented`   | `impl_reviewed` | `/oracle-impl-review`                                |
| `implementing`  | `impl_reviewed` | `/oracle-impl-review` (when running mid-implementation) |
| any             | `blocked`       | manual (user edit)                                   |
| `blocked`       | previous        | manual (user edit)                                   |
| `impl_reviewed` | `archived`      | `/oracle-archive`                                    |
| `implemented`   | `archived`      | `/oracle-archive` (when impl-review skipped)         |

## Update semantics

Skills update `change.md` on every lifecycle-changing run (`status`, `updated`). The file is record-only — nothing enforces transition rules. Skipping a step is allowed; `/oracle-status` will surface gaps via missing artifact files (e.g., "status=plan_reviewed but no reviews/plan-review.md").

## What is NOT in change.md

By design:

- No `artifacts.*` block — derive from `ls` of the change folder.
- No `implementation.{total_phases,completed_phases,current_phase}` — derive from the `## Progress` section in `plan.md`.
- No `requires` / `blocked_by` — out of scope.
- No generic `link` field — use `issue_url` when the change is GitHub-linked.
