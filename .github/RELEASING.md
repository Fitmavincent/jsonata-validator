# Releasing

Publishing is automated. You never need to run `vsce` locally, and you never need
to install it globally (that global install is what produced the `EACCES` error —
`npx @vscode/vsce` runs it without touching `/usr/local/lib`).

## The two channels

| Trigger | Workflow | Version | Marketplace channel |
| --- | --- | --- | --- |
| PR opened / pushed against `master` | [`pr-pre-release.yml`](workflows/pr-pre-release.yml) | `1.5.<run number>` | Pre-release |
| Push to `master` | [`release.yml`](workflows/release.yml) | version in `package.json` | Release |

### Why the version numbers look like that

The Marketplace only accepts `major.minor.patch` — semver tags like `1.4.5-beta.1`
are rejected. VS Code auto-updates every user to the **highest** version available,
so a release numbered above a pre-release would silently drag pre-release users back
to stable.

The fix is the scheme VS Code recommends: **even minor = release, odd minor = pre-release.**

- Release lives on `1.4.x`. Bump it in `package.json` as part of your PR.
- Pre-release is derived automatically as `1.5.<github.run_number>` — the run number
  only ever increases, so every push to every PR gets a fresh, ordered version.

Publishing `1.4.5` while `1.5.207` exists is fine: the Marketplace tracks
monotonicity per channel, which is exactly how `ms-python.python`, `GitHub.copilot-chat`
and friends operate.

When you bump the release, move the minor by **two** (`1.4.x` → `1.6.x`) so the
pre-release channel jumps to `1.7.x` and stays ahead.

## Cutting a release

1. Branch off `master`, do the work.
2. Bump `version` in `package.json` (even minor) and add a `CHANGELOG.md` entry.
3. Open the PR. Each push builds, lints, type-checks, tests, and publishes a
   pre-release. Draft PRs build and attach the `.vsix` as an artifact but do not publish.
4. Merge. `release.yml` republishes from `master` as a release, tags `v<version>`,
   and creates a GitHub Release with the `.vsix` attached.

Re-running a release on an already-published version is a no-op, not a failure
(`--skip-duplicate`), so merges that don't bump the version are harmless.

## One-time setup: the `VSCE_PAT` secret

1. Sign in to <https://dev.azure.com> with the Microsoft account that owns the
   `Fitmavincent` publisher.
2. **User settings → Personal access tokens → New Token**.
   - **Organization**: `All accessible organizations`. If that option is gone —
     Azure DevOps stopped issuing new global PATs on 2026-03-15 — pick your single
     organization instead; org-scoped tokens work for publishing.
   - **Scopes**: *Custom defined* → **Show all scopes** → **Marketplace** → **Manage**.
3. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**,
   named `VSCE_PAT`.

A 401 from `vsce publish` almost always means the wrong organization scope or a
missing *Marketplace > Manage* scope.

## Migrating off the PAT

Global PATs are fully decommissioned on **2026-12-01**. Two replacements:

- **Trusted publishing** — `vsce publish --oidc` exchanges a GitHub Actions OIDC
  token for a short-lived Marketplace credential. No secret at all, no Azure
  subscription. Currently only in `@vscode/vsce@next`; once it ships in stable,
  drop the `VSCE_PAT` env block, add `id-token: write` to the job permissions, and
  swap the flag.
- **Microsoft Entra ID** — `vsce publish --azure-credential` after `azure/login`.
  Works today but needs an Azure subscription, a user-assigned managed identity,
  a federated credential, and the identity added to the publisher as Contributor.
