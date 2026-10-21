---
name: oracle-init
description: Initialize the /context lifecycle directories in this project — scaffold context/{changes,archive}/ plus universal README.md files if absent.
---

# /oracle-init — Initialize Lean /context Directory

Scaffold the `/context` lifecycle skeleton (`changes/`, `archive/`) plus a universal `README.md` in each. Idempotent: each of the four artifacts (2 dirs + 2 READMEs) is independently create-if-absent; re-running on a project where everything is already present is a no-op.

This skill is the explicit entry point for users who want to scaffold change-tracking conventions up-front. It is NOT a precondition for `/oracle-new`, `/oracle-archive`, or any consumer skill — `/oracle-new` will refuse if `context/changes/` is missing, and `/oracle-archive` lazily creates `context/archive/` on demand. `/oracle-init` exists for users who prefer to set up the lifecycle skeleton first.

## Process

### Step 1: Scaffold `context/changes/` + `README.md`

If the directory exists, leave it untouched and note `present` for the directory in the summary. Otherwise create it with `mkdir -p` and note `created`.

If `context/changes/README.md` exists, leave it untouched and note `present`. Otherwise write it with this canonical content (embedded inline — no separate template file):

```
# Changes

In-flight changes. One folder per change at `context/changes/<change-id>/`, identified by a `change.md` identity file. Created via `/oracle-new`. Holds research, frame, plan, reviews, and other change-scoped artifacts.

When a change is complete, archive it with `/oracle-archive` to move it under `context/archive/`.
```

### Step 2: Scaffold `context/archive/` + `README.md`

If the directory exists, leave it untouched and note `present` for the directory. Otherwise create it with `mkdir -p` and note `created`.

If `context/archive/README.md` exists, leave it untouched and note `present`. Otherwise write it with this canonical content:

```
# Archive

Completed changes. Folders moved here from `context/changes/` when archived (see `/oracle-archive`). Read-only by convention; skills refuse to write here.
```

### Step 3: Print summary

Print a four-line status block:

```
context/changes/                [created|present]
context/changes/README.md       [created|present]
context/archive/                [created|present]
context/archive/README.md       [created|present]
```

Then a one-paragraph guide on what each directory is for and where to look next:

- `context/changes/` holds in-flight changes. Run `/oracle-new` to create a new change folder with its `change.md` identity file.
- `context/archive/` holds completed changes. Run `/oracle-archive` when a change is done — it will move the folder out of `changes/` into `archive/`.

### Step 4: Offer an optional branch and commit

After printing the summary, retain the list of artifacts created by this run. Do not include existing (`present`) artifacts or unrelated working-tree changes.

If no managed artifact was created, report that there are no `/oracle-init` changes to branch or commit, then stop. Do not inspect, stage, commit, or otherwise act on unrelated changes.

If one or more managed artifacts were created, present a version-control follow-up with these suggestions:

```text
Suggested branch: chore/initialize-context-lifecycle
Suggested commit: chore: initialize context lifecycle directories
```

Ask: `Would you like to create a branch and a commit for the changes created by /oracle-init?` Offer these choices:

- `Create suggested branch and commit (Recommended)` — create `chore/initialize-context-lifecycle`, stage only artifacts created by this run with explicit paths, and commit using the suggested message.
- `Create suggested branch only` — create the suggested branch but leave every created artifact unstaged.
- `Skip` — leave the current branch and working tree unchanged.
- `Customize` — let the user provide a branch name, commit subject, or both before taking any Git action.

Before creating a branch, verify the suggested or user-provided name is available locally and on `origin`. If unavailable, report the collision and request a different name; do not select an alternative automatically. Before committing, show the explicit staged paths and proposed commit message, then require user approval. Never use `git add -A` or `git add .`; never stage unrelated changes. After a successful branch or commit action, report the resulting branch and commit SHA, then stop.

## Notes

- **Idempotent.** Re-running `/oracle-init` when all four artifacts already exist is a no-op (with a status print). It must never overwrite existing content.
- **No forced ordering.** All four artifacts are independent. If only some exist, create the missing ones and leave the existing ones alone.
- **Parent directories are created as needed.** `context/` may not exist in a fresh project — create it implicitly via `mkdir -p` semantics on each child directory.
- **Not a precondition.** Other skills self-bootstrap their own files. `/oracle-init` is for users who like to set up the lifecycle skeleton up-front.

## Verification guidance

Run this matrix in isolated fixture directories. Preserve the fixture between setup and assertion steps so each scenario can detect unexpected writes.

| Scenario | Fixture setup | Expected result |
| --- | --- | --- |
| Fresh project | Start with no `context/` directory. | Creates exactly `context/changes/`, `context/changes/README.md`, `context/archive/`, and `context/archive/README.md`; all four summary rows report `created`. No foundation directory is created. |
| Idempotent rerun | Re-run after the fresh-project scenario and compare README hashes before/after. | All four summary rows report `present`; both README files are byte-identical and no new files are written. |
| Partial managed setup | Seed a custom `context/changes/README.md` and leave one or more other managed artifacts absent. | Preserves the custom README byte-for-byte, creates only the missing managed artifacts, and reports a correct mix of `present` and `created`. |
| Missing parent | Start without a `context/` parent. | Creates the required parent paths implicitly while creating only the four managed artifacts. |
| Existing foundation | Seed `context/foundation/` and a sentinel file before running the skill. | Leaves the directory and sentinel byte-for-byte unchanged, creates or preserves only managed artifacts, and prints no foundation status row or guide text. |
| Command boundary | Run any successful scenario and inspect the complete response. | Prints the four-row summary and changes/archive guide, then offers only the optional branch/commit follow-up before stopping; it never invokes `/oracle-new` or another skill. |
| Version-control follow-up | Create one or more managed artifacts while unrelated files are dirty. | Suggests `chore/initialize-context-lifecycle` and `chore: initialize context lifecycle directories`; only creates a branch or commit after explicit user selection, and stages only created managed artifacts. |
| No managed changes | Re-run when all four managed artifacts are already present. | Reports that there are no `/oracle-init` changes to branch or commit and does not inspect, stage, or mutate unrelated changes. |
