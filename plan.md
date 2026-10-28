# Agent-aware skill installation plan

Date: 2026-10-28
Status: Implemented on `feat/agent-aware-installation`; automated checks passed. Manual checklist retained for user review.

## Overview

Extend the project-local installer to support Codex, Claude Code, Cursor, GitHub Copilot, and Gemini CLI. Accept `--agent` for scripted use; otherwise ask the user to select an agent. Every install/update refreshes all existing managed agent installations in the project as well as the selected destination. Deliver the installer, tests, and README updates together in one implementation phase.

## Current State Analysis

- `bin/skill-registry.mjs:4` handles command-line arguments, accepting an action and optionally `--project PATH`. It has no interactive selection.
- `lib/manage-skills.mjs:37` exposes `manageSkills({action, project, packageRoot})` for install, status, and uninstall.
- `lib/manage-skills.mjs:41` hard-codes `.agents/skills` and `.agents/skill-registry-lock.json`.
- `lib/manage-skills.mjs:47` validates schema-version-1 receipts containing the package version and hashes of managed skills.
- `lib/manage-skills.mjs:77` checks for conflicts and local edits before mutation. Installation stages files, backs up existing files, and restores them on failure.
- `test/install.test.mjs:8` exercises the library lifecycle, updates, rollback, local-edit protection, and preservation of unrelated skills. CLI behavior currently has no tests.
- `README.md` documents only `.agents` destinations and commands without an agent parameter.
- `package.json` requires Node.js >=22 and has no third-party dependencies. The publishing workflow already runs package validation, tests, and a package preview.

## Desired End State

### Supported destinations

All paths are relative to the selected project. Each skills directory contains `<skill-name>/SKILL.md` and the existing supporting resources.

| CLI value | Selection label | Skills directory | Receipt |
| --- | --- | --- | --- |
| `codex` | Codex | `.agents/skills` | `.agents/skill-registry-lock.json` |
| `claude` | Claude Code | `.claude/skills` | `.claude/skill-registry-lock.json` |
| `cursor` | Cursor | `.cursor/skills` | `.cursor/skill-registry-lock.json` |
| `copilot` | GitHub Copilot | `.github/skills` | `.github/skill-registry-lock.json` |
| `gemini` | Gemini CLI | `.gemini/skills` | `.gemini/skill-registry-lock.json` |

### Agreed behavior

- All three actions accept `--agent AGENT` and `--project PATH` in either option order. Status and uninstall target only the selected agent. Install targets the selected destination plus every existing managed destination in the project, updating them all to the invoked package version.
- For example, if Codex and Claude already have managed installations, `install --agent codex` updates both. `install --agent cursor` updates both and adds Cursor. Selecting an agent does not exclude existing installations from an update; rollback to an older package version has the same project-wide update scope.
- A valid explicit agent skips interactive selection.
- Omitting `--agent` always prompts when an interactive terminal is available. There is no silent CLI default, automatic agent detection, or remembered selection.
- If prompting is impossible, exit unsuccessfully with an actionable message showing `--agent` and the supported values. Use an available interactive terminal even when ordinary output is redirected; do not wait indefinitely for input in CI.
- Show a numbered list of the five agents and their destination paths. Require an explicit selection; invalid or blank input prompts again. Cancellation or end-of-input exits unsuccessfully without modifying project files.
- Validate the action and options before prompting or writing files. Unknown agents, unknown flags, duplicate options, missing values, and extra positional arguments produce clear errors.
- No arguments and `--help` display usage without prompting or writing files.
- Install reports the complete set of destinations being updated before mutation and a result for each destination. Status and uninstall report the selected agent and destination. Status continues to report the installed receipt's version rather than the version of the running installer.
- Packaged skill content is copied unchanged. This work establishes installation and discovery support; it does not translate tool names or instructions for each agent.

### Destination ownership and compatibility

Ownership belongs to the destination folder and its receipt, rather than to an agent-specific ownership record. When agents target the same folder, reuse its receipt and replace unchanged managed files through the existing update mechanism. Do not create parallel receipts for the same destination. Removing that installation removes the managed files for every agent that reads it.

The five initial mappings above have distinct destinations. Selecting a different destination installs there and updates existing managed installations without moving or deleting them. Inspect only the five known receipt locations to discover managed installations; the existence of an agent configuration directory or skills folder alone does not establish ownership. Leave unselected directories without receipts untouched. A present but invalid receipt or an unsafe managed destination blocks the update before any files are changed. No filesystem scan automatically redirects a selected agent to another agent's folder.

Deduplicate the update set by resolved destination path. Multiple agents sharing a destination receive one replacement and one receipt update, rather than repeated writes. Validate and stage every destination before replacement. If any destination has local edits, conflicts, or invalid state, fail the whole update without changing any installation. Retain all backups, including prior receipt contents, until every destination succeeds; a recoverable write failure restores all destinations to their pre-command state. Do not report success for a partially completed update.

