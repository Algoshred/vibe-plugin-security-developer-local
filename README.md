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

<!-- VIBECONTROLS_OSS_FOOTER_START -->

---

## About VibeControls

**VibeControls** is the agentic engineering mission control for AI-native teams. Vibe-plugins extend the VibeControls agent with new providers, tools, sessions, tunnels, storage backends, and security stages.

- Website: <https://vibecontrols.com>
- Documentation: <https://docs.vibecontrols.com>
- Plugin SDK: <https://github.com/algoshred/vibecontrols-plugin-sdk>
- All plugins: <https://github.com/algoshred?q=vibe-plugin-&type=all>

## Credits

This plugin builds on the following upstream open-source projects. All trademarks and copyrights remain with their respective owners.

- **Gitleaks** — <https://github.com/gitleaks/gitleaks>
- **Semgrep** — <https://github.com/semgrep/semgrep>

## License

Released under the [MIT License](./LICENSE).

Copyright (c) 2026 Burdenoff Consultancy Services Private Limited, Algoshred Technologies Private Limited, and all its sister companies.

Maintainer: **Vignesh T.V** — <https://github.com/tvvignesh>

**Note**: this plugin is open source under MIT. The `@vibecontrols/agent` runtime that loads and orchestrates plugins is **closed source** and proprietary to Burdenoff Consultancy Services Pvt. Ltd. If you want a fully self-hostable agent, please open an issue or contact the maintainer.

<!-- VIBECONTROLS_OSS_FOOTER_END -->
