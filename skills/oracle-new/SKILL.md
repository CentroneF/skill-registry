---
name: oracle-new
description: Start a change from a GitHub issue, publishing a branch and initial change record, opening a draft PR, and linking it in the issue description
---

# /oracle-new — Start a Change from a GitHub Issue

Create one end-to-end change record from an existing GitHub issue. The input must be a standard issue URL for this repository. This skill reads and assigns the issue with GitHub CLI, derives a concise branch name from its title, commits and publishes the initial `change.md`, opens a draft pull request (GitHub's equivalent of an MR), and links it in the issue description. Invoking this workflow authorizes that scoped initial commit, push, PR creation, and issue-body update; later planning and implementation commits retain their own approval rules.

## Input

The command accepts zero or one argument. When supplied, `<issue-ref>` must be a standard GitHub issue URL for the repository associated with the current directory:

```text
/oracle-new https://github.com/OWNER/REPO/issues/123
```

If no argument is supplied, respond and stop:

```text
I'll start a change from a GitHub issue. Please provide its URL:

  /oracle-new https://github.com/OWNER/REPO/issues/123
```

If more than one argument is supplied, respond with `error: provide only one GitHub issue URL (for example, /oracle-new https://github.com/OWNER/REPO/issues/123).` and stop.

## Validation and issue lookup

Before creating or switching any branch:

1. Confirm `context/changes/` exists. If it does not, respond with `error: context/changes/ not found — is this repo set up for the 10x context structure?` and stop. Do not create it.
2. Confirm `gh` is installed and authenticated using `gh auth status`. If authentication fails, recover access once through GitHub's browser authorization flow before stopping:

   ```bash
   gh auth login -h github.com --web -s project
   gh auth status
   ```

   The login command opens GitHub's authorization flow and may display a one-time device code. The user must complete the login or authorization prompt. If login or the repeated status check fails, report the CLI error and stop. Do not attempt an additional login or make any Git/context mutation before authentication succeeds.
3. Resolve the GitHub repository associated with the current directory from `git remote get-url origin`. Accept an HTTPS or SSH GitHub.com origin and normalize it to `<owner>/<repo>`; if `origin` is missing or cannot be normalized to GitHub.com, report the Git error or `error: origin must identify a GitHub.com owner/repository.` and stop.
4. Normalize `<issue-ref>` to `<gh-id>` by accepting only `https://github.com/<owner>/<repo>/issues/<number>` with an optional trailing slash, where `<number>` matches `^[1-9][0-9]*$`. Reject bare issue numbers, query strings, fragments, API URLs, GitHub Enterprise URLs, issue-comment URLs, and every other URL form with `error: GitHub issue reference "<issue-ref>" must be a standard issue URL for this repository.`
   - Require the URL's `<owner>/<repo>` to exactly match the normalized `origin`; on mismatch, respond with `error: GitHub issue URL must reference this repository (<owner>/<repo>).` and stop.
5. Fetch the issue from that normalized repository:

   ```bash
   gh issue view <gh-id> --repo <owner>/<repo> --json number,title,url,state
   ```

   If the issue cannot be read, report the GitHub CLI error and stop. Use the returned `number` as `<gh-id>` and returned `url` as `<issue-url>`. Require that the returned issue is open; for any other state, report `error: GitHub issue #<gh-id> is <state>, not open.` and stop.
6. Derive `<slug>` from the issue title. Generate three concise, meaningful words that describe the work; add a fourth only when it is needed to retain a specific resource, environment, or operation that would otherwise make the name ambiguous. Use the title only, remove filler words and generic terms such as `issue`, `change`, and `task`, lowercase the result, replace non-alphanumeric runs with hyphens, and join the selected words with hyphens. The result must match `^[a-z0-9]+(-[a-z0-9]+){2,3}$`. If a title cannot yield three valid words, generate three precise English words that summarize it. Never use issue labels, body, or comments.
7. Set `<change-id>` and `<branch>` to `gh-<gh-id>-<slug>`. For example, issue `#123` titled `Add Redmine local Docker setup` becomes `gh-123-redmine-local-docker-setup` because `setup` identifies the operation.
8. Check that neither `context/changes/<change-id>/` nor `context/archive/<change-id>/` exists. On collision, report `error: change "<change-id>" already exists at <path>. Work inside the existing folder.` and stop.
9. Run `git branch --show-current`. If its output is exactly `<branch>`, skip issue assignment and branch creation; continue directly to **Creation**, then complete **Publish and link the pull request**. The checked-out case must still publish the initial record and ensure the PR and issue link exist.
10. Assign the validated open issue to the logged-in GitHub user before any `git fetch`, branch creation, or change-record write:

    ```bash
    gh issue edit <gh-id> --repo <owner>/<repo> --add-assignee @me
    ```

    If assignment fails, report the GitHub CLI error and stop. Do not fetch, switch, create, push, or write a change folder. Re-adding `@me` is an acceptable idempotent operation.

## Branch preflight and setup

After validation and assignment succeed and before creating a folder or `change.md`, establish `<branch>`. Any Git failure stops this skill without creating a change record.

1. Run `git fetch origin main`. If it fails, report the Git error and stop.
2. Check both `refs/heads/<branch>` locally and on `origin` using `git show-ref --verify --quiet` and `git ls-remote --exit-code --heads origin <branch>`.
3. If either branch exists, do not reuse it or append a number automatically. Report `error: branch "<branch>" already exists locally or on origin. Resolve the existing issue branch before starting this change.` and stop.
4. Create and publish the branch from the freshly fetched base:

   ```bash
   git switch --no-track -c <branch> origin/main
   git push -u origin <branch>
   ```

   Do not clean up by resetting, moving, or deleting branches after a failure.
5. Verify that `git branch --show-current` is `<branch>` and `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` is `origin/<branch>`. Report a mismatch and stop if either check fails.

## Creation

Only after branch setup succeeds or the already-checked-out case applies:

1. Create `context/changes/<change-id>/`.
2. Write `context/changes/<change-id>/change.md` using the issue title as `<title>`, the issue URL as `<issue-url>`, and today's date from `date +%Y-%m-%d`:

   ```markdown
   ---
   change_id: <change-id>
   title: <issue-title>
   status: new
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   archived_at: null
   issue_url: <issue-url>
   ---

   ## Notes

   GitHub issue: <issue-url>
   ```

   Preserve the issue title exactly except as required for valid YAML quoting. Do not copy the issue body or comments.

## Publish and link the pull request

GitHub cannot open a PR when the head and base have no differing commits. Publish the initial change record before creating the PR; do not use an empty commit or include unrelated work.

1. Confirm the current branch is still `<branch>`. Commit only the newly written record, preserving unrelated staged and working-tree changes:

   ```bash
   git add -- context/changes/<change-id>/change.md
   git commit --only -m "chore(<change-id>): initialize change record" -- context/changes/<change-id>/change.md
   git push -u origin <branch>
   ```

   Capture the commit SHA with `git rev-parse HEAD`. Never amend, force-push, bypass hooks, or stage a whole directory. If any command fails, report the error and stop. Verify the current branch and upstream are `<branch>` and `origin/<branch>` before continuing, including in the already-checked-out case.
2. Look for an existing open PR for this exact head and base:

   ```bash
   gh pr list --repo <owner>/<repo> --head <branch> --base main --state open --json number,url,headRefName,baseRefName
   ```

   Reuse the matching PR URL if present. If multiple matches are returned, report the ambiguity and stop. If none exists, create a draft PR targeting `main`, using the issue title as its title and a body containing `Closes <issue-url>` and `Initial change record; planning and implementation pending.`:

   ```bash
   gh pr create --repo <owner>/<repo> --base main --head <branch> --draft --title <issue-title> --body-file <pr-body-file>
   ```

   Write the exact body to a temporary UTF-8 file outside the repository and pass its path with `--body-file`. Pass titles and paths as safely quoted arguments, never interpolate issue text into shell code. Capture the returned URL as `<pr-url>`.
3. Fetch the latest issue description with `gh issue view <gh-id> --repo <owner>/<repo> --json body`. Preserve the existing body exactly, including Markdown and task lists. If it already contains the exact `<pr-url>`, leave it unchanged. Otherwise append a blank line followed by `Pull request: <pr-url>`, write the complete updated body to a temporary UTF-8 file, and update the description:

   ```bash
   gh issue edit <gh-id> --repo <owner>/<repo> --body-file <issue-body-file>
   ```

   Do not replace the description with just the link or post the link as a comment. Re-read the description immediately before editing; if it changed since the body was prepared, rebuild the appended body from the latest version.
4. Verify the PR with `gh pr view <pr-url> --repo <owner>/<repo> --json url,state,isDraft,headRefName,baseRefName` and re-fetch the issue body. Require an open PR with the expected head and `main` base, and the exact PR URL in the issue description. A newly created PR must be a draft; preserve the review state of a reused PR. Remove temporary body files after use.

On a GitHub failure, report the CLI error and everything already completed, including the branch, record path, commit SHA, and PR URL when known. Do not undo successful steps. If PR creation returns an uncertain result, query for the matching PR before retrying creation once. If only issue linking failed, retry that step once using the known PR URL and a freshly fetched issue body. Stop if lookup fails, the retry fails, or the result remains uncertain. Do not rerun the whole workflow against an existing change folder or claim completion until verification passes.

## Next step

Set and copy this command to the clipboard when possible:

```bash
NEXT_CMD="/oracle-plan <change-id>"
echo -n "$NEXT_CMD" | pbcopy 2>/dev/null || echo -n "$NEXT_CMD" | clip.exe 2>/dev/null || echo -n "$NEXT_CMD" | xclip -selection clipboard 2>/dev/null || true
```

Then display:

```text
✓ Read GitHub issue #<gh-id>: <issue-title>
✓ Created context/changes/<change-id>/change.md (status: new)
✓ On branch <branch> tracking origin/<branch>
✓ Committed and pushed the initial change record: <commit-sha>
✓ Pull request: <pr-url>
✓ Linked the pull request in GitHub issue #<gh-id>'s description

Next step:
  → /oracle-plan <change-id>
```

## Verification guidance

Run this matrix in a disposable repository with a reachable bare `origin` and a mocked or wrapped `gh` that records issue and PR calls. For stops before **Creation**, confirm that no new change directory is written; where the workflow has not yet reached assignment, confirm that `gh issue edit` was not called. For later failures, confirm successful artifacts remain and the summary identifies the incomplete step. Do not run this matrix against live issues or PRs.

| Scenario | Setup / input | Expected outcome |
| --- | --- | --- |
| Open issue URL | Run `/oracle-new https://github.com/<owner>/<repo>/issues/123` against an open issue title yielding a three- or four-word slug. | Assigns the issue, creates/pushes the branch from fetched `origin/main`, commits/pushes only `change.md`, opens a draft PR targeting `main` with `Closes <issue-url>`, and appends its URL to the issue description. Verifies the PR, upstream, and issue link. |
| No input | Run `/oracle-new` without an argument. | It prompts for a GitHub issue URL and stops without a GitHub, Git, or context mutation. |
| Invalid or unsupported reference | Use a bare issue number, zero, a non-numeric token, a query/fragment URL, API/Enterprise/comment URL, or multiple arguments. | It reports the input error and stops without `gh issue view`, assignment, Git mutation, or a new change folder. |
| Cross-repository URL | Use a standard issue URL whose owner/repo differs from normalized `origin`. | It reports the repository mismatch and stops without issue lookup, assignment, Git mutation, or a new change folder. |
| Authentication recovery or issue lookup failure | Make the initial `gh auth status` fail, then verify `gh auth login -h github.com --web -s project` runs once before authentication is re-checked; separately, make login, the repeated status check, or `gh issue view` fail. | A successful browser login continues to lookup. Any remaining authentication or issue-lookup error is reported and stops without assignment, Git mutation, or a new change folder. |
| Closed issue | Return a non-open state from `gh issue view`. | It reports `error: GitHub issue #<gh-id> is <state>, not open.` and stops without assignment, Git mutation, or a new change folder. |
| Assignment failure | Return an error from `gh issue edit <gh-id> --repo <owner>/<repo> --add-assignee @me`. | It reports the CLI error and stops before `git fetch`, branch creation, push, or any new change folder. |
| Existing target branch | Check out the computed branch while its change folder is absent. | Skips assignment and branch creation, creates and commits the missing record, pushes with the correct upstream, then creates or reuses the PR and links it in the issue description. |
| Slug edge cases | Exercise three-word, four-word, punctuation-heavy, and short-title fallback titles. | Every derived slug has exactly three or four lowercase hyphen-separated words; branch and change folder names match exactly. |
| Change-record collision | Pre-create either the active or archived `<change-id>` directory. | It reports the existing change record and stops without assignment, Git mutation, or a new change folder. |
| Fetch failure | Make `git fetch origin main` fail after successful assignment. | It reports the Git error and stops without branch creation, push, or a new change folder. |
| Local or remote branch collision | Pre-create the computed branch locally or on `origin`. | It reports the branch collision and stops without switching, pushing, or a new change folder. |
| Branch creation failure | Make `git switch --no-track -c <branch> origin/main` fail. | It reports the Git error and stops without push or a new change folder. |
| Push failure | Make `git push -u origin <branch>` fail. | It reports the Git error and stops without a new change folder; do not reset, move, or delete the branch. |
| Upstream verification failure | Make a branch/upstream check differ from `<branch>` / `origin/<branch>`. | Reports the mismatch and stops before the next step; preserves artifacts already created. Never accepts `origin/main` as the feature branch upstream. |
| Scoped initial commit | Leave unrelated staged and unstaged files present. | The initial commit and push include only the new record; unrelated content and index entries are preserved. |
| Commit or second push failure | Fail the record commit or the push after it. | Reports partial progress and stops before PR creation or issue-body editing; keeps the record and any successful commit. |
| Existing PR or link | Return a matching open PR, or an issue description already containing its exact URL. | Reuses the PR without creating another; preserves an existing link without appending a duplicate. |
| Issue-body preservation | Supply Markdown, task lists, quotes, shell metacharacters, or an empty body; also simulate a body change before editing. | Appends only the PR link using the latest body and a temporary body file; preserves all existing content and never executes issue text. |
| PR or issue-link failure | Fail PR lookup/creation, return an uncertain creation result, or fail issue-body update/verification. | Reports the incomplete step and known artifacts; checks for an existing PR before retrying creation and retries linking from the latest issue body without duplicating PRs or links. |
