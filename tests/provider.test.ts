import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { HostServices } from "@vibecontrols/plugin-sdk/contract";
import type { SecurityScanInput } from "@vibecontrols/vibe-plugin-security/types";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GitleaksProtectProvider } from "../src/provider.js";
import { GITLEAKS_VERSION } from "../src/tools-manifest.js";

describe("GitleaksProtectProvider", () => {
  test("provider name + stage are stable identifiers", () => {
    const p = new GitleaksProtectProvider();
    expect(p.name).toBe("gitleaks-protect");
    expect(p.stage).toBe("developer.local");
  });

  test("metadata() reports stage + supported profiles + tool version", () => {
    const p = new GitleaksProtectProvider();
    const meta = p.metadata();
    expect(meta.stage).toBe("developer.local");
    expect(meta.supportedProfiles).toContain("backend");
    expect(meta.supportedProfiles).toContain("frontend");
    expect(meta.supportedProfiles).toContain("cli");
    expect(meta.supportedProfiles).toContain("sdk");
    expect(meta.supportedProfiles).toContain("mcp");
    expect(meta.supportedProfiles).not.toContain("chrome-extension");
    expect(meta.toolVersion).toBe(GITLEAKS_VERSION);
    expect(p.toolVersion).toBe(GITLEAKS_VERSION);
  });

  test("metadata description mentions protect mode", () => {
    const meta = new GitleaksProtectProvider().metadata();
    expect(meta.description ?? "").toMatch(/protect/i);
    expect(meta.description ?? "").toMatch(/developer\.local/);
  });

  test("cancel() on an unknown run is a no-op", async () => {
    const p = new GitleaksProtectProvider();
    await expect(p.cancel("nonexistent")).resolves.toBeUndefined();
  });
});

describe("GitleaksProtectProvider.run with fake gitleaks binary", () => {
  let tmpRoot: string;
  let dataDir: string;
  let workdir: string;
  let repoPath: string;
  let originalPath: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gitleaks-protect-test-"));
    dataDir = path.join(tmpRoot, "data");
    workdir = path.join(tmpRoot, "workdir");
    repoPath = path.join(tmpRoot, "repo");
    await fs.mkdir(workdir, { recursive: true });
    await fs.mkdir(repoPath, { recursive: true });

    // Place the fake binary on a temp bin dir, then prepend that dir to PATH
    // so resolveToolPath()'s PATH-probe finds it and accepts its --version.
    // (We don't bother with the sha-verified cache path — that requires
    //  pre-computing a sha256 that matches the manifest pin, which we can't
    //  do for an arbitrary shell script.)
    const toolDir = path.join(tmpRoot, "bin");
    await fs.mkdir(toolDir, { recursive: true });
    const fakeBin = path.join(toolDir, "gitleaks");

    // Minimal SARIF that normalizeSarif() will parse into one finding.
    // Note: no realistic secret strings — just structure.
    const stubSarif = JSON.stringify({
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "gitleaks",
              version: GITLEAKS_VERSION,
              rules: [{ id: "stub-rule", name: "stub-rule" }],
            },
          },
          results: [
            {
              ruleId: "stub-rule",
              level: "error",
              message: { text: "Stub leak detected (test fixture)." },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/config.ts" },
                    region: { startLine: 1, startColumn: 1 },
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    // The fake binary writes the SARIF to whatever path follows
    // --report-path, then exits 0 (gitleaks "found findings, asked to
    // ignore via --exit-code 0" path).
    const script = [
      "#!/usr/bin/env bash",
      "set -e",
      "REPORT=''",
      "while [[ $# -gt 0 ]]; do",
      '  case "$1" in',
      '    --report-path) REPORT="$2"; shift 2;;',
      '    --version) echo "' + GITLEAKS_VERSION + '"; exit 0;;',
      "    *) shift;;",
      "  esac",
      "done",
      'if [[ -n "$REPORT" ]]; then',
      "  cat > \"$REPORT\" <<'EOF'",
      stubSarif,
      "EOF",
      "fi",
      "exit 0",
      "",
    ].join("\n");
    await fs.writeFile(fakeBin, script, { mode: 0o755 });

    // resolveToolPath checks `gitleaks --version` output against the
    // pinned versionMatcher; the script handles --version above so
    // resolution succeeds without re-downloading.
    originalPath = process.env.PATH;
    process.env.PATH = `${toolDir}${path.delimiter}${originalPath ?? ""}`;
  });

  afterEach(async () => {
    process.env.PATH = originalPath ?? "";
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test("parses fake gitleaks SARIF into at least one finding", async () => {
    // Skip if bash is unavailable (e.g. minimal CI image).
    const bashProbe = spawnSync("bash", ["-c", "true"]);
    if (bashProbe.status !== 0) {
      console.warn("[skip] bash not available; cannot run fake-gitleaks integration test");
      return;
    }

    const provider = new GitleaksProtectProvider();
    const host: Partial<HostServices> = {
      getDataDir: () => dataDir,
      logger: {},
    };
    await provider.init(host as HostServices);

    const input: SecurityScanInput = {
      runId: "test-run-1",
      vibeId: "vibe-test",
      workspaceId: "ws-test",
      repoUrl: "https://example.invalid/repo.git",
      repoLocalPath: repoPath,
      commit: "0000000000000000000000000000000000000000",
      stage: "developer.local",
      profile: { kind: "backend", languages: ["typescript"], runtimes: ["bun"] },
      policyLevel: "advisory",
      config: {},
      workdir,
    };

    const result = await provider.run(input);

    expect(result.status).toBe("succeeded");
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0]?.category).toBe("secret");
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0]?.type).toBe("sarif");
  });
});