Some agents discover skills in multiple directories. Separate installer destinations do not guarantee separate visibility: Cursor and Copilot can read shared folders, and Gemini gives its `.agents/skills` alias precedence over `.gemini/skills` for duplicate names. Explain this in the README, including that updating a separate copy may not change the copy an agent actually loads.

Keep existing `.agents` receipts valid without migration or a schema change. Retain a default of `codex` for direct library callers that omit `agent`, preserving the existing programmatic contract. The CLI must resolve a selection before calling the library and must never rely on that default.

Shared-folder replacement preserves the current safeguards: locally edited managed files and unrelated same-name folders still block replacement. Symlink destinations remain rejected. Status and no-op uninstall remain read-only.

## Scope

Included: agent mappings, command-line options, terminal selection, discovery and coordinated updates of all existing managed destinations, destination-scoped receipts and staging, regression tests, and README updates.

Excluded: global/user-level installs, selecting multiple new agents in one command, arbitrary destination overrides, automatic migration between folders, skill-content adaptation, force-overwrite behavior, new dependencies, version bumps, publishing, and changes to the release workflow.

## Implementation Approach

Use a small fixed catalogue shared by the CLI and library so labels, accepted values, and paths remain consistent. Keep interaction in the CLI. For install, the library combines the selected destination with installations found through the known receipts and deduplicates the resulting paths. Extend preflight, staging, replacement, and rollback across that complete set. Status and uninstall retain a single-destination workflow.

## Phase 1: Deliver agent-aware installation, tests, and documentation

### Changes Required

#### 1. Agent catalogue and destination resolution

**Files:** new `lib/agents.mjs`; `lib/manage-skills.mjs`.

**Intent:** Define the five supported agents centrally and resolve destinations consistently for every action. Discover existing managed installations for project-wide updates while preserving Codex compatibility and folder-based ownership.

**Contract:** Extend the library input to `manageSkills({action, project, agent = 'codex', packageRoot})`. Accept only the fixed agent IDs above. Resolve skills, receipt, and staging locations from catalogue destinations; never construct paths from unchecked agent input. Install discovers all existing managed destinations and adds the selected destination; other actions resolve only the selection. Keep the receipt schema at version 1, without an agent field that would prevent sharing a destination.

#### 2. CLI options and interactive selection

**Files:** `bin/skill-registry.mjs`; new `lib/select-agent.mjs` for the prompt boundary.

**Intent:** Make the destination explicit through either a flag or a selection question, while retaining the current project option and dependency-free runtime.

**Contract:** Usage becomes `skill-registry <install|status|uninstall> [--project PATH] [--agent AGENT]`. Apply the agreed validation, help, selection, unavailable-terminal, cancellation, and error behavior. Prompt streams must close on success and failure so commands terminate cleanly. Show prompts on the interactive terminal; keep command results available through normal output.

#### 3. Preserve managed installation guarantees

**File:** `lib/manage-skills.mjs`.

**Intent:** Apply the existing lifecycle and protections across the complete update set without affecting unmanaged destinations or unrelated content, including existing `.github` configuration.

**Contract:** Preflight and stage the complete update set before replacing any installed files. Keep backups per destination, including receipts, and retain them until all replacements succeed; restore every affected destination on a recoverable failure. Update shared paths once. Preserve guards against local edits, unmanaged collisions, symlink directories, and non-regular receipts. Missing installations remain no-ops for status and uninstall.

#### 4. Regression coverage

**Files:** `test/install.test.mjs`; new `test/cli.test.mjs`; new `test/select-agent.test.mjs`.

**Intent:** Verify actual target paths, lifecycle behavior, argument handling, and prompt failure cases using temporary projects and controlled streams. Preserve meaningful existing lifecycle coverage.

**Contract:** Cover all five destinations; discovery of legacy receipts; update and rollback of multiple existing installations to the same invoked version; adding a selected destination while updating existing ones; deduplication of shared destination paths; retired skills; and selected-agent-only status/uninstall. Confirm that unselected directories without receipts remain untouched. Verify that an invalid receipt, edit, or conflict in any discovered installation prevents all writes, and inject a recoverable replacement failure to verify restoration of every affected destination and receipt. Preserve unrelated files and reject invalid agents or symlink targets. Exercise the CLI in subprocesses for explicit selection, both option orders, help, invalid actions/options, duplicates, missing values, and unavailable-terminal errors. Exercise the prompt boundary with controlled input for valid, invalid, blank, EOF, and cancelled selections, verifying no writes before a completed selection. Check terminal interaction manually as well.

#### 5. README updates

**File:** `README.md`.

**Intent:** Explain how users install and maintain skills for their chosen agent, including the interactive path and automation requirements.

