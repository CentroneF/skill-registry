# Skill registry

Shared development skills published as the npm package `@centronef/skill-registry` to **GitHub Packages** at `https://npm.pkg.github.com`.

The source repository is `https://github.com/CentroneF/skill-registry`. The package contains reusable skill folders, so application repositories can consume a released version instead of maintaining their own source copies.

## Local checks

Use Node.js 24 (see `.nvmrc`). There are no third-party dependencies.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

## Publishing through GitHub Actions

The workflow in `.github/workflows/publish.yml` runs when a **version tag is pushed**. It checks out the tagged commit, validates the skills and requires the tag to match the stable version in `package.json`, then publishes to GitHub Packages.

To prepare an update, increase the package version and run the checks:

```sh
npm version patch --no-git-tag-version --ignore-scripts
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

Commit the changes, then create and push a matching `v<version>` tag using the version in `package.json`. Never reuse a published package version or an existing tag. A normal branch push does not publish the package. Prerelease versions are not supported.

Open Actions and watch **Publish skills to GitHub Packages** to confirm publication succeeds. The published release is then available through `@latest`. A GitHub release is optional.

The workflow uses the repository's automatically supplied `GITHUB_TOKEN` with `packages: write`. No publishing PAT or additional repository secret is needed. The workflow must be present in the tagged commit. If a package with this name already exists, grant this repository access to it in the package settings.

## Install skills in a new project

The destination project can use any language and does not need a `package.json`. Install Node.js 24 (including npm). The examples below use `@latest` to run the latest published release.

### 1. Authenticate to GitHub Packages

Your GitHub account needs permission to read the package. Authenticate with a personal access token (classic) with `read:packages`:

```sh
npm login --scope=@centronef --auth-type=legacy \
  --registry=https://npm.pkg.github.com
```

Use your GitHub username and the token as the password. Keep credentials in your user configuration, outside this repository.

### 2. Choose an agent and install

From your destination project, run the command below. When `--project` is omitted, skills are installed in the current directory, under the selected agent’s skills folder:

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry install --agent claude
```

Use `--agent codex` for Codex, or select another supported value:

| `--agent` | Agent | Project skills directory | Project receipt |
| --- | --- | --- | --- |
| `codex` | Codex | `.agents/skills` | `.agents/skill-registry-lock.json` |
| `claude` | Claude Code | `.claude/skills` | `.claude/skill-registry-lock.json` |
| `cursor` | Cursor | `.cursor/skills` | `.cursor/skill-registry-lock.json` |
| `copilot` | GitHub Copilot | `.github/skills` | `.github/skill-registry-lock.json` |
| `gemini` | Gemini CLI | `.gemini/skills` | `.gemini/skill-registry-lock.json` |

Omit `--agent` to choose from a numbered list. Install, status, and uninstall all ask when the flag is omitted, even if you previously chose an agent:

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry install
```

Blank or invalid selections ask again. Ctrl-C or end-of-input cancels without changing project files. If an interactive terminal is unavailable, the command exits with instructions to pass `--agent`. **CI and other automation must pass the flag explicitly**. When available, a controlling terminal can be used even with redirected output.

The installer copies real files from npm's cache, without adding dependencies to the destination project. For Claude Code, the result includes:

```text
your-project/
  .claude/
    skill-registry-lock.json
    skills/
      oracle-plan/
        SKILL.md
        references/
      ...
```

All packaged skills are copied unchanged, including their supporting files. The receipt records the installed package version and hashes.

To choose a different project, combine the options in either order:

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry install --project /path/to/your-project --agent codex
```

### 3. Use the installed skill

Start or refresh your agent session in the project. For example, in Codex:

```text
$oracle-plan Plan the requested change, identify affected files, and define verification steps. Prepare the plan only.
```

The installer supports the agents' skill discovery directories. Instructions are unchanged, so agent-specific tools or commands mentioned by a skill still need equivalent capabilities in your agent.

Some agents also read other agents' folders. Cursor and Copilot can discover shared locations such as `.agents/skills` and `.claude/skills`. Gemini reads `.agents/skills` with precedence over `.gemini/skills` for duplicate names. Installing a separate copy does not guarantee exclusive visibility or change which copy an agent loads. See the official discovery documentation in References.

## Maintain the installed skills

### Check the installed version

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry status --agent claude
```

Status reads only the selected destination's receipt and reports its installed version and file state. It does not report the version of the installer used to run the command. Status and uninstall do not create missing installations.

### Update every managed installation

Run `install` again with `@latest` to update to the latest published release:

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry install --agent codex
```

**Install updates every existing managed agent installation in the project, even when `--agent` is supplied.** It also installs into the selected destination if missing. For example, with existing Codex and Claude installations, the command above updates both; selecting Cursor updates both and adds Cursor. The command lists all destinations before replacing files.

Only the five known receipt locations are inspected. An unselected agent directory without a registry receipt is left untouched; its existence alone does not make it managed. When several agents share the same destination, it is updated once using one receipt. Separate destination folders keep separate receipts, but updates synchronize their package versions.

The installer replaces unchanged managed skills, removes managed skills retired by the selected release, and preserves unrelated content, including `.github` configuration. It refuses to overwrite unrelated same-name folders, locally edited managed skills, symlink destinations, or invalid receipts. A conflict in any managed installation blocks the entire update before replacement. A recoverable replacement failure restores all affected skills and receipts. Save local edits separately before updating.

Projects update independently, and publishing alone changes no installation. Run the update command in each project to install the latest release.

### Remove one agent's package skills

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@centronef/skill-registry@latest \
  -- skill-registry uninstall --agent claude
```

Uninstall removes only unchanged managed skills in the selected destination and its receipt. Other destinations and unrelated skills remain. If several agents read the same destination, removing its managed files affects all those readers.

### Keep generated skills out of application source control

Ignore only the managed skill folders under your chosen destinations, for example `.claude/skills/oracle-plan/` and `.agents/skills/oracle-plan/`. Apply the same pattern to the other packaged skill names. You can keep the corresponding `skill-registry-lock.json` files in version control to record the installed release. Do not ignore whole agent configuration directories or unrelated skills unless intended.

### Try the installer before publishing

From this registry checkout:

```sh
node bin/skill-registry.mjs install --project /path/to/your-project --agent claude
node bin/skill-registry.mjs status --project /path/to/your-project --agent claude
node bin/skill-registry.mjs uninstall --project /path/to/your-project --agent claude
```

Omit `--agent` to try the interactive list. These commands use the local package contents and do not download or publish anything. Use a disposable project when trying updates across multiple agents.

New GitHub npm packages initially have private visibility. Repository visibility and package visibility are separate settings.

## Adding another skill

Add `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter. Keep the folder name equal to the skill name, then run `npm run check`. All skill folders are included in the published package. Version the package whenever the distributed content changes.

## References

- [Publishing Node.js packages with GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages)
- [GitHub Packages npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)

- [Codex local skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://cursor.com/docs/skills)
- [GitHub Copilot agent skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/skills/)
