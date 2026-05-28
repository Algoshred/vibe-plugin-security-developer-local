/**
 * GitleaksProtectProvider — implements SecurityProvider for stage
 * `developer.local`.
 *
 * Spawns the pinned Gitleaks binary in `protect` mode (scans
 * uncommitted + staged changes only — much faster than full-history
 * `detect`, which is what the `pull_request.fast` variant uses).
 * Normalizes the SARIF output into NormalizedFinding[]
 * (category: "secret") and returns the SARIF as an evidence artifact.
 *
 * TODO(security): wire Semgrep --quick after Python detection lands —
 * Semgrep ships official MUSL Linux binaries via pip/pipx but no
 * prebuilt darwin/windows binaries; integrating it cleanly needs a
 * PATH-based fallback for `semgrep --version` plus per-file scoping
 * (we only want to scan the changed working-tree files at this stage).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { HostServices } from "@vibecontrols/plugin-sdk/contract";
import { normalizeSarif } from "@vibecontrols/vibe-plugin-security/normalizer";
import { resolveToolPath } from "@vibecontrols/vibe-plugin-security/tool-installer";
import type {
  NormalizedFinding,
  ScanEvidenceArtifact,
  SecurityProvider,
  SecurityProviderMetadata,
  SecurityScanInput,
  SecurityScanResult,
  SecurityScanSummary,
  SecurityStage,
} from "@vibecontrols/vibe-plugin-security/types";

import { GITLEAKS_VERSION, TOOLS_MANIFEST } from "./tools-manifest.js";

interface GitleaksProtectConfig {
  configPath?: string;
  ignorePath?: string;
  extraArgs?: string[];
}

export class GitleaksProtectProvider implements SecurityProvider {
  readonly name = "gitleaks-protect";
  readonly stage: SecurityStage = "developer.local";
  readonly toolVersion = GITLEAKS_VERSION;

  private host?: HostServices;
  private toolPath?: string;
  private active = new Map<string, ChildProcess>();

  async init(host: HostServices): Promise<void> {
    this.host = host;
  }

  async ensureToolInstalled(): Promise<void> {
    const dataDir =
      this.host?.getDataDir?.() ?? path.join(os.homedir(), ".boff/vibecontrols");
    this.toolPath = await resolveToolPath(
      {
        dataDir,
        log: {
          info: (m) => this.host?.logger?.info?.("gitleaks-protect-provider", m),
          warn: (m) => this.host?.logger?.warn?.("gitleaks-protect-provider", m),
          error: (m) => this.host?.logger?.error?.("gitleaks-protect-provider", m),
        },
      },
      "gitleaks",
      TOOLS_MANIFEST.gitleaks,
    );
  }

  async run(input: SecurityScanInput): Promise<SecurityScanResult> {
    if (!this.toolPath) {
      await this.ensureToolInstalled();
    }
    if (!this.toolPath) throw new Error("gitleaks-protect-provider: toolPath unavailable");

    const cfg = (input.config as GitleaksProtectConfig) ?? {};
    const sarifPath = path.join(input.workdir, "gitleaks-protect.sarif");
    const args = [
      "protect",
      "--source",
      input.repoLocalPath,
      "--report-format",
      "sarif",
      "--report-path",
      sarifPath,
      "--no-banner",
      "--staged",
      "--exit-code",
      "0",
    ];
    if (cfg.configPath) args.push("--config", cfg.configPath);
    if (cfg.extraArgs) args.push(...cfg.extraArgs);

    const startedAt = Date.now();
    input.onProgress?.({ pct: 5, message: "Starting Gitleaks protect scan" });

    const result = await this.spawnAndWait(input.runId, args);
    if (result.code !== 0 && result.code !== 1) {
      // gitleaks returns 1 when findings are present (still success for us).
      // Any other non-zero exit indicates a real error.
      return {
        runId: input.runId,
        status: "errored",
        findings: [],
        evidence: [],
        durationMs: Date.now() - startedAt,
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        errorReason: `gitleaks-protect exited ${result.code}: ${result.stderr.slice(0, 500)}`,
      };
    }

    input.onProgress?.({ pct: 80, message: "Parsing SARIF report" });

    let findings: NormalizedFinding[] = [];
    let evidence: ScanEvidenceArtifact[] = [];
    try {
      const raw = await fs.readFile(sarifPath, "utf-8");
      findings = normalizeSarif(raw, this.name, "secret");
      const sha256 = createHash("sha256").update(raw).digest("hex");
      const stat = await fs.stat(sarifPath);
      evidence = [
        {
          type: "sarif",
          localPath: sarifPath,
          sha256,
          sizeBytes: stat.size,
        },
      ];
    } catch (err) {
      // No SARIF produced (no findings; gitleaks may skip writing the file).
      this.host?.logger?.warn?.("gitleaks-protect-provider", `no SARIF produced: ${String(err)}`);
    }

    input.onProgress?.({ pct: 100, message: "Scan complete" });
    const summary: SecurityScanSummary = summarize(findings);

    return {
      runId: input.runId,
      status: "succeeded",
      findings,
      evidence,
      durationMs: Date.now() - startedAt,
      summary,
    };
  }

  async cancel(runId: string): Promise<void> {
    const child = this.active.get(runId);
    if (!child) return;
    try {
      child.kill("SIGTERM");
      // Best-effort SIGKILL after 5s.
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 5000);
    } finally {
      this.active.delete(runId);
    }
  }

  metadata(): SecurityProviderMetadata {
    return {
      stage: this.stage,
      supportedProfiles: ["backend", "frontend", "cli", "sdk", "mcp"],
      toolVersion: this.toolVersion,
      description: "Gitleaks protect (uncommitted-only) for developer.local",
    };
  }

  private spawnAndWait(
    runId: string,
    args: string[],
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    if (!this.toolPath) throw new Error("gitleaks-protect-provider: toolPath unavailable");
    return new Promise((resolve) => {
      const child = spawn(this.toolPath as string, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.active.set(runId, child);
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (b: Buffer) => (stdout += b.toString()));
      child.stderr?.on("data", (b: Buffer) => (stderr += b.toString()));
      child.on("close", (code) => {
        this.active.delete(runId);
        resolve({ code, stdout, stderr });
      });
      child.on("error", (err) => {
        this.active.delete(runId);
        resolve({ code: -1, stdout, stderr: err.message });
      });
    });
  }
}

function summarize(findings: NormalizedFinding[]): SecurityScanSummary {
  const s: SecurityScanSummary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) s[f.severity]++;
  return s;
}
