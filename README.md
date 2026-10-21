# Skill registry

Shared development skills published as the npm package `@francescocentrone/skill-registry` to **GitHub Packages** at `https://npm.pkg.github.com`.

The source repository is `https://github.com/FrancescoCentrone/skill-registry`. The package contains reusable skill folders, so application repositories can consume a released version instead of maintaining their own source copies.

## Local checks

Use Node.js 24 (see `.nvmrc`). There are no third-party dependencies.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

## Publishing through GitHub Actions

The workflow in `.github/workflows/publish.yml` runs when a **stable GitHub release is published**. It checks out that release, validates the skills and requires the release tag to match `package.json`, then publishes to GitHub Packages.

For version `1.0.0`, publish a release tagged `v1.0.0`. Saving a draft release does not publish the package. A normal branch push does not publish it either.

The workflow uses the repository's automatically supplied `GITHUB_TOKEN` with `packages: write`. No publishing PAT or additional repository secret is needed. The workflow must be present in the released commit. If a package with this name already exists, grant this repository access to it in the package settings.

This checkout is prepared locally. Commit and push it yourself when ready; no commit, push, release or package publication has been performed by the setup.

## Demo sequence after uploading the repository

1. Show `skills/community-change-brief/SKILL.md` and the package version.
2. In GitHub, create and publish the stable release `v1.0.0`.
3. Open Actions and watch **Publish skills to GitHub Packages**.
4. Open the package from the repository's Packages section and show version `1.0.0`.
5. After changing a skill, increase the package version and publish a new matching release.

To prepare a compatible update locally after the initial commit:

```sh
npm version minor --no-git-tag-version
npm run check
```

This updates `package.json` and `package-lock.json` to `1.1.0`. Commit the changes, upload them when ready, then publish release `v1.1.0`. Keep previous versions available. Never reuse a published package version.

## Install skills in a new project

These steps are for a developer consuming the published package. The application can use any language and does not need a `package.json` or npm dependencies.

### 1. Check the prerequisites

Install Node.js 24, which includes npm. Version `1.0.0` of `@francescocentrone/skill-registry` must already be published to GitHub Packages. If the package is private, your GitHub account must have permission to read it.

```sh
node --version
npm --version
```

### 2. Authenticate to GitHub Packages

GitHub's npm registry requires authentication even for public packages. Consumers can authenticate with a personal access token (classic) with `read:packages` and permission to read the package:

```sh
npm login --scope=@francescocentrone --auth-type=legacy \
  --registry=https://npm.pkg.github.com
```

Use your GitHub username and the token as the password. Keep credentials in your user configuration, outside this repository. The committed `.npmrc` contains only the registry mapping.

### 3. Install into your project

Open a terminal in the destination project and run:

```sh
cd /path/to/your-project
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@francescocentrone/skill-registry@1.0.0 \
  -- skill-registry install
```

The command runs the package installer from npm's cache. It does not require a `package.json` in the destination project or add npm dependencies to it. The installer writes real skill files into the project:

```text
your-project/
  .agents/
    skill-registry-lock.json
    skills/
      community-change-brief/
        SKILL.md
```

The skills are project-local copies, not links to a user-level installation. The lock file records the version installed in this project.

To install into a different project without changing directory, append `--project /path/to/your-project` after `install`.

### 4. Use the installed skill

Start a fresh AI tool session in this project and invoke the skill. For Codex, use `$community-change-brief` with a request to prepare a change brief. If the newly installed skill is not visible, restart the tool.

Example prompt:

```text
$community-change-brief Read this project's request and prepare a short change brief with affected files and proposed checks. Prepare the brief only.
```

## Maintain the installed skills

### Check the installed version

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@francescocentrone/skill-registry@1.0.0 \
  -- skill-registry status
```

The project receipt records the installed package version and a hash for each managed skill. Status reads that receipt, so its reported version reflects this project's installed files rather than the client version used to run the command.

### Update or roll back

To adopt a published update, select that exact package version and run `install` again:

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@francescocentrone/skill-registry@1.1.0 \
  -- skill-registry install
```

To roll back, use `@1.0.0` in the same command. Each project updates independently. Publishing a new version does not change any project until its user runs the installer.

The installer replaces unchanged skills it previously installed, removes managed skills retired by the selected package, and preserves unrelated skills. It refuses to overwrite an unrelated folder or any managed skill with local edits. Save those edits separately before updating. A rollback changes instructions for future tasks and does not undo work already generated.

### Remove the package skills

```sh
npm exec --yes --registry=https://npm.pkg.github.com \
  --package=@francescocentrone/skill-registry@1.0.0 \
  -- skill-registry uninstall
```

Only unchanged skills listed in the project receipt are removed. Other project skills remain in place.

### Keep generated skills out of application source control

The files live inside the project so the AI tool can discover them. If you want distribution to remain separate from application source, ignore the managed skill folders in the application repository. For this example, add `.agents/skills/community-change-brief/` to that project's ignore rules. You can keep `.agents/skill-registry-lock.json` in version control as a record of the selected release. Do not ignore other project skills unless intended.

### Try the installer before publishing

From this registry checkout:

```sh
node bin/skill-registry.mjs install --project /path/to/your-project
node bin/skill-registry.mjs status --project /path/to/your-project
```

These commands use the local package contents and do not download or publish anything.

New GitHub npm packages initially have private visibility. If you want public distribution, change the package visibility in its settings after the first publication. Repository visibility and package visibility are separate settings.

## Adding another skill

Add `skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter. Keep the folder name equal to the skill name, then run `npm run check`. All skill folders are included in the published package. Version the package whenever the distributed content changes.

## References

- [Publishing Node.js packages with GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages)
- [GitHub Packages npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