**Contract:** Update installation, status, update/rollback, uninstall, local trial, and source-control guidance. Include the agent/path table, examples using `--agent claude` and `--agent codex`, combined `--project` usage, an omitted-flag selection example, and CI instructions. Explicitly show that install/update and rollback affect all existing managed destinations even when `--agent` is supplied, whereas status/uninstall target the selection. Explain that plain agent directories without receipts are not adopted automatically and that a conflict in any installation blocks the whole update. Replace assumptions that every receipt and skill lives under `.agents`. Document folder-based replacement, cross-agent discovery and Gemini precedence, preserved overwrite protections, and unchanged skill content. Use actual packaged skill names in examples instead of the currently documented absent `community-change-brief` skill. Link the official discovery documentation below.

### Success Criteria

#### Automated Verification

- All destination and managed-lifecycle tests pass, including legacy receipt compatibility, folder-scoped updates, protection failures, and independent destinations.
- Multi-destination update tests pass, including discovery, shared-path deduplication, all-destination preflight, receipt restoration on failure, and selected-agent-only status/uninstall.
- CLI and prompt tests pass, including omitted-agent behavior, explicit-agent bypass, validation failures, cancellation, and EOF.
- `npm run check` passes.
- `npm test` passes.
- `npm pack --dry-run --ignore-scripts` includes the new runtime modules and existing skills.
- `git diff --check` passes.

#### Manual Verification

- In a disposable project, omit `--agent` for install, status, and uninstall; each asks for one of the five agents. Install reports and updates the complete destination set; status and uninstall operate on the selected path.
- With multiple managed agent installations and an unselected unmanaged agent folder, verify that install updates every managed destination, preserves the unmanaged folder, and deduplicates shared destinations. Edit a managed skill and verify that the next update leaves all installations unchanged.
- Try invalid and blank selections, then a valid selection; cancel a separate invocation and verify that it leaves project files unchanged.
- Run explicit `--agent` commands without an interactive terminal and verify successful targeted operation; omit the flag and verify a useful failure instead of a hang. Check prompting with redirected output when a controlling terminal exists.
- Follow the updated README examples and confirm that paths, receipt behavior, shared-folder limitations, and actual skill names match the implementation.

## Risks and Rollback

- Existing CLI automation that omits `--agent` will need the flag. Document this behavior change prominently; do not silently fall back to Codex.
- Updating or rolling back changes every existing managed destination, including destinations not named by `--agent`. Preview this complete set before mutation and document that independent per-agent version pinning is outside this update policy.
- Multiple discovery roots can expose duplicate or shadowed skills. The installer controls its destination, while each agent controls discovery precedence.
- Terminal availability differs across operating systems and shells. Keep terminal handling behind a small boundary and manually verify interactive behavior on the platforms used by the team.
- Agent discovery paths may evolve. Keep mappings centralized and link official documentation so future changes are easy to verify.
- Reverting this feature restores the old installer, which can manage only `.agents`. Before reverting, use the new installer to uninstall any unwanted installations in other folders; never delete entire agent configuration directories.
- No performance-sensitive service or migration is introduced. Inspect only the five known receipt locations; do not add recursive project scans. Additional staging and backup space scales with the discovered installations.

## References

- [Codex local skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://cursor.com/docs/skills)
- [GitHub Copilot agent skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/skills/)
- Planning structure adapted from `skills/oracle-plan/SKILL.md`; the requested root-level location and single phase take precedence over its default change-folder structure. The overview serves as the brief within this one planning artifact.

## Progress

### Phase 1: Deliver agent-aware installation, tests, and documentation

#### Automated

- [x] 1.1 All destination and managed-lifecycle tests pass, including legacy receipt compatibility, folder-scoped updates, protection failures, and independent destinations.
- [x] 1.2 CLI and prompt tests pass, including omitted-agent behavior, explicit-agent bypass, validation failures, cancellation, and EOF.
- [x] 1.3 `npm run check` passes.
- [x] 1.4 `npm test` passes.
- [x] 1.5 `npm pack --dry-run --ignore-scripts` includes the new runtime modules and existing skills.
- [x] 1.6 `git diff --check` passes.
- [x] 1.11 Multi-destination update tests pass, including discovery, shared-path deduplication, all-destination preflight, receipt restoration on failure, and selected-agent-only status/uninstall.

#### Manual

- [ ] 1.7 In a disposable project, omit `--agent` for install, status, and uninstall; each asks for one of the five agents and operates on the displayed path. For install, verify the complete reported update set as well as the selection.
- [ ] 1.8 Try invalid and blank selections, then a valid selection; cancel a separate invocation and verify that it leaves project files unchanged.
- [ ] 1.9 Run explicit `--agent` commands without an interactive terminal and verify successful targeted operation; omit the flag and verify a useful failure instead of a hang. Check prompting with redirected output when a controlling terminal exists.
- [ ] 1.10 Follow the updated README examples and confirm that paths, receipt behavior, shared-folder limitations, and actual skill names match the implementation.
- [ ] 1.12 With multiple managed agent installations and an unselected unmanaged agent folder, verify that install updates every managed destination, preserves the unmanaged folder, and deduplicates shared destinations. Edit a managed skill and verify that the next update leaves all installations unchanged.
