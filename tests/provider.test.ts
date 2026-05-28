import { describe, expect, test } from "bun:test";

import { GitleaksProtectSemgrepProvider } from "../src/provider.js";
import { GITLEAKS_VERSION, SEMGREP_VERSION } from "../src/tools-manifest.js";

describe("GitleaksProtectSemgrepProvider", () => {
  test("provider name + stage are stable identifiers", () => {
    const p = new GitleaksProtectSemgrepProvider();
    expect(p.name).toBe("gitleaks-protect-semgrep");
    expect(p.stage).toBe("developer.local");
  });

  test("metadata() reports stage + supported profiles + tool version", () => {
    const p = new GitleaksProtectSemgrepProvider();
    const meta = p.metadata();
    expect(meta.stage).toBe("developer.local");
    expect(meta.supportedProfiles).toContain("backend");
    expect(meta.supportedProfiles).toContain("frontend");
    expect(meta.toolVersion).toBe(
      `gitleaks-protect@${GITLEAKS_VERSION}+semgrep@${SEMGREP_VERSION}`,
    );
    expect(p.toolVersion).toBe(`gitleaks-protect@${GITLEAKS_VERSION}+semgrep@${SEMGREP_VERSION}`);
  });

  test("cancel() on an unknown run is a no-op", async () => {
    const p = new GitleaksProtectSemgrepProvider();
    await expect(p.cancel("nonexistent")).resolves.toBeUndefined();
  });
});
