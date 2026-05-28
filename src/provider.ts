/**
 * GitleaksProtectSemgrepProvider — implements SecurityProvider for stage
 * `developer.local`. Wraps `gitleaks protect` (uncommitted-only, fast)
 * + Semgrep `--quick` for a low-latency pre-commit experience.
 *
 * TODO: Wave 2 scaffold — real gitleaks-protect + Semgrep integration
 * is pending. This v1 verifies the tool path resolves and returns a
 * single info finding describing what a real scan would do.
 */
import { createHash } from "node:crypto";
import * as path from "node:path";

import type { HostServices } from "@vibecontrols/plugin-sdk/contract";
import { resolveToolPath } from "@vibecontrols/vibe-plugin-security/tool-installer";
import type {
  NormalizedFinding,
  SecurityProvider,
  SecurityProviderMetadata,
  SecurityScanInput,
  SecurityScanResult,
  SecurityScanSummary,
  SecurityStage,
} from "@vibecontrols/vibe-plugin-security/types";

import { GITLEAKS_VERSION, SEMGREP_VERSION, TOOLS_MANIFEST } from "./tools-manifest.js";

export class GitleaksProtectSemgrepProvider implements SecurityProvider {
  readonly name = "gitleaks-protect-semgrep";
  readonly stage: SecurityStage = "developer.local";
  readonly toolVersion = `gitleaks-protect@${GITLEAKS_VERSION}+semgrep@${SEMGREP_VERSION}`;

  private host?: HostServices;
  private gitleaksPath?: string;

  async init(host: HostServices): Promise<void> {
    this.host = host;
  }

  async ensureToolInstalled(): Promise<void> {
    const dataDir =
      this.host?.getDataDir?.() ?? path.join(process.env.HOME ?? ".", ".boff/vibecontrols");
    const ctx = {
      dataDir,
      log: {
        info: (m: string) => this.host?.logger?.info?.("gitleaks-protect-semgrep-provider", m),
        warn: (m: string) => this.host?.logger?.warn?.("gitleaks-protect-semgrep-provider", m),
        error: (m: string) => this.host?.logger?.error?.("gitleaks-protect-semgrep-provider", m),
      },
    };
    // We only resolve the gitleaks binary here; Semgrep is best-effort
    // (only invoked when Python is on PATH) and is checked at run time.
    this.gitleaksPath = await resolveToolPath(ctx, "gitleaks", TOOLS_MANIFEST.gitleaks);
  }

  async run(input: SecurityScanInput): Promise<SecurityScanResult> {
    const startedAt = Date.now();
    input.onProgress?.({ pct: 10, message: "Verifying gitleaks-protect tool path" });

    try {
      if (!this.gitleaksPath) {
        await this.ensureToolInstalled();
      }
    } catch (err) {
      return {
        runId: input.runId,
        status: "errored",
        findings: [],
        evidence: [],
        durationMs: Date.now() - startedAt,
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        errorReason: `gitleaks-protect-semgrep: tool resolution failed: ${String(err)}`,
      };
    }

    input.onProgress?.({ pct: 100, message: "Stub finding emitted" });

    const fingerprint = createHash("sha256").update(`${this.name}:${input.runId}`).digest("hex");

    const finding: NormalizedFinding = {
      fingerprint,
      ruleId: `${this.name}.stub`,
      title:
        "developer.local: gitleaks-protect-semgrep scaffolded — real scanner integration pending",
      severity: "info",
      category: "secret",
      description:
        "Wave 2 scaffold: when integrated, this provider will run `gitleaks protect` against the uncommitted index (fast, sub-second) and Semgrep `--quick` against changed files when Python is available on PATH. See src/provider.ts TODO.",
      rawProviderRef: JSON.stringify({
        stub: true,
        message: `Real gitleaks-protect integration pending; tool path resolves to ${
          this.gitleaksPath ?? "<unresolved>"
        }.`,
        semgrepVersion: SEMGREP_VERSION,
        gitleaksVersion: GITLEAKS_VERSION,
      }),
    };

    const summary: SecurityScanSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 1 };

    return {
      runId: input.runId,
      status: "succeeded",
      findings: [finding],
      evidence: [],
      durationMs: Date.now() - startedAt,
      summary,
    };
  }

  async cancel(_runId: string): Promise<void> {
    // Stub provider has no in-flight subprocesses to cancel.
  }

  metadata(): SecurityProviderMetadata {
    return {
      stage: this.stage,
      supportedProfiles: [
        "backend",
        "frontend",
        "cli",
        "sdk",
        "mcp",
        "chrome-extension",
        "vscode-extension",
      ],
      toolVersion: this.toolVersion,
      description: "gitleaks-protect + Semgrep --quick for developer.local pre-commit",
    };
  }
}
