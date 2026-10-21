---
name: oracle-new
description: Start a change from a GitHub issue, creating a linked branch and change record
---

# /oracle-new — Start a Change from a GitHub Issue

Create one end-to-end change record from an existing GitHub issue. The input must be a standard issue URL for this repository. This skill reads and assigns the issue with GitHub CLI, derives a concise branch name from its title, publishes the branch, and writes `change.md`.

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
9. Run `git branch --show-current`. If its output is exactly `<branch>`, skip issue assignment and all branch setup; continue directly to **Creation**. This preserves the existing-branch no-op behavior.
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

Next step:
  → /oracle-plan <change-id>
```

## Verification guidance

Run this matrix in a disposable repository with a reachable bare `origin` and a mocked or wrapped `gh` that records `issue view` and `issue edit` calls. For every stop scenario, confirm that no new `context/changes/<change-id>/` directory is written; where the workflow has not yet reached assignment, confirm that `gh issue edit` was not called.

| Scenario | Setup / input | Expected outcome |
| --- | --- | --- |
| Open issue URL | Run `/oracle-new https://github.com/<owner>/<repo>/issues/123` against an open issue title yielding a three- or four-word slug. | The issue is read from the normalized `origin` repo, assigned with `--add-assignee @me`, and creates/pushes the ID-derived branch from freshly fetched `origin/main`. The branch tracks only `origin/<branch>`; `change.md` records the returned issue number, canonical URL, and Notes link. |
| No input | Run `/oracle-new` without an argument. | It prompts for a GitHub issue URL and stops without a GitHub, Git, or context mutation. |
| Invalid or unsupported reference | Use a bare issue number, zero, a non-numeric token, a query/fragment URL, API/Enterprise/comment URL, or multiple arguments. | It reports the input error and stops without `gh issue view`, assignment, Git mutation, or a new change folder. |
| Cross-repository URL | Use a standard issue URL whose owner/repo differs from normalized `origin`. | It reports the repository mismatch and stops without issue lookup, assignment, Git mutation, or a new change folder. |
| Authentication recovery or issue lookup failure | Make the initial `gh auth status` fail, then verify `gh auth login -h github.com --web -s project` runs once before authentication is re-checked; separately, make login, the repeated status check, or `gh issue view` fail. | A successful browser login continues to lookup. Any remaining authentication or issue-lookup error is reported and stops without assignment, Git mutation, or a new change folder. |
| Closed issue | Return a non-open state from `gh issue view`. | It reports `error: GitHub issue #<gh-id> is <state>, not open.` and stops without assignment, Git mutation, or a new change folder. |
| Assignment failure | Return an error from `gh issue edit <gh-id> --repo <owner>/<repo> --add-assignee @me`. | It reports the CLI error and stops before `git fetch`, branch creation, push, or any new change folder. |
| Existing target branch | Check out the computed branch while its change folder is absent. | The workflow skips assignment and all branch setup, then creates only the missing change record with correct metadata. |
| Slug edge cases | Exercise three-word, four-word, punctuation-heavy, and short-title fallback titles. | Every derived slug has exactly three or four lowercase hyphen-separated words; branch and change folder names match exactly. |
| Change-record collision | Pre-create either the active or archived `<change-id>` directory. | It reports the existing change record and stops without assignment, Git mutation, or a new change folder. |
| Fetch failure | Make `git fetch origin main` fail after successful assignment. | It reports the Git error and stops without branch creation, push, or a new change folder. |
| Local or remote branch collision | Pre-create the computed branch locally or on `origin`. | It reports the branch collision and stops without switching, pushing, or a new change folder. |
| Branch creation failure | Make `git switch --no-track -c <branch> origin/main` fail. | It reports the Git error and stops without push or a new change folder. |
| Push failure | Make `git push -u origin <branch>` fail. | It reports the Git error and stops without a new change folder; do not reset, move, or delete the branch. |
| Upstream verification failure | Make the final branch/upstream check differ from `<branch>` / `origin/<branch>`. | It reports the mismatch and stops without a new change folder; never accept `origin/main` as the feature branch upstream. |
