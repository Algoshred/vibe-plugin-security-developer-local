# @vibecontrols/vibe-plugin-security-developer-local

`@vibecontrols/vibe-plugin-security-developer-local` serves the `developer.local` lifecycle stage. It registers itself with [`@vibecontrols/vibe-plugin-security`](https://www.npmjs.com/package/@vibecontrols/vibe-plugin-security) under the per-stage provider type `security.secrets` (which is shared with the `pull_request.*` secrets variants — see `PROVIDER_TYPE_FOR_STAGE` in the meta plugin) and the provider name `gitleaks-protect-semgrep`. It wraps `gitleaks protect` (uncommitted-only, fast) plus Semgrep `--quick` when Python is available on PATH, for a sub-second pre-commit experience.

Wave 2 scaffold — real tool integration is pending; see `src/provider.ts` TODO.

## Install

```bash
vibe plugin install @vibecontrols/vibe-plugin-security-developer-local
vibe security providers set-default --stage developer.local --provider gitleaks-protect-semgrep
```

The gitleaks binary is downloaded automatically on first use (sha256-verified per platform) into `~/.boff/vibecontrols/agents/<profile>/tools/gitleaks/`. Semgrep is best-effort and only invoked when `semgrep --version` resolves on PATH.

## Behavior (planned)

- `gitleaks protect --staged --no-banner` against the working index — sub-second, never touches commit history.
- Semgrep `--quick --config=p/ci` on changed files — only runs when `python3` + `semgrep` are on PATH.
- Findings normalized to `category: "secret"` with `severity` derived from rule severity.
- All evidence stored under the agent data dir; nothing leaves the host machine.

## Configuration

Per-vibe config (stored in `RepositorySecurityConfig.pluginAssignments["developer.local"].config`):

```yaml
provider: gitleaks-protect-semgrep
config:
  semgrepEnabled: true # default; set false to skip Semgrep entirely
  extraGitleaksArgs: []
  extraSemgrepArgs: []
```

## License

Proprietary — Burdenoff Consultancy Services Pvt. Ltd.
