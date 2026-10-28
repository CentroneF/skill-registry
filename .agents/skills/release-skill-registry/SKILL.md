---
name: release-skill-registry
description: Release CentroneF/skill-registry by updating package.json and package-lock.json, validating the package, committing the version, creating a matching version tag, and pushing that tag to trigger GitHub Packages publishing. Use when asked to release this registry or bump its version and push a release tag.
---

# Release skill registry

Use this skill in the `CentroneF/skill-registry` checkout. Creating or editing this skill does not itself authorize a release. A request to release, or to bump the version and push its tag, authorizes the steps below; a dry-run request reports proposed operations without changing files, commits, or tags. A prepare-only request may update version files and run checks but stops before committing, tagging, or pushing.

## Choose the release

Accept an explicit stable version such as `1.2.0`, or `patch`, `minor`, or `major`. If neither is supplied, read the current version and ask which version or increment the user wants. Do not guess. Resolve the increment to an exact version before editing files.

Read `package.json`, `package-lock.json`, `.github/workflows/publish.yml`, and repository instructions. The package is `@centronef/skill-registry`; its publishing workflow requires a stable `major.minor.patch` version and a matching `v<version>` tag. Prereleases are not supported by the current validator.

## Preflight

- Confirm the package name and that `origin` is `CentroneF/skill-registry` on GitHub. Stop on a different package or repository rather than modifying another project.
- Check `git status --short` and the current branch. Require a clean working tree and index. Do not stash, discard, or include unrelated changes.
- Fetch the remote default branch and tags. Release from that branch at its current remote tip, with the intended implementation already merged. If the user explicitly asks to release another branch or commit, use that authorized revision instead. Do not merge a PR or switch branches with pending work to satisfy this prerequisite.
- Verify the target is valid stable SemVer, is greater than the current package version, and has no existing local or remote `v<version>` tag. Do not overwrite tags or reuse a published version. Treat a failed remote query as a failure, not evidence that a tag is absent.
- Check `gh auth status`, `gh api user`, and repository push permissions without printing tokens. Use an already-authenticated account with write access to this repository when available; otherwise stop and explain which access is missing. Broad token scopes alone do not prove repository write access.

## Prepare and verify

1. Run `npm version <resolved-version> --no-git-tag-version --ignore-scripts`. This updates `package.json` and `package-lock.json` together without npm creating its own commit or tag. Treat `<resolved-version>` as the validated version, never raw shell input.
2. Confirm the target version agrees in `package.json`, the lockfile's top-level `version`, and `packages[""].version`. Existing mismatches in the lockfile must be reconciled to the target version, not copied forward.
3. Run `npm run check`, `npm test`, `npm pack --dry-run --ignore-scripts`, and `git diff --check`. Also run the package validation with `RELEASE_TAG=v<resolved-version>` so the tag/version contract is checked before publication. If the normal npm cache is unwritable, use a temporary cache rather than changing global permissions.
4. Inspect the diff. Only `package.json` and `package-lock.json` should have changed during this release step. If validation fails or unexpected files change, stop before creating a commit or tag; report the failure and leave the edits reviewable.

For prepare-only requests, stop after these checks and report the reviewed diff. Do not proceed to the release steps below.

## Commit, tag, and push

- Commit only `package.json` and `package-lock.json`, using explicit paths and a message such as `chore: release v1.2.0`. Never amend, bypass hooks, or include unrelated staged files.
- Create an annotated tag `v<resolved-version>` on that release commit, with message `Release v<resolved-version>`. Confirm the tag dereferences to the release commit and that the tagged package and lockfile contain the target version.
- Before pushing, state the exact repository, version, tag, and commit, and explain that pushing this tag triggers the GitHub Packages publishing workflow. Continue within an already-authorized release request without asking for duplicate permission. If the request only authorized preparation, stop here and show the prepared changes instead of publishing.
- Push only the named tag with `git push origin refs/tags/v<resolved-version>`. Do not use `--tags`, `--force`, or push a branch unless the user also requested a branch push. A tag push transfers its release commit even if that commit is not yet on a remote branch; report when the local branch remains ahead of its remote.
- Verify the remote tag points to the release commit. Inspect the matching GitHub Actions run when available; a successful push is not proof of successful package publication. Report a queued/running workflow as pending, or link the failed run and its error. Never rerun publishing or move a tag to repair a failed release automatically.

## Failure and retry boundaries

If a commit, tag, push, or workflow step fails, stop at that boundary and report the exact completed steps and remaining local state. Keep existing tags and commits intact. On retry, inspect local and remote tag targets first: if the remote already has the exact intended tag and commit, do not push or publish again. A remote query failure or a conflicting tag requires resolution before proceeding. Do not silently increment again, delete tags, or bypass an approval rejection.

Finish with the released version, commit, tag, remote verification, workflow link/status, and whether any version commit still needs a branch push. Do not create a GitHub Release unless requested.
