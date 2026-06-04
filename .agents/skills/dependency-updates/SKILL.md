---
name: dependency-updates
description: >
  Checks and upgrades Node.js dependencies for this project. Use when the user
  asks to update, upgrade, check, or look for outdated dependencies, or invokes
  the /update-dependencies command. Supports two modes: "check only" (lists all
  available updates and waits for confirmation) and "upgrade" (applies updates,
  handles minor/patch automatically, and guides the user through breaking
  major-version changes with changelog research and a proposed migration path).
compatibility: Node.js 18+, pnpm
---

## Overview

This skill has two modes — choose based on user intent:

| User intent                                                       | Mode           |
|-------------------------------------------------------------------|----------------|
| "check for updates", "what's outdated", "are there updates?"      | **Check only** |
| "update dependencies", "upgrade packages", `/update-dependencies` | **Upgrade**    |

Always run this skill from the repository root.

---

## Mode A — Check only

Use this mode when the user wants to see what updates are available without
applying them immediately.

### A1 — Gather all available upgrades

```bash
pnpx npm-check-updates --jsonUpgraded
```

Parse the JSON output. If empty (`{}`), inform the user that all dependencies
are up to date and stop.

### A2 — Present the full update list

Classify each package by bump type and display a table:

```
Package              Current    Target    Bump
-------------------  ---------  --------  -------
svelte               4.2.1      5.0.0     MAJOR ⚠️
vite                 5.1.0      5.3.2     minor
typescript           5.3.3      5.4.5     minor
vitest               1.6.0      1.6.1     patch
```

Include a short summary at the top, e.g.:
> 1 major, 2 minor, 1 patch update available.

### A3 — Ask for confirmation

Ask: **"Should I proceed with the upgrade process?"**

- If **yes**: continue with **Mode B** (Upgrade) below.
- If **no**: stop and inform the user no changes were made.

---

## Mode B — Upgrade

Use this mode when the user confirms an upgrade (from Mode A) or directly
asks to update/upgrade dependencies.

### B1 — Discover upgrades (if not already done in Mode A)

```bash
pnpx npm-check-updates --jsonUpgraded
```

If empty, inform the user everything is up to date and stop.

### B2 — Classify upgrades

For each package compare **current** (in `package.json`) vs. **target**:

- **Patch / minor** (`1.2.3 → 1.3.x`): safe to apply automatically.
- **Major** (`1.x.x → 2.0.0`): requires research and user confirmation.

Split into two groups: `autoUpgrades` and `majorUpgrades`.

### B3 — Auto-apply patch/minor upgrades

If `autoUpgrades` is non-empty:

```bash
pnpx npm-check-updates -u --target minor
```

**Special case — `packageManager` field updated:**
If the upgrade touches the `packageManager` field in `package.json` (e.g.
`pnpm@11.1.0 → pnpm@11.1.1`), run `pnpm` once immediately after the
`npm-check-updates` step to let Corepack download the new version:

```bash
pnpm --version
```

Corepack may prompt something like:
```
Do you want to continue? [Y/n]
```

Respond with `Y` and wait for Corepack to finish downloading before continuing.

Then install dependencies:

```bash
pnpm install
```

Then run the verification suite (Step B5). Report results to the user.

### B4 — Research and confirm major upgrades

For each package in `majorUpgrades`:

1. Look up the package on npm / GitHub to find its **CHANGELOG**, **migration
   guide**, or **release notes** for the major version jump.
2. Identify any **breaking changes** relevant to this project (check imports,
   API usage, config files, peer dependency requirements).
3. Summarise findings concisely.

Present the user with:

- A table: `package | current → target | breaking changes summary`
- A concrete **migration plan** (config changes, code edits, peer dep bumps)
- A clear question: **"Should I apply these major upgrades and perform the
  migration? (yes / no / skip individual packages)"**

**Wait for user confirmation before proceeding.**

Apply only confirmed packages:

```bash
pnpx npm-check-updates -u --filter "pkg-a,pkg-b"
pnpm install
```

Then perform any code / config changes from the migration plan.

### B5 — Supply-chain policy check (run after every install)

After every `pnpm install`, immediately inspect `pnpm-workspace.yaml`:

```bash
grep -A20 'minimumReleaseAgeExclude' pnpm-workspace.yaml || echo "none"
```

If pnpm **auto-added** any entries under `minimumReleaseAgeExclude`, those packages
were published too recently and will fail CI's `--frozen-lockfile` check. Treat them
exactly as described in the supply-chain policy error section below:

1. Revert each offending package to its previous version in `package.json`.
2. Remove all auto-added entries from `pnpm-workspace.yaml`.
3. Run `pnpm clean --lockfile && pnpm install` to rebuild the lockfile cleanly.
4. Repeat this check until `minimumReleaseAgeExclude` is empty (or absent).

Only proceed to the verification suite once the section is clean.

### B6 — Verification suite

After every install (B3 and/or B4), run in order:

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:integration
```

- If all pass: report success.
- If any fail: show errors, attempt to fix them (e.g. update deprecated API
  calls, adjust config), re-run the failing command, and repeat until clean
  or until a fix requires user input.

**Supply-chain policy error (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`):**
This error on CI means the `pnpm-workspace.yaml` supply-chain check was bypassed
locally. pnpm silently adds offending packages to `minimumReleaseAgeExclude` during
local installs instead of failing — the B5 check above catches this before commit.
If the error still surfaces (e.g. from a stale lockfile), follow the same steps:

1. Identify the offending packages from the error output.
2. **Exclude those packages from this upgrade task** — revert them to their
   previous versions in `package.json`.
3. Remove any entries pnpm auto-added under `minimumReleaseAgeExclude` in
   `pnpm-workspace.yaml`.
4. Run `pnpm clean --lockfile && pnpm install` to rebuild the lockfile.
5. Inform the user which packages were excluded and why (published within the
   24 h release-age window). They can be picked up in the next upgrade run once
   the window has passed.

---

## Notes

- This project uses **pnpm**. Never use `npm install` or `yarn`.
- All packages belong in `devDependencies` (`pnpm add -D`). SvelteKit/Vite
  bundles everything at build time.
- Integration tests (`pnpm test:integration`) require Podman or Docker. If
  the container runtime is unavailable, skip that step and inform the user.
- If `pnpx npm-check-updates` is not available, ask the user to ensure
  Node.js and pnpm are installed.
